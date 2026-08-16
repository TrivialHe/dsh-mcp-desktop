#!/usr/bin/env node
/**
 * Local ground-truth self-check for the benchmark task set.
 * No models, no API, no network — pure Node.
 *
 * For every task:
 *   - the CLEAN fixture must FAIL verify   (bug/spec genuinely present)
 *   - the reference fix must PASS verify   (fix is achievable and checkable)
 *
 * Exits nonzero on any violation, so it is CI-safe:
 *   node tests/bench/verify-tasks.mjs
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TASKS } from './tasks.mjs'
import { FIXES } from './fixes.mjs'

const root = join(tmpdir(), 'dsh-bench-selfcheck')
rmSync(root, { recursive: true, force: true })
mkdirSync(root, { recursive: true })

let cleanFail = 0
let fixPass = 0
let legacySkipped = 0
const problems = []

for (const t of TASKS) {
  const dir = join(root, t.id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })

  const writeTree = (files) => {
    for (const [p, c] of Object.entries(files)) {
      const full = join(dir, p)
      mkdirSync(join(full, '..'), { recursive: true })
      writeFileSync(full, c, 'utf8')
    }
  }

  writeTree(t.files)
  const clean = await t.verify(dir)
  if (clean.ok) {
    problems.push(`${t.id}: CLEAN fixture PASSED verify (must FAIL)`)
  } else {
    cleanFail++
  }

  const fix = FIXES[t.id]
  if (!fix) {
    legacySkipped++ // tasks 01–20 predate the fixes table; validated in the live 20-task run
    continue
  }
  if (fix.del) for (const p of fix.del) rmSync(join(dir, p), { force: true })
  if (fix.write) writeTree(fix.write)

  const fixed = await t.verify(dir)
  if (!fixed.ok) {
    problems.push(`${t.id}: reference fix FAILED verify — ${fixed.detail}`)
  } else {
    fixPass++
  }
}

console.log(
  `ground-truth: clean-must-FAIL ${cleanFail}/${TASKS.length}  fix-must-PASS ${fixPass}/${TASKS.length - legacySkipped}  legacy-skip ${legacySkipped}`,
)
if (problems.length) {
  console.log('\nPROBLEMS:')
  for (const p of problems) console.log('  - ' + p)
  rmSync(root, { recursive: true, force: true })
  process.exit(1)
}
console.log('All ground-truth checks OK.')
rmSync(root, { recursive: true, force: true })
