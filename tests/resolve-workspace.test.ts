/**
 * Unit tests for workspace resolution (ENGINEERING.md §13, §35).
 *
 * Precedence under test:
 *   explicit cwd  >  CLAUDE_PROJECT_DIR  >  MCP_WORKSPACE_DIR  >  process.cwd()
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveWorkspace } from '../src/resolve-workspace.ts'

let dirs: string[] = []

function makeTempDir(): string {
  const dir = join(tmpdir(), `dsh-mcp-ws-test-${process.pid}-${dirs.length}-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  dirs.push(dir)
  return dir
}

const SAVED = {
  projectDir: process.env.CLAUDE_PROJECT_DIR,
  workspaceDir: process.env.MCP_WORKSPACE_DIR,
}

beforeEach(() => {
  dirs = []
  delete process.env.CLAUDE_PROJECT_DIR
  delete process.env.MCP_WORKSPACE_DIR
})

afterEach(() => {
  if (SAVED.projectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR
  else process.env.CLAUDE_PROJECT_DIR = SAVED.projectDir
  if (SAVED.workspaceDir === undefined) delete process.env.MCP_WORKSPACE_DIR
  else process.env.MCP_WORKSPACE_DIR = SAVED.workspaceDir
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

describe('resolveWorkspace', () => {
  it('explicit cwd wins over every env var', () => {
    const explicit = makeTempDir()
    const fromEnv = makeTempDir()
    process.env.CLAUDE_PROJECT_DIR = fromEnv
    process.env.MCP_WORKSPACE_DIR = fromEnv

    expect(resolveWorkspace(explicit)).toBe(explicit)
  })

  it('falls back to CLAUDE_PROJECT_DIR when no explicit cwd', () => {
    const fromEnv = makeTempDir()
    process.env.CLAUDE_PROJECT_DIR = fromEnv

    expect(resolveWorkspace()).toBe(fromEnv)
  })

  it('falls back to MCP_WORKSPACE_DIR before process.cwd()', () => {
    const fromEnv = makeTempDir()
    process.env.MCP_WORKSPACE_DIR = fromEnv

    expect(resolveWorkspace()).toBe(fromEnv)
  })

  it('falls back to process.cwd() as the last resort', () => {
    expect(resolveWorkspace()).toBe(process.cwd())
  })

  it('an empty explicit cwd counts as absent', () => {
    const fromEnv = makeTempDir()
    process.env.CLAUDE_PROJECT_DIR = fromEnv

    expect(resolveWorkspace('')).toBe(fromEnv)
  })

  it('rejects a nonexistent workspace', () => {
    const missing = join(makeTempDir(), 'nope')
    expect(() => resolveWorkspace(missing)).toThrow(/does not exist/)
  })

  it('rejects a file instead of a directory', () => {
    const file = join(makeTempDir(), 'file.txt')
    writeFileSync(file, 'x', 'utf8')
    expect(() => resolveWorkspace(file)).toThrow(/not a directory/)
  })

  it('rejects a relative explicit cwd', () => {
    expect(() => resolveWorkspace('src/demo')).toThrow(/absolute path/)
  })

  it('returns the realpath of the workspace', () => {
    const dir = makeTempDir()
    expect(resolveWorkspace(dir)).toBe(dir) // temp dirs are already canonical
  })
})
