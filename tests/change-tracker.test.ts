/**
 * Unit tests for workspace change tracking (change-tracker.ts).
 *
 * Verifies: snapshot hash coverage, dependency/hidden dir skipping,
 * added/modified/deleted diff detection, path sorting, unreadable-path
 * tolerance (a broken path must not throw).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diffSnapshots, snapshotWorkspace } from '../src/change-tracker.ts'

let root = ''
let dirs: string[] = []

function makeRoot(): string {
  const dir = join(tmpdir(), `dsh-mcp-track-test-${process.pid}-${dirs.length}-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  dirs.push(dir)
  return dir
}

beforeEach(() => {
  dirs = []
  root = makeRoot()
})

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

describe('snapshotWorkspace', () => {
  it('hashes files recursively and skips dependency/hidden dirs', async () => {
    writeFileSync(join(root, 'a.txt'), 'hello')
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'b.ts'), 'bye')
    mkdirSync(join(root, 'node_modules'))
    writeFileSync(join(root, 'node_modules', 'x.js'), 'x')
    mkdirSync(join(root, '.git'))
    writeFileSync(join(root, '.git', 'config'), 'g')
    mkdirSync(join(root, 'dist'))
    writeFileSync(join(root, 'dist', 'y.js'), 'y')

    const snapshot = await snapshotWorkspace(root)

    expect(snapshot.has('a.txt')).toBe(true)
    expect(snapshot.has('src/b.ts')).toBe(true)
    expect(snapshot.has('node_modules/x.js')).toBe(false)
    expect(snapshot.has('.git/config')).toBe(false)
    expect(snapshot.has('dist/y.js')).toBe(false)
  })

  it('returns an empty map for a missing root instead of throwing', async () => {
    expect(await snapshotWorkspace(join(root, 'does-not-exist'))).toEqual(new Map())
  })

  it('records content hashes, so a rewrite with identical size is still a change', async () => {
    writeFileSync(join(root, 'f.txt'), 'v1')
    const before = await snapshotWorkspace(root)
    writeFileSync(join(root, 'f.txt'), 'v2')
    const after = await snapshotWorkspace(root)

    expect(before.get('f.txt')).not.toBe(after.get('f.txt'))
  })
})

describe('diffSnapshots', () => {
  it('reports added / modified / deleted', () => {
    const before = new Map([
      ['a.txt', 'h1'],
      ['b.txt', 'h2'],
    ])
    const after = new Map([
      ['b.txt', 'h2-changed'],
      ['c.txt', 'h3'],
    ])

    expect(diffSnapshots(before, after)).toEqual([
      { path: 'a.txt', action: 'deleted' },
      { path: 'b.txt', action: 'modified' },
      { path: 'c.txt', action: 'added' },
    ])
  })

  it('returns [] for identical snapshots', () => {
    const snap = new Map([['a.txt', 'h1']])
    expect(diffSnapshots(snap, new Map([['a.txt', 'h1']]))).toEqual([])
  })

  it('sorts by path ascending regardless of insertion order', () => {
    const before = new Map([['z.txt', 'h'], ['a.txt', 'h']])
    const after = new Map<string, string>()
    const changes = diffSnapshots(before, after)

    expect(changes.map((c) => c.path)).toEqual(['a.txt', 'z.txt'])
  })
})
