/**
 * MCP server wiring: exposes the dsh tool family (§15).
 *
 * Deliberately thin (§2): no task planning, no memory, no session state.
 * Every call resolves the DSH checkout fresh (a couple of existsSync checks),
 * so a DSH repo built *after* the server started still works, and failures
 * surface as actionable tool errors instead of a dead server.
 *
 * Tool family, split by responsibility so the parent agent can pick by
 * intent (tool name + description are the model's decision input):
 *   - delegate_to_dsh  — generic, no constraints (backwards compatible)
 *   - dsh_investigate  — read-only analysis (constraint enforced via task
 *     template; the CLI has no read-only flag, see change-tracker.ts for
 *     how violations get caught instead)
 *   - dsh_fix          — modify code, then verify and report
 *   - dsh_execute      — run commands, report output
 *   - dsh_status       — diagnostics, no DSH child process, no API key
 *     required (it is the only tool that works when the key is missing)
 *
 * Every delegation returns the DSH output plus a trailing `[mcp]` block
 * (exitCode / durationMs / cwd / changedFiles) — workspace change tracking
 * lifts the black box: the parent learns what a delegation touched.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { CliDshRunner, DshRunError, type DshRunner } from './dsh-runner.ts'
import { resolveDsh } from './resolve-dsh.ts'
import { resolveWorkspace } from './resolve-workspace.ts'
import {
  diffSnapshots,
  snapshotWorkspace,
  type ChangeEntry,
} from './change-tracker.ts'

// ---------------------------------------------------------------------------
// Tool schemas & descriptions
// ---------------------------------------------------------------------------

const DELEGATION_SCHEMA = z.object({
  task: z
    .string()
    .min(1)
    .describe('A self-contained task to delegate to DeepSeek Harness.'),
  cwd: z
    .string()
    .optional()
    .describe(
      'Optional absolute workspace path. Usually omit this when running from Claude Code.',
    ),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Per-call timeout in milliseconds; overrides DSH_MCP_TIMEOUT_MS for this call. Omit to use the configured default (no timeout by default).',
    ),
  trackChanges: z
    .boolean()
    .optional()
    .describe(
      'Snapshot the workspace before and after the delegation and report which files changed. Defaults to true.',
    ),
})

type DelegationArgs = z.infer<typeof DELEGATION_SCHEMA>

const GENERIC_TOOL_DESCRIPTION = `Delegate an independent coding, analysis, debugging, research, or repository
task to a local DeepSeek Harness agent.

The delegated DSH agent runs autonomously inside the current Claude Code
project workspace and returns its final result when complete.

Use this tool for self-contained subtasks that can be executed independently.
The delegated agent may inspect files, run commands, and modify files according
to the task instructions.`

// Task template prefixes — the CLI has no read-only/exec-mode flag, so each
// category pins its constraints (and expected delivery) in the task text.
const INVESTIGATE_PREFIX = `这是一次只读调查任务。严格禁止：修改任何文件、运行有副作用的命令（安装依赖、构建、写文件、网络请求）。只允许读取、搜索、分析，然后报告你的发现。`

const FIX_PREFIX = `这是一次修改任务。先分析定位问题，再实施修改。修改完成后，运行任务中指定的验证命令并报告输出；如果任务没有指定验证命令，自行检查改动的一致性。最后列出你修改过的每个文件。`

const EXECUTE_PREFIX = `这是一次命令执行任务。运行指定的命令，报告完整的输出和退出码。除非任务明确要求，否则不要修改任何源代码文件。`

export interface DelegateToolDef {
  name: string
  title: string
  description: string
  promptPrefix?: string
}

export const DELEGATE_TOOLS: DelegateToolDef[] = [
  {
    name: 'delegate_to_dsh',
    title: 'Delegate task to DeepSeek Harness',
    description: GENERIC_TOOL_DESCRIPTION,
  },
  {
    name: 'dsh_investigate',
    title: 'Investigate (read-only) via DeepSeek Harness',
    description: `Read-only investigation on the local DeepSeek Harness agent: read files,
search the repository, trace call flows, and report findings with line
numbers. The agent is instructed not to modify anything and not to run
commands with side effects. Use this for analysis, audits, and "find where
X is used" questions.`,
    promptPrefix: INVESTIGATE_PREFIX,
  },
  {
    name: 'dsh_fix',
    title: 'Fix / modify code via DeepSeek Harness',
    description: `Modify code on the local DeepSeek Harness agent: fix bugs, refactor,
migrate, or implement a well-specified change. The agent analyzes first,
applies the change, runs the verification command from the task (if any),
and lists every file it modified. Use this when the workspace must change.`,
    promptPrefix: FIX_PREFIX,
  },
  {
    name: 'dsh_execute',
    title: 'Execute commands via DeepSeek Harness',
    description: `Run commands on the local DeepSeek Harness agent: test suites, build
scripts, or environment queries. The agent reports the full output and
exit code and is instructed not to touch source files unless the task
explicitly asks. Use this for "run the tests and report" style work.`,
    promptPrefix: EXECUTE_PREFIX,
  },
]

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

/** Pure task composition — exported for unit testing. */
export function composeTask(promptPrefix: string | undefined, task: string): string {
  return promptPrefix ? `${promptPrefix}\n\n${task}` : task
}

