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
 *   anything else → print the task, exit 0
 */

function main() {
  const args = process.argv.slice(2)

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

  console.log(task)
  process.exit(0)
}

main()
