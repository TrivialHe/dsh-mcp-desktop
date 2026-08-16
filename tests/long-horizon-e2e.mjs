#!/usr/bin/env node
/**
 * Long-horizon E2E (ENGINEERING.md §1 parent-agent delegation model).
 *
 * Architecture under test:
 *   Claude (parent) keeps core reasoning / planning / decisions,
 *   DSH is a delegated subagent runtime executing each child task.
 *
 * The task is deliberately multi-step: Claude must
 *   1. plan on its own,
 *   2. delegate an INVESTIGATION child task to DSH (read 3 modules, report
 *      content + problems),
 *   3. do core reasoning itself (diagnose each module from DSH's report and
 *      decide the fix),
 *   4. delegate a FIX child task to DSH (insert marker comment under each
 *      TODO line),
 *   5. delegate a READ-BACK child task to DSH (return the 3 files),
 *   6. verify the result itself and summarize.
 *
 * DSH invocations are independent stateless processes (no scheduler, no
 * session — ENGINEERING.md §23), so every delegated task must be
 * self-contained; the prompt below forces that.
 *
 * Usage:  DEEPSEEK_API_KEY=sk-... node tests/long-horizon-e2e.mjs
 * Same key/security rules as tests/e2e-headless.mjs.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SERVER_ENTRY = join(HERE, '..', 'dist', 'index.js')

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

const MODULES = [
  {
    file: 'module-a.ts',
    marker: 'module-a',
    body: [
      '// user-facing greeting module',
      '// TODO: greeting should say "hello", not "hi"',
      'export const greeting = "hi"',
      'export function greet(name: string) {',
      '  return `${greeting}, ${name}!`',
      '}',
      '',
    ],
  },
  {
    file: 'module-b.ts',
    marker: 'module-b',
    body: [
      '// counter module',
      '// TODO: maxCount should be 100, not 10',
      'export const maxCount = 10',
      'export function clamp(n: number) {',
      '  return Math.min(n, maxCount)',
      '}',
      '',
    ],
  },
  {
    file: 'module-c.ts',
    marker: 'module-c',
    body: [
      '// label module',
      '// TODO: label should be uppercase "PROD", not lowercase',
      'export const label = "prod"',
      'export function getLabel() {',
      '  return label',
      '}',
      '',
    ],
  },
]

function makeFixture(projectRoot) {
  mkdirSync(join(projectRoot, 'src'), { recursive: true })
  writeFileSync(join(projectRoot, 'README.md'), '# long-horizon-fixture\n', 'utf8')
  for (const m of MODULES) {
    writeFileSync(join(projectRoot, 'src', m.file), m.body.join('\n'), 'utf8')
  }
}

function runClaude({ cwd, prompt, mcpConfigPath, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(
      CLAUDE_CLI,
      [
        '-p',
        prompt,
        '--mcp-config',
        mcpConfigPath,
        '--allowedTools',
        'mcp__dsh__*',
        '--max-turns',
        '30',
        '--output-format',
        'json',
        '--verbose',
      ],
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

const LONG_PROMPT = `这是一个多步骤工程任务，请像资深工程师一样完成。核心推理（规划、分析、决策）必须由你自己完成；所有文件系统操作必须通过 dsh 工具门类委派给 DSH 子代理执行（只读调查用 dsh_investigate，修改文件用 dsh_fix，执行命令用 dsh_execute）。注意：DSH 每次调用是独立的无状态进程（不记得上次调用），所以每次委派给它的子任务描述必须自包含、完整，不要使用"同上""接着上次"这类表述。

项目 src/ 下有 3 个 TypeScript 模块：module-a.ts、module-b.ts、module-c.ts。每个文件都有一个标记为 TODO 的逻辑问题（值不对，注释里说明了应为的值）。

请按以下流程执行：

1. 规划：先简要说明你的执行计划（1-2 句即可，这是你自己做的）。
2. 委派调查：调用 dsh_investigate 一次，子任务为"读取当前项目 src/ 目录下的 module-a.ts、module-b.ts、module-c.ts 三个文件，逐个返回每个文件的完整内容，并指出每个文件的 TODO 注释内容"。
3. 核心推理：根据 DSH 返回的内容，你自己诊断每个模块的问题是什么、正确值应该是什么（这是核心推理，不要委派）。
4. 委派修复：调用 dsh_fix 一次，子任务为"在项目 src/ 目录下三个文件（module-a.ts、module-b.ts、module-c.ts）中，在每个文件的 TODO 注释行的正下方插入一行注释"// fixed-by-claude-<模块名>"（module-a.ts 插入 // fixed-by-claude-module-a，module-b.ts 插入 // fixed-by-claude-module-b，module-c.ts 插入 // fixed-by-claude-module-c），其余内容保持不变。完成后报告每个文件是否修改成功"。
5. 委派读回：调用 dsh_investigate 一次，子任务为"读取项目 src/ 目录下 module-a.ts、module-b.ts、module-c.ts 三个文件的完整内容并返回"。
6. 验证与总结：你自己对照第 5 步读回的内容，逐模块确认"// fixed-by-claude-<模块名>"标记是否存在（这是你的核心推理，不要委派），然后给出最终总结：每个模块的 TODO 是否已处理、文件中实际的 greeting/maxCount/label 值。

不要使用任何其他工具读取或修改文件；所有文件操作只通过 dsh 工具。`

// ── main ─────────────────────────────────────────────────────────────────
const sandbox = join(tmpdir(), `dsh-long-horizon-${process.pid}-${Date.now()}`)
const projectRoot = join(sandbox, 'lh-project')
const mcpConfig = join(sandbox, 'mcp.json')

let failures = 0
const pass = (name) => console.log(`PASS  ${name}`)
const fail = (name, detail) => {
  failures++
  console.log(`FAIL  ${name}\n      ${detail}`)
}

try {
  makeFixture(projectRoot)
  writeFileSync(
    mcpConfig,
    JSON.stringify(
      {
        mcpServers: {
          dsh: {
            command: 'node',
            args: [SERVER_ENTRY],
            env: { DEEPSEEK_API_KEY: API_KEY, DSH_MCP_DEBUG: '1' },
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  )

  const t0 = Date.now()
  const r = await runClaude({
    cwd: projectRoot,
    prompt: LONG_PROMPT,
    mcpConfigPath: mcpConfig,
    timeoutMs: 900_000, // long-horizon: up to 15 min
  })
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  const out = r.stdout + r.stderr
  if (process.env.DUMP_STDOUT) writeFileSync(process.env.DUMP_STDOUT, r.stdout, 'utf8')

  console.log(`\n===== claude exited=${r.code} timedOut=${r.timedOut} elapsed=${elapsed}s =====`)
  if (r.timedOut) fail('Long-horizon (plan → investigate → decide → fix → verify)', 'claude timed out')
  else if (r.error) fail('Long-horizon (plan → investigate → decide → fix → verify)', r.error)
  else {
    // 1) files actually modified on disk
    const fixed = []
    const missing = []
    for (const m of MODULES) {
      const p = join(projectRoot, 'src', m.file)
      const content = readFileSync(p, 'utf8')
      const marker = `// fixed-by-claude-${m.marker}`
      const todoIdx = content.indexOf('// TODO:')
      const markerIdx = content.indexOf(marker)
      if (markerIdx >= 0 && todoIdx >= 0 && markerIdx > todoIdx) fixed.push(m.file)
      else missing.push(`${m.file} (todoIdx=${todoIdx} markerIdx=${markerIdx})`)
    }
    if (missing.length === 0) pass('DSH fix task: all 3 modules marked under TODO line')
    else fail('DSH fix task: all 3 modules marked under TODO line', `missing: ${missing.join('; ')}`)

    // 2) claude finished with a summary (did not hang or give up)
    if (!r.timedOut && r.code === 0 && out.includes('fixed-by-claude'))
      pass('Claude completed the multi-step task and reported')
    else
      fail('Claude completed the multi-step task and reported', `out=${out.slice(0, 400)}`)

    // 2b) extract the actual delegation trace + final result from the stream
    //     (claude --output-format json emits one big JSON array of events)
    const delegations = []
    let finalResult = '(no result entry found in stream)'
    const events = []
    try {
      events.push(...JSON.parse(r.stdout.trim()))
    } catch {
      // fall back to per-line JSONL
      for (const line of r.stdout.split('\n')) {
        try { events.push(JSON.parse(line)) } catch { /* skip */ }
      }
    }
    for (const item of events) {
      if (item?.type === 'assistant' && Array.isArray(item.message?.content)) {
        for (const block of item.message.content) {
          if (block?.type === 'tool_use' && String(block.name).startsWith('mcp__dsh__')) {
            const task = String(block.input?.task ?? '')
            delegations.push(task.length > 160 ? task.slice(0, 160) + '…' : task)
          }
        }
      } else if (item?.type === 'result') {
        finalResult = item.result ?? item.resultText ?? JSON.stringify(item)
      }
    }
    console.log(`\n---- dsh tool calls in stream: ${delegations.length} ----`)
    delegations.forEach((t, i) => console.log(`  #${i + 1} ${t}`))
    if (delegations.length < 2)
      fail('multi-step: more than one delegation', `got ${delegations.length}`)

    // 3) show what claude actually said
    console.log('\n===== claude final result =====')
    console.log(String(finalResult).slice(0, 4000))
  }
} finally {
  rmSync(sandbox, { recursive: true, force: true }) // also removes mcp.json (API key)
}

console.log(failures === 0 ? '\nLONG-HORIZON E2E PASSED' : `\n${failures} LONG-HORIZON CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
