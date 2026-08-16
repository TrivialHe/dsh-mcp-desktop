/**
 * Workspace change tracking around a delegation.
 *
 * DSH's headless CLI returns only the final message text — no diff, no file
 * list. To lift that black box (the parent cannot see what a delegation
 * touched), we snapshot the workspace before and after a delegation and diff
 * the two snapshots. Pure adapter-side capability: no DSH cooperation needed.
 *
 * A snapshot maps relative paths (POSIX separators) to a sha1 of the file
 * contents. Dependency/build/hidden directories are skipped; read errors
 * skip the individual file — one broken file must not sink a delegation.
 */

import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

export interface ChangeEntry {
  /** Workspace-relative path with POSIX separators. */
  path: string
  action: 'added' | 'modified' | 'deleted'
}

const SKIPPED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.venv',
  '__pycache__',
  '.dsh',
])

/**
 * Recursively hash every file under `root` (except skipped dirs).
 *
 * Serial walk: simple and predictable; for typical projects (a few thousand
 * files) this is well under a second. Parallelizing buys little on SSD and
 * complicates the code, so it stays serial unless benchmarks say otherwise.
 */
export async function snapshotWorkspace(root: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>()
  await walk(root, root, snapshot)
  return snapshot
}

async function walk(
  root: string,
  dir: string,
  snapshot: Map<string, string>,
): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return // unreadable directory: skip it
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || SKIPPED_DIRS.has(entry.name)) continue
      await walk(root, join(dir, entry.name), snapshot)
      continue
    }
    if (!entry.isFile()) continue
    const abs = join(dir, entry.name)
    const rel = relative(root, abs).split(sep).join('/')
    try {
      const content = await readFile(abs)
      snapshot.set(rel, createHash('sha1').update(content).digest('hex'))
    } catch {
      // unreadable file: skip it
    }
  }
}

/**
 * Diff two snapshots into a sorted change list (path ascending).
 * Pure function — no I/O, trivially testable.
 */
export function diffSnapshots(
  before: Map<string, string>,
  after: Map<string, string>,
): ChangeEntry[] {
  const changes: ChangeEntry[] = []

  for (const [path, hash] of after) {
    if (!before.has(path)) {
      changes.push({ path, action: 'added' })
    } else if (before.get(path) !== hash) {
      changes.push({ path, action: 'modified' })
    }
  }
  for (const path of before.keys()) {
    if (!after.has(path)) {
      changes.push({ path, action: 'deleted' })
    }
  }

  return changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}
