/**
 * MCP server wiring: registers the single `delegate_to_dsh` tool.
 *
 * Deliberately thin (§2): no task planning, no memory, no session state.
 * Every call resolves the DSH checkout fresh (a couple of existsSync checks),
 * so a DSH repo built *after* the server started still works, and failures
 * surface as actionable tool errors instead of a dead server.
 */

import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { CliDshRunner, DshRunError, type DshRunner } from './dsh-runner.ts'
import { resolveDsh } from './resolve-dsh.ts'
import { resolveWorkspace } from './resolve-workspace.ts'

const TOOL_DESCRIPTION = `Delegate an independent coding, analysis, debugging, research, or repository
task to a local DeepSeek Harness agent.

The delegated DSH agent runs autonomously inside the current Claude Code
project workspace and returns its final result when complete.

Use this tool for self-contained subtasks that can be executed independently.
The delegated agent may inspect files, run commands, and modify files according
to the task instructions.`

const TOOL_INPUT_SCHEMA = z.object({
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
})

export interface CreateServerOptions {
  /** Absolute path of the built DSH CLI artifact (injected in tests). */
  cliPath?: string
  /** Extra env merged over process.env (injected in tests). */
  env?: NodeJS.ProcessEnv
  /** Server version reported over MCP; defaults to the package version. */
  version?: string
}

/**
 * Create the MCP server exposing `delegate_to_dsh`.
 *
 * @param options - test seam: when `cliPath` is given, DSH resolution and
 *   the API-key check are bypassed so the runner can be pointed at a fake.
 */
export function createDshMcpServer(options: CreateServerOptions = {}): McpServer {
  const server = new McpServer(
    { name: 'dsh-mcp', version: options.version ?? '0.1.0' },
    { capabilities: { tools: {} } },
  )

  server.registerTool(
    'delegate_to_dsh',
    {
      title: 'Delegate task to DeepSeek Harness',
      description: TOOL_DESCRIPTION,
      inputSchema: TOOL_INPUT_SCHEMA,
    },
    async ({ task, cwd }) => {
      // Workspace first: the most actionable error, and cheap.
      let workspace: string
      try {
        workspace = resolveWorkspace(cwd)
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

      const timeoutMs = parseTimeout(process.env.DSH_MCP_TIMEOUT_MS)
      const runner: DshRunner = createRunner(cliPath, timeoutMs, options.env)

      try {
        const result = await runner.run({ task, cwd: workspace })
        if (result.exitCode === 0) {
          return {
            content: [{ type: 'text' as const, text: result.stdout.trim() }],
          }
        }
        return errorResult(
          `DSH exited with code ${result.exitCode}\n\n` + result.stderr.trim(),
        )
      } catch (error) {
        if (error instanceof DshRunError) {
          const detail = error.stderr.trim()
          return errorResult(
            `${error.message}${detail ? `\n\n${detail}` : ''}`,
          )
        }
        return errorResult(String((error as Error).message))
      }
    },
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

function parseTimeout(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 0
  const ms = Number(raw)
  return Number.isFinite(ms) && ms > 0 ? ms : 0
}

function errorResult(text: string): {
  isError: boolean
  content: Array<{ type: 'text'; text: string }>
} {
  return { isError: true, content: [{ type: 'text', text }] }
}
