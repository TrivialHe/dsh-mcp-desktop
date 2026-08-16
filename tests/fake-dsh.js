#!/usr/bin/env node
/**
 * Fake DSH CLI for unit tests (ENGINEERING.md §35).
 *
 * Receives the same argv shape the real runner produces:
 *   node fake-dsh.js --profile headless <task>
 *
 * Always prints its execution context first, then behaves per task prefix:
 *   exit1:<msg>  → write <msg> to stderr, exit 1
 *   sleep:<ms>   → print "started", wait <ms>, print "done", exit 0
 *   unicode:<s>  → print <s> (exercises utf8 round-trip), exit 0
 *   touch:<path> → write "<path>\n" into the workspace cwd (change tracking)
 *   rm:<path>    → delete <path> from the workspace cwd (change tracking)
 *   anything else → print the task, exit 0
 *
 * `-V` prints a fake version and exits 0 (used by dsh_status).
 */

import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function main() {
  const args = process.argv.slice(2)

  if (args.includes('-V')) {
    console.log('0.0.0-fake')
    process.exit(0)
  }

  function taskAfterHeadless(argv) {
    const idx = argv.indexOf('--profile')
    return idx !== -1 && argv[idx + 1] === 'headless' ? argv[idx + 2] : undefined
  }

  const task = taskAfterHeadless(args)

  console.log(`cwd=${process.cwd()}`)
  console.log(`argv=${JSON.stringify(args)}`)
  console.log(`task=${task}`)

  if (task === undefined) {
    console.error('fake-dsh: missing task')
    process.exit(2)
  }

  if (task.startsWith('exit1:')) {
    console.error(task.slice('exit1:'.length))
    process.exit(1)
  }

  if (task.startsWith('sleep:')) {
    const ms = Number(task.slice('sleep:'.length)) || 1000
    console.log('started')
    setTimeout(() => {
      console.log('done')
      process.exit(0)
    }, ms)
    return
  }

  if (task.startsWith('unicode:')) {
    console.log(task.slice('unicode:'.length))
    process.exit(0)
  }

  if (task.startsWith('touch:')) {
    const p = task.slice('touch:'.length)
    writeFileSync(join(process.cwd(), p), 'changed\n')
    console.log(`touched ${p}`)
    process.exit(0)
  }

  if (task.startsWith('rm:')) {
    const p = task.slice('rm:'.length)
    rmSync(join(process.cwd(), p), { force: true })
    console.log(`removed ${p}`)
    process.exit(0)
  }

  console.log(task)
  process.exit(0)
}

main()
