#!/usr/bin/env node
/**
 * Automated Claude Code headless E2E (ENGINEERING.md §28 Test A/B/C).
 *
 * Drives the real chain:  claude -p  →  MCP stdio  →  delegate_to_dsh
 *                       →  real DSH headless  →  real DeepSeek API.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... node tests/e2e-headless.mjs
 *
 * Requirements:
 *   - claude CLI installed (npm global @anthropic-ai/claude-code)
 *   - a DSH CLI discoverable by dsh-mcp (sibling/child checkout or
 *     installed under %USERPROFILE%\.dsh)
 *   - DEEPSEEK_API_KEY in the environment (never passed on argv)
 *
 * The API key only ever lives in a temporary mcp.json that is deleted
 * before the script exits; nothing is written inside this repo.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

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

/**
 * Resolve the claude CLI binary (native bin\claude.exe in current builds,
 * node cli.js in older ones), avoiding .cmd/shell issues.
 * Windows npm global layout: %APPDATA%\npm\node_modules\...
 */
function resolveClaudeCli() {
  const base = process.env.APPDATA && join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code')
  const candidates = [
    base && join(base, 'bin', 'claude.exe'),
    base && join(base, 'cli.js'),
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(
    `claude CLI not found. Looked in:\n${candidates.map((c) => '  ' + c).join('\n')}`,
  )
}

const CLAUDE_CLI = resolveClaudeCli()

// ── fixture project ──────────────────────────────────────────────────────
const README_FIRST_LINE = 'hello-from-readme-sentinel'
const PROJECT_NAME = 'dsh-mcp-e2e-project'
const SENTINEL_CONTENT = 'workspace-ok-2026'

function makeFixture(base) {
  mkdirSync(join(base, 'src', 'demo'), { recursive: true })
  writeFileSync(
    join(base, 'README.md'),
    `# ${PROJECT_NAME}\n\n${README_FIRST_LINE}\n\nmore text here.\n`,
    'utf8',
  )
  writeFileSync(
    join(base, 'package.json'),
    JSON.stringify({ name: PROJECT_NAME, version: '0.0.0', private: true }, null, 2),
    'utf8',
  )
  writeFileSync(join(base, 'MCP_WORKSPACE_SENTINEL.txt'), `${SENTINEL_CONTENT}\n`, 'utf8')
  writeFileSync(join(base, 'src', 'demo', 'target.ts'), 'export const ok = true\n', 'utf8')
  // git init so Claude Code treats `base` (not src/demo) as the project root.
  execFileSync('git', ['init', '-q', base])
}

/** Run one headless claude prompt; returns { stdout, stderr, code }. */
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
        'mcp__dsh__delegate_to_dsh',
        '--output-format',
        'json',
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

function summarize(text, max = 600) {
  return text.length > max ? text.slice(0, max) + '…' : text
}

// ── main ─────────────────────────────────────────────────────────────────
// Optional filter: node tests/e2e-headless.mjs A  (runs only Test A)
const ONLY_CASE = process.argv[2]?.toUpperCase()

const sandbox = join(tmpdir(), `dsh-mcp-e2e-${process.pid}-${Date.now()}`)
const projectRoot = join(sandbox, 'test-project')
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

  // Test A: read-only project info, launched from src\demo (subdirectory).
  if (ONLY_CASE === undefined || ONLY_CASE === 'A') {
    const r = await runClaude({
      cwd: join(projectRoot, 'src', 'demo'),
      prompt:
        '不要自己读取文件。把以下任务委派给 DSH：读取当前项目根目录的 README.md 和 package.json，返回项目名称以及 README 的第一段。',
      mcpConfigPath: mcpConfig,
      timeoutMs: 600_000,
    })
    const out = r.stdout + r.stderr
    if (r.timedOut) fail('Test A (subdir, read project info)', 'claude timed out')
    else if (out.includes(PROJECT_NAME) && out.includes(README_FIRST_LINE))
      pass('Test A (subdir, read project info)')
    else
      fail(
        'Test A (subdir, read project info)',
        `expected "${PROJECT_NAME}" and "${README_FIRST_LINE}" in output\n---\n${summarize(out)}\n---`,
      )
  }

  // Test B: sentinel lookup, launched from src\demo.
  if (ONLY_CASE === undefined || ONLY_CASE === 'B') {
    const r = await runClaude({
      cwd: join(projectRoot, 'src', 'demo'),
      prompt:
        '不要自己查找。让 DSH 找到项目根目录下的 MCP_WORKSPACE_SENTINEL.txt 并返回文件内容。',
      mcpConfigPath: mcpConfig,
      timeoutMs: 600_000,
    })
    const out = r.stdout + r.stderr
    if (r.timedOut) fail('Test B (subdir, sentinel)', 'claude timed out')
    else if (out.includes(SENTINEL_CONTENT)) pass('Test B (subdir, sentinel)')
    else
      fail(
        'Test B (subdir, sentinel)',
        `expected "${SENTINEL_CONTENT}" in output\n---\n${summarize(out)}\n---`,
      )
  }

  // Test C: same task from the project root — DSH must see the same workspace.
  if (ONLY_CASE === undefined || ONLY_CASE === 'C') {
    const r = await runClaude({
      cwd: projectRoot,
      prompt:
        '不要自己查找。让 DSH 找到项目根目录下的 MCP_WORKSPACE_SENTINEL.txt 并返回文件内容。',
      mcpConfigPath: mcpConfig,
      timeoutMs: 600_000,
    })
    const out = r.stdout + r.stderr
    if (r.timedOut) fail('Test C (root, sentinel)', 'claude timed out')
    else if (out.includes(SENTINEL_CONTENT)) pass('Test C (root, sentinel)')
    else
      fail(
        'Test C (root, sentinel)',
        `expected "${SENTINEL_CONTENT}" in output\n---\n${summarize(out)}\n---`,
      )
  }

  // Test D: project path with spaces (ENGINEERING.md §28 Test E).
  if (ONLY_CASE === undefined || ONLY_CASE === 'D') {
    const spacedRoot = join(sandbox, 'Test Project With Spaces')
    makeFixture(spacedRoot)
    const r = await runClaude({
      cwd: join(spacedRoot, 'src', 'demo'),
      prompt:
        '不要自己查找。让 DSH 找到项目根目录下的 MCP_WORKSPACE_SENTINEL.txt 并返回文件内容。',
      mcpConfigPath: mcpConfig,
      timeoutMs: 600_000,
    })
    const out = r.stdout + r.stderr
    if (r.timedOut) fail('Test D (path with spaces)', 'claude timed out')
    else if (out.includes(SENTINEL_CONTENT)) pass('Test D (path with spaces)')
    else
      fail(
        'Test D (path with spaces)',
        `expected "${SENTINEL_CONTENT}" in output\n---\n${summarize(out)}\n---`,
      )
  }
} finally {
  rmSync(sandbox, { recursive: true, force: true }) // also removes mcp.json (API key)
}

console.log(failures === 0 ? '\nALL E2E CASES PASSED' : `\n${failures} E2E CASE(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