export interface CreateServerOptions {
  /** Absolute path of the built DSH CLI artifact (injected in tests). */
  cliPath?: string
  /** Extra env merged over process.env (injected in tests). */
  env?: NodeJS.ProcessEnv
  /** Server version reported over MCP; defaults to the package version. */
  version?: string
}

/**
 * Create the MCP server exposing the dsh tool family.
 *
 * @param options - test seam: when `cliPath` is given, DSH resolution is
 *   bypassed so the runner can be pointed at a fake CLI.
 */
export function createDshMcpServer(options: CreateServerOptions = {}): McpServer {
  const server = new McpServer(
    { name: 'dsh-mcp', version: options.version ?? '0.1.0' },
    { capabilities: { tools: {} } },
  )

  for (const def of DELEGATE_TOOLS) {
    server.registerTool(
      def.name,
      { title: def.title, description: def.description, inputSchema: DELEGATION_SCHEMA },
      (args: DelegationArgs) => runDelegation(options, args, def.promptPrefix),
    )
  }

  server.registerTool(
    'dsh_status',
    {
      title: 'DeepSeek Harness environment status',
      description: `Diagnostic tool (no DSH child process, no side effects): reports the
resolved DSH root and CLI path, CLI version, the configured model from
DSH settings, the resolved workspace, the effective timeout, and whether
DEEPSEEK_API_KEY is configured (never prints the key itself). Use this
first when a delegation fails or the server seems unhealthy.`,
      inputSchema: z.object({}),
    },
    () => runStatus(options),
  )

  return server
}

/**
 * Runner factory kept behind a tiny seam so tests can inject a fake runner
 * (ENGINEERING.md §19) — today it always constructs `CliDshRunner`.
 */
export function createRunner(
  cliPath: string,
  timeoutMs: number,
  env?: NodeJS.ProcessEnv,
): DshRunner {
  return new CliDshRunner({ cliPath, timeoutMs, env })
}

/** Exported for direct unit-testing of the delegation handler. */
export function createDelegateHandler(
  options: CreateServerOptions = {},
): (args: DelegationArgs) => Promise<ToolResult> {
  return (args: DelegationArgs) => runDelegation(options, args, undefined)
}

/** Exported for direct unit-testing of the status handler. */
export function createStatusHandler(
  options: CreateServerOptions = {},
): () => Promise<ToolResult> {
  return () => runStatus(options)
}

// ---------------------------------------------------------------------------
// Delegation handler
// ---------------------------------------------------------------------------

interface DelegationMeta {
  durationMs: number
  workspace: string
  changes: ChangeEntry[]
}

async function runDelegation(
  options: CreateServerOptions,
  args: DelegationArgs,
  promptPrefix: string | undefined,
): Promise<ToolResult> {
  const startedAt = Date.now()

  // Workspace first: the most actionable error, and cheap.
  let workspace: string
  try {
    workspace = resolveWorkspace(args.cwd)
  } catch (error) {
    return errorResult(String((error as Error).message))
  }

  // Never touch the API key inside tool arguments (§17).
  if (!process.env.DEEPSEEK_API_KEY) {
    return errorResult(
      `DEEPSEEK_API_KEY is not configured.\n\n` +
        `Configure it in the Claude Code MCP environment and restart the MCP server.`,
    )
  }

  let cliPath: string
  if (options.cliPath !== undefined) {
    cliPath = options.cliPath
  } else {
    try {
      cliPath = resolveDsh().cliPath
    } catch (error) {
      return errorResult(String((error as Error).message))
    }
  }

  const envTimeoutMs = parseTimeout(process.env.DSH_MCP_TIMEOUT_MS)
  // Per-call timeout overrides the environment default; the runner keeps the
  // env default as its own fallback.
  const callTimeoutMs = args.timeoutMs ?? envTimeoutMs
  const runner: DshRunner = createRunner(cliPath, envTimeoutMs, options.env)

  // Lift the black box: snapshot the workspace before the delegation runs.
  // Default on; DSH_MCP_TRACK_CHANGES=0 disables it for large repositories.
  let before: Map<string, string> | null = null
  if (args.trackChanges !== false && process.env.DSH_MCP_TRACK_CHANGES !== '0') {
    try {
      before = await snapshotWorkspace(workspace)
    } catch {
      before = null // change tracking is best-effort
    }
  }

  const task = composeTask(promptPrefix, args.task)

  try {
    const result = await runner.run({ task, cwd: workspace, timeoutMs: callTimeoutMs })
    const durationMs = Date.now() - startedAt
    const changes = before === null ? [] : await diffAfter(before, workspace)
    if (result.exitCode === 0) {
      return successResult(result.stdout.trim(), {
        durationMs,
        workspace,
        changes,
      })
    }
    return errorResult(
      `DSH exited with code ${result.exitCode}\n\n` + result.stderr.trim(),
    )
  } catch (error) {
    if (error instanceof DshRunError) {
      const detail = error.stderr.trim()
      return errorResult(`${error.message}${detail ? `\n\n${detail}` : ''}`)
    }
    return errorResult(String((error as Error).message))
  }
}

