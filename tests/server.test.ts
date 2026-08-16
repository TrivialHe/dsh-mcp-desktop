/**
 * Unit tests for the MCP tool family (server.ts) against tests/fake-dsh.js —
 * never a real API call.
 *
 * Verifies: [mcp] metadata block, per-call timeout override, change tracking
 * (added/modified/deleted), trackChanges opt-out, category task prefixes,
 * API-key gate (delegations require it, dsh_status must not), status output.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DELEGATE_TOOLS,
  composeTask,
  createDelegateHandler,
  createStatusHandler,
} from '../src/server.ts'

const FAKE_CLI = fileURLToPath(new URL('./fake-dsh.js', import.meta.url))
const ORIGINAL_KEY = process.env.DEEPSEEK_API_KEY
const ORIGINAL_HOME = process.env.DSH_HOME
const ORIGINAL_TIMEOUT = process.env.DSH_MCP_TIMEOUT_MS
const ORIGINAL_PROJECT = process.env.CLAUDE_PROJECT_DIR

let dirs: string[] = []

function makeWorkDir(): string {
  const dir = join(tmpdir(), `dsh-mcp-server-test-${process.pid}-${dirs.length}-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  dirs.push(dir)
  return dir
}

function textOf(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content.map((c) => c.text).join('\n')
}

beforeEach(() => {
  dirs = []
  process.env.DEEPSEEK_API_KEY = 'test-key'
})

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  // restore env (may have been deleted / overridden by a test)
  if (ORIGINAL_KEY === undefined) delete process.env.DEEPSEEK_API_KEY
  else process.env.DEEPSEEK_API_KEY = ORIGINAL_KEY
  if (ORIGINAL_HOME === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = ORIGINAL_HOME
  if (ORIGINAL_TIMEOUT === undefined) delete process.env.DSH_MCP_TIMEOUT_MS
  else process.env.DSH_MCP_TIMEOUT_MS = ORIGINAL_TIMEOUT
  if (ORIGINAL_PROJECT === undefined) delete process.env.CLAUDE_PROJECT_DIR
  else process.env.CLAUDE_PROJECT_DIR = ORIGINAL_PROJECT
})

describe('tool family definition', () => {
  it('registers the four delegation tools with distinct names and prefixes', () => {
    expect(DELEGATE_TOOLS.map((t) => t.name)).toEqual([
      'delegate_to_dsh',
      'dsh_investigate',
      'dsh_fix',
      'dsh_execute',
    ])
    // generic tool has no prefix; every category pins its constraints
    expect(DELEGATE_TOOLS[0].promptPrefix).toBeUndefined()
    expect(DELEGATE_TOOLS[1].promptPrefix).toContain('严格禁止：修改任何文件')
    expect(DELEGATE_TOOLS[2].promptPrefix).toContain('列出你修改过的每个文件')
    expect(DELEGATE_TOOLS[3].promptPrefix).toContain('不要修改任何源代码文件')
  })

  it('composeTask prepends the prefix with a blank line', () => {
    expect(composeTask(undefined, 'task')).toBe('task')
    expect(composeTask('P', 'T')).toBe('P\n\nT')
  })
})

describe('delegation handler', () => {
  it('returns the DSH output plus a [mcp] metadata block', async () => {
    const workDir = makeWorkDir()
    const handler = createDelegateHandler({ cliPath: FAKE_CLI })

    const result = await handler({ task: 'hello dsh', cwd: workDir })
    const text = textOf(result)

    expect(result.isError).toBeFalsy()
    expect(text).toContain('hello dsh') // fake-dsh echoes the task
    expect(text).toContain('[mcp] exitCode: 0')
    expect(text).toContain('[mcp] durationMs: ')
    expect(text).toContain(`[mcp] cwd: ${workDir}`)
    expect(text).toContain('[mcp] changedFiles: 0')
  })

  it('reports a non-zero exit as an error result', async () => {
    const handler = createDelegateHandler({ cliPath: FAKE_CLI })

    const result = await handler({ task: 'exit1:boom', cwd: makeWorkDir() })
    const text = textOf(result)

    expect(result.isError).toBe(true)
    expect(text).toContain('DSH exited with code 1')
    expect(text).toContain('boom')
  })

  it('honors a per-call timeoutMs that overrides the environment default', async () => {
    process.env.DSH_MCP_TIMEOUT_MS = '60000' // env says: be generous
    const handler = createDelegateHandler({ cliPath: FAKE_CLI })

    const result = await handler({
      task: 'sleep:60000',
      cwd: makeWorkDir(),
      timeoutMs: 200,
    })
    const text = textOf(result)

    expect(result.isError).toBe(true)
    expect(text).toContain('timed out')
  })

  it('uses the environment timeout when no per-call timeout is given', async () => {
    process.env.DSH_MCP_TIMEOUT_MS = '200'
    const handler = createDelegateHandler({ cliPath: FAKE_CLI })

    const result = await handler({ task: 'sleep:60000', cwd: makeWorkDir() })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('timed out')
  })

  it('rejects when DEEPSEEK_API_KEY is missing', async () => {
    delete process.env.DEEPSEEK_API_KEY
    const handler = createDelegateHandler({ cliPath: FAKE_CLI })

    const result = await handler({ task: 'x', cwd: makeWorkDir() })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('DEEPSEEK_API_KEY is not configured')
  })

  describe('change tracking', () => {
    it('reports added / modified / deleted files from the workspace', async () => {
      const workDir = makeWorkDir()
      writeFileSync(join(workDir, 'a.txt'), 'v1')
      const handler = createDelegateHandler({ cliPath: FAKE_CLI })

      const added = await handler({ task: 'touch:b.txt', cwd: workDir })
      expect(textOf(added)).toContain('[mcp] changedFiles: 1')
      expect(textOf(added)).toContain('A b.txt')

      const modified = await handler({ task: 'touch:a.txt', cwd: workDir })
      expect(textOf(modified)).toContain('[mcp] changedFiles: 1')
      expect(textOf(modified)).toContain('M a.txt')

      const deleted = await handler({ task: 'rm:a.txt', cwd: workDir })
      expect(textOf(deleted)).toContain('[mcp] changedFiles: 1')
      expect(textOf(deleted)).toContain('D a.txt')
    })

    it('can be disabled per call', async () => {
      const workDir = makeWorkDir()
      const handler = createDelegateHandler({ cliPath: FAKE_CLI })

      const result = await handler({
        task: 'touch:x.txt',
        cwd: workDir,
        trackChanges: false,
      })

      expect(textOf(result)).toContain('[mcp] changedFiles: 0')
    })
  })
})

describe('dsh_status handler', () => {
  it('reports resolution, version, model, workspace, timeout and apiKey', async () => {
    const workDir = makeWorkDir()
    const home = makeWorkDir()
    writeFileSync(
      join(home, 'settings.yaml'),
      'ui-onboarding:\n  welcomeNoticeVersion: 2026-08-13.1\nagent-default-model:\n  provider: deepseek-official\n  model: deepseek-v4-flash\n  reasoningEffort: max\n',
    )
    process.env.DSH_HOME = home
    process.env.CLAUDE_PROJECT_DIR = workDir // workspace resolution source

    const result = await createStatusHandler({ cliPath: FAKE_CLI })()
    const text = textOf(result)

    expect(result.isError).toBeFalsy()
    expect(text).toContain('DSH: found')
    expect(text).toContain(`cli: ${FAKE_CLI}`)
    expect(text).toContain('version: 0.0.0-fake')
    expect(text).toContain('model: provider=deepseek-official model=deepseek-v4-flash reasoningEffort=max')
    expect(text).toContain('workspace:')
    expect(text).not.toContain('<error>')
    expect(text).toContain('timeout: 0 (no timeout)')
    expect(text).toContain('apiKey: configured')
  })

  it('reports a missing DSH resolution without crashing', async () => {
    delete process.env.DEEPSEEK_API_KEY

    const result = await createStatusHandler({ cliPath: join(makeWorkDir(), 'nope.js') })()
    const text = textOf(result)

    expect(result.isError).toBeFalsy()
    expect(text).toContain('DSH: found')
    expect(text).toContain('version: unknown')
  })

  it('reports apiKey: missing and still succeeds without a key', async () => {
    delete process.env.DEEPSEEK_API_KEY

    const result = await createStatusHandler({ cliPath: FAKE_CLI })()
    const text = textOf(result)

    expect(result.isError).toBeFalsy()
    expect(text).toContain('apiKey: missing')
    expect(text).toContain('DSH: found')
  })

  it('reports the environment timeout when set', async () => {
    process.env.DSH_MCP_TIMEOUT_MS = '30000'

    const result = await createStatusHandler({ cliPath: FAKE_CLI })()
    expect(textOf(result)).toContain('timeout: 30000 ms')
  })
})
