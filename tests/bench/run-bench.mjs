#!/usr/bin/env node
/**
 * A/B benchmark driver: dsh-mcp plugin vs raw Claude, on 20 long-horizon
 * multi-file tasks (tests/bench/tasks.mjs).
 *
 *   Arm A (plugin):   claude sees ONLY mcp__dsh__delegate_to_dsh; every file
 *                     operation is delegated to DSH (parent-agent model).
 *   Arm B (baseline): claude uses native Read/Write/Edit/Glob/Grep/Bash.
 *
 * Metrics per task: pass/fail (automated ground-truth verify) + wall time.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... node tests/bench/run-bench.mjs        # both arms
 *   DEEPSEEK_API_KEY=sk-... node tests/bench/run-bench.mjs B      # one arm
 *   DEEPSEEK_API_KEY=sk-... node tests/bench/run-bench.mjs AB 01,09
 *
 * Key security rule (same as tests/e2e-headless.mjs): the API key only
 * lives in a temp mcp.json that is deleted before exit; results never
 * contain the key.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BENCH_TASKS } from './tasks.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SERVER_ENTRY = join(HERE, '..', '..', 'dist', 'index.js')
const RESULTS_DIR = join(HERE, 'results')
mkdirSync(RESULTS_DIR, { recursive: true })

const API_KEY = process.env.DEEPSEEK_API_KEY
if (!API_KEY) {
  console.error('FAIL: DEEPSEEK_API_KEY is not set.')
  process.exit(1)
}
if (!existsSync(SERVER_ENTRY)) {
  console.error(`FAIL: dsh-mcp is not built (missing ${SERVER_ENTRY}). Run: npm run build`)
  process.exit(1)
}

function resolveClaudeCli() {
  const base = process.env.APPDATA && join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code')
  const candidates = [
    base && join(base, 'bin', 'claude.exe'),
    base && join(base, 'cli.js'),
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(`claude CLI not found. Looked in:\n${candidates.map((c) => '  ' + c).join('\n')}`)
}
const CLAUDE_CLI = resolveClaudeCli()

const ARMS = {
  A: {
    name: 'A:with-dsh-mcp',
    promptSuffix:
      '\n\n要求：不要自己读取或修改任何文件，不要使用除 dsh 工具（delegate_to_dsh / dsh_investigate / dsh_fix / dsh_execute / dsh_status）之外的任何工具。所有文件操作（读取、修改、运行命令验证）都必须通过 dsh 工具委派给 DSH 子代理完成。DSH 每次调用是独立无状态的进程，因此每次委派给它的子任务描述必须完整自包含（包含所需路径与全部上下文），不要使用"同上"或"接着上次"。',
    args: (mcpPath) => [
      '--mcp-config', mcpPath,
      '--allowedTools', 'mcp__dsh__*',
    ],
    needsMcp: true,
  },
  B: {
    name: 'B:raw-claude',
    promptSuffix: '\n\n请完成任务。',
    args: () => [
      '--allowedTools', 'Read,Write,Edit,Glob,Grep,Bash',
      '--permission-mode', 'acceptEdits',
    ],
    needsMcp: false,
  },
}

function runClaude({ cwd, prompt, extraArgs, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(
      CLAUDE_CLI,
      ['-p', prompt, '--output-format', 'json', '--max-turns', '30', ...extraArgs],
      { cwd, env: process.env, shell: false, windowsHide: true },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c) => (stdout += c.toString('utf8')))
    child.stderr.on('data', (c) => (stderr += c.toString('utf8')))
    const timer = setTimeout(() => {
      child.kill()
      resolve({ stdout, stderr, code: null, timedOut: true })
    }, timeoutMs)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, code, timedOut: false })
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, code: null, error: String(error) })
    })
  })
}

// ── concurrency pool ────────────────────────────────────────────────────
const CONCURRENCY = Math.max(1, Number(process.env.BENCH_CONCURRENCY ?? 5))

// Windows: the claude child process may still hold file handles for a few
// ticks after close, so rmSync can fail with EPERM. Retry with backoff.
async function rmRetry(dir, attempts = 6) {
  for (let i = 0; i < attempts; i++) {
    try {
      rmSync(dir, { recursive: true, force: true })
      return
    } catch (e) {
      if (i === attempts - 1) throw e
      await new Promise((r) => setTimeout(r, 300 * (i + 1)))
    }
  }
}

async function runOne(mode, arm, task) {
  // Windows-safe dir name (arm.name contains ':')
  const taskDir = join(sandbox, `${mode}-${task.id}`)
  mkdirSync(join(taskDir, 'src'), { recursive: true })
  mkdirSync(join(taskDir, 'tests'), { recursive: true })
  for (const [path, content] of Object.entries(task.files)) {
    const full = join(taskDir, path)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content, 'utf8')
  }
  let mcpPath = null
  if (arm.needsMcp) {
    mcpPath = join(taskDir, 'mcp.json')
    writeFileSync(
      mcpPath,
      JSON.stringify({
        mcpServers: {
          dsh: {
            command: 'node',
            args: [SERVER_ENTRY],
            env: { DEEPSEEK_API_KEY: API_KEY },
          },
        },
      }, null, 2),
      'utf8',
    )
  }

  const prompt = task.issue + arm.promptSuffix
  const t0 = Date.now()
  const r = await runClaude({ cwd: taskDir, prompt, extraArgs: arm.args(mcpPath), timeoutMs: 600_000 })
  const seconds = ((Date.now() - t0) / 1000).toFixed(1)

  let verdict = { ok: false, detail: '' }
  if (r.timedOut) verdict = { ok: false, detail: 'claude timed out (600s)' }
  else if (r.error) verdict = { ok: false, detail: `claude error: ${r.error}` }
  else if (r.code !== 0) verdict = { ok: false, detail: `claude exit ${r.code}: ${r.stderr.slice(0, 300)}` }
  else verdict = await task.verify(taskDir)

  // cleanup per-task fixture (removes mcp.json containing the key)
  await rmRetry(taskDir)

  return {
    mode: arm.name,
    task: task.id,
    pass: verdict.ok,
    seconds: Number(seconds),
    detail: verdict.detail,
    claudeExit: r.code,
    timedOut: !!r.timedOut,
  }
}

async function pool(items, worker, size) {
  let i = 0
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++]
      await worker(item)
    }
  })
  await Promise.all(runners)
}

// ── main ────────────────────────────────────────────────────────────────
const [modesArg, filterArg] = process.argv.slice(2)
const modes = (modesArg ?? 'AB')
  .split('')
  .filter((m) => m === 'A' || m === 'B')
// Filter supports exact ids ("01,09") and numeric ranges ("51-100").
const filter = filterArg
  ? new Set(
      filterArg.split(',').flatMap((p) => {
        if (p.includes('-')) {
          const [a, b] = p.split('-').map(Number)
          return BENCH_TASKS.filter((t) => {
            const n = parseInt(t.id, 10)
            return n >= a && n <= b
          }).map((t) => t.id)
        }
        return [p]
      }),
    )
  : null
const tasks = BENCH_TASKS.filter((t) => !filter || filter.has(t.id))

const sandbox = join(tmpdir(), `dsh-bench-${process.pid}-${Date.now()}`)
mkdirSync(sandbox, { recursive: true })

const results = []
const done = new Set()

// BENCH_RESUME=1: load existing results and skip already-finished (arm, task)
// pairs. Lets an interrupted run continue without re-burning API budget.
if (process.env.BENCH_RESUME === '1') {
  for (const file of ['A.json', 'B.json']) {
    const p = join(RESULTS_DIR, file)
    if (!existsSync(p)) continue
    const prev = JSON.parse(readFileSync(p, 'utf8'))
    for (const r of prev) {
      results.push(r)
      done.add(r.mode + '|' + r.task)
    }
  }
  if (results.length) console.log(`BENCH_RESUME=1: loaded ${results.length} existing result(s), skipping them`)
}

const writeResults = (armName) => {
  const file = armName === ARMS.A.name ? 'A.json' : 'B.json'
  writeFileSync(
    join(RESULTS_DIR, file),
    JSON.stringify(results.filter((r) => r.mode === armName), null, 2),
    'utf8',
  )
}

for (const mode of modes) {
  const arm = ARMS[mode]
  console.log(`\n========== Arm ${arm.name} (${tasks.length} tasks, concurrency ${CONCURRENCY}) ==========`)
  let pass = results.filter((r) => r.mode === arm.name && r.pass).length
  await pool(
    tasks,
    async (task) => {
      if (done.has(arm.name + '|' + task.id)) {
        console.log(`SKIP  [${arm.name}] ${task.id} (already in results)`)
        return
      }
      const res = await runOne(mode, arm, task)
      if (res.pass) pass++
      results.push(res)
      writeResults(arm.name)
      console.log(
        `${res.pass ? 'PASS' : 'FAIL'}  [${arm.name}] ${res.task}  ${res.seconds}s  ${res.detail}`,
      )
    },
    CONCURRENCY,
  )
  const armResults = results.filter((x) => x.mode === arm.name)
  const passRate = (pass / tasks.length) * 100
  const avg = armResults.reduce((s, x) => s + x.seconds, 0) / tasks.length
  const total = armResults.reduce((s, x) => s + x.seconds, 0)
  console.log(
    `---- ${arm.name}: ${pass}/${tasks.length} passed (${passRate.toFixed(0)}%)  avg ${avg.toFixed(1)}s  total ${total.toFixed(0)}s`,
  )
}

try {
  await rmRetry(sandbox) // removes any leftover mcp.json (key)
} catch (e) {
  console.warn(`WARN: sandbox cleanup failed (leftover in tmp): ${e.message}`)
}
console.log('\nResults written to tests/bench/results/*.json')