async function diffAfter(
  before: Map<string, string>,
  workspace: string,
): Promise<ChangeEntry[]> {
  try {
    return diffSnapshots(before, await snapshotWorkspace(workspace))
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Status handler
// ---------------------------------------------------------------------------

async function runStatus(options: CreateServerOptions): Promise<ToolResult> {
  const lines: string[] = []

  try {
    const { dshRoot, cliPath } =
      options.cliPath !== undefined
        ? { dshRoot: '(injected in tests)', cliPath: options.cliPath }
        : resolveDsh()
    lines.push('DSH: found', `  root: ${dshRoot}`, `  cli: ${cliPath}`)
    lines.push(`  version: ${readCliVersion(cliPath)}`)
    lines.push(`  model: ${readModelConfig()}`)
  } catch (error) {
    lines.push(`DSH: not found\n\n${String((error as Error).message)}`)
  }

  try {
    lines.push(`workspace: ${resolveWorkspace()}`)
  } catch (error) {
    lines.push(`workspace: <error>\n\n${String((error as Error).message)}`)
  }

  const timeoutMs = parseTimeout(process.env.DSH_MCP_TIMEOUT_MS)
  lines.push(
    `timeout: ${timeoutMs === 0 ? '0 (no timeout)' : `${timeoutMs} ms`}`,
  )

  // Report presence only — the key itself never appears anywhere (§17).
  lines.push(`apiKey: ${process.env.DEEPSEEK_API_KEY ? 'configured' : 'missing'}`)

  return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
}

function readCliVersion(cliPath: string): string {
  try {
    const result = spawnSync(process.execPath, [cliPath, '-V'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    })
    if (result.status === 0) {
      const output = String(result.stdout ?? '').trim()
      return output || 'unknown'
    }
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Parse `agent-default-model:` from the DSH settings.yaml by line scanning
 * (no yaml dependency). Returns a compact `provider=x model=y` summary.
 */
function readModelConfig(): string {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  let content: string
  try {
    content = readFileSync(join(home, 'settings.yaml'), 'utf8')
  } catch {
    return 'unavailable'
  }

  const fields: string[] = []
  let inside = false
  for (const raw of content.split(/\r?\n/)) {
    if (inside) {
      if (raw.trim().length === 0 || !/^[ \t]/.test(raw)) {
        inside = false // block ended at next top-level key
        continue
      }
      const m = raw.trim().match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
      if (m) fields.push(`${m[1]}=${m[2]}`)
      continue
    }
    if (raw.trim() === 'agent-default-model:') inside = true
  }
  return fields.length > 0 ? fields.join(' ') : 'unparsed'
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
  // The SDK's result union carries an index signature; an explicit interface
  // without one fails the structural check (TS2769), so allow extra keys.
  [key: string]: unknown
}

function successResult(stdout: string, meta: DelegationMeta): ToolResult {
  const lines: string[] = []
  if (stdout.length > 0) lines.push(stdout, '')
  lines.push(
    `[mcp] exitCode: 0`,
    `[mcp] durationMs: ${meta.durationMs}`,
    `[mcp] cwd: ${meta.workspace}`,
  )
  if (meta.changes.length === 0) {
    lines.push('[mcp] changedFiles: 0')
  } else {
    lines.push(`[mcp] changedFiles: ${meta.changes.length}`)
    for (const change of meta.changes) {
      const tag = change.action === 'added' ? 'A' : change.action === 'deleted' ? 'D' : 'M'
      lines.push(`[mcp]   ${tag} ${change.path}  (${change.action})`)
    }
  }
  return { content: [{ type: 'text', text: lines.join('\n') }] }
}

function errorResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true }
}

function parseTimeout(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 0
  const ms = Number(raw)
  return Number.isFinite(ms) && ms > 0 ? ms : 0
}
