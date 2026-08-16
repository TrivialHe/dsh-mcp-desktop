/**
 * Unit tests for the DSH child-process runner (ENGINEERING.md §20-§23, §31,
 * §35) against tests/fake-dsh.js — never a real API call.
 *
 * Verifies: argv layout, cwd pass-through, stdout/stderr capture, exit
 * codes, utf8 round-trip, timeout termination, spawn errors.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CliDshRunner, DshRunError } from '../src/dsh-runner.ts'

const FAKE_CLI = fileURLToPath(new URL('./fake-dsh.js', import.meta.url))
const UNICODE_TEXT = '中文输出测试 ✓ 路径 D:\\dev\\Test Project With Spaces'

let dirs: string[] = []

function makeWorkDir(): string {
  const dir = join(tmpdir(), `dsh-mcp-run-test-${process.pid}-${dirs.length}-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  dirs.push(dir)
  return dir
}

beforeEach(() => {
  dirs = []
})

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

describe('CliDshRunner', () => {
  it('spawns with the correct argv layout and cwd', async () => {
    const workDir = makeWorkDir()
    const runner = new CliDshRunner({ cliPath: FAKE_CLI })

    const result = await runner.run({ task: 'hello dsh', cwd: workDir })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain(`cwd=${workDir}`)
    expect(result.stdout).toContain('"--profile"')
    expect(result.stdout).toContain('"headless"')
    expect(result.stdout).toContain('task=hello dsh')
  })

  it('captures stderr and keeps the exit code for a failing DSH', async () => {
    const runner = new CliDshRunner({ cliPath: FAKE_CLI })

    const result = await runner.run({ task: 'exit1:boom', cwd: makeWorkDir() })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('cwd=')
    expect(result.stderr).toContain('boom')
  })

  it('round-trips unicode output as utf8', async () => {
    const runner = new CliDshRunner({ cliPath: FAKE_CLI })

    const result = await runner.run({ task: `unicode:${UNICODE_TEXT}`, cwd: makeWorkDir() })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain(UNICODE_TEXT)
  })

  it('terminates the child and reports a timeout error', async () => {
    const runner = new CliDshRunner({ cliPath: FAKE_CLI, timeoutMs: 300 })

    await expect(runner.run({ task: 'sleep:60000', cwd: makeWorkDir() })).rejects.toThrow(
      DshRunError,
    )
    await expect(runner.run({ task: 'sleep:60000', cwd: makeWorkDir() })).rejects.toMatchObject({
      kind: 'timeout',
    })
  })

  it('surfaces a missing CLI artifact as exit 1 with the module error', async () => {
    // `node <missing>.js` exits 1 with "Cannot find module" on stderr — the
    // server maps that to an isError tool result (§23), which is actionable.
    const missing = join(makeWorkDir(), 'no-such-bin.js')
    const runner = new CliDshRunner({ cliPath: missing })

    const result = await runner.run({ task: 'x', cwd: makeWorkDir() })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('no-such-bin.js')
  })
})
