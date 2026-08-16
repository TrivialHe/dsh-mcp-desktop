/**
 * Unit tests for DSH auto-discovery (ENGINEERING.md §9, §24, §30, §35).
 *
 * Resolution order under test:
 *   DSH_ROOT > sibling ../deepseek-harness > child ./deepseek-harness
 *   > installed CLI under DSH_HOME
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveDsh } from '../src/resolve-dsh.ts'

// All temp packages live inside one sandbox so that a package's *sibling*
// (../deepseek-harness) stays inside the sandbox too — never leaks into
// %TEMP% where a later test could pick it up.
const SANDBOX = join(tmpdir(), `dsh-mcp-sandbox-${process.pid}`)

let roots: string[] = []

function makeTempDir(): string {
  const dir = join(SANDBOX, `pkg-${roots.length}-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  roots.push(dir)
  return dir
}

/** Create a fake built DSH checkout (apps/cli/lib/bin.js present). */
function makeBuiltCheckout(dir: string): string {
  const cliDir = join(dir, 'apps', 'cli', 'lib')
  mkdirSync(cliDir, { recursive: true })
  writeFileSync(join(cliDir, 'bin.js'), '#!/usr/bin/env node\n', 'utf8')
  return dir
}

/** Create a fake installed DSH CLI package (lib/bin.js present). */
function makeInstalledCli(dir: string): string {
  mkdirSync(join(dir, 'lib'), { recursive: true })
  writeFileSync(join(dir, 'lib', 'bin.js'), '#!/usr/bin/env node\n', 'utf8')
  return dir
}

const CHECKOUT_CLI = join('apps', 'cli', 'lib', 'bin.js')
const OLD_ENV = {
  dshRoot: process.env.DSH_ROOT,
  dshHome: process.env.DSH_HOME,
}

beforeEach(() => {
  roots = []
  delete process.env.DSH_ROOT
  delete process.env.DSH_HOME
})

afterEach(() => {
  if (OLD_ENV.dshRoot === undefined) delete process.env.DSH_ROOT
  else process.env.DSH_ROOT = OLD_ENV.dshRoot
  if (OLD_ENV.dshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = OLD_ENV.dshHome
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
  rmSync(SANDBOX, { recursive: true, force: true })
})

describe('resolveDsh', () => {
  it('uses DSH_ROOT when set, even if a sibling checkout exists', () => {
    const packageRoot = makeTempDir()
    makeBuiltCheckout(join(packageRoot, '..', 'deepseek-harness'))
    const override = makeTempDir()
    makeBuiltCheckout(override)

    process.env.DSH_ROOT = override
    const resolved = resolveDsh(packageRoot)

    expect(resolved.dshRoot).toBe(override)
    expect(resolved.cliPath).toBe(join(override, CHECKOUT_CLI))
  })

  it('accepts an installed CLI package as DSH_ROOT', () => {
    const override = makeInstalledCli(makeTempDir())
    process.env.DSH_ROOT = override

    const resolved = resolveDsh(makeTempDir())

    expect(resolved.dshRoot).toBe(override)
    expect(resolved.cliPath).toBe(join(override, 'lib', 'bin.js'))
  })

  it('rejects a DSH_ROOT without any CLI build artifact', () => {
    const override = makeTempDir() // exists, but never built
    process.env.DSH_ROOT = override

    expect(() => resolveDsh(makeTempDir())).toThrow(/Neither CLI build artifact was found/)
  })

  it('treats an empty DSH_ROOT as unset', () => {
    process.env.DSH_ROOT = ''
    const siblingRoot = makeBuiltCheckout(join(makeTempDir(), '..', 'deepseek-harness'))

    const resolved = resolveDsh(makeTempDir())
    expect(resolved.dshRoot).toBe(siblingRoot)
  })

  it('auto-discovers a sibling ../deepseek-harness checkout', () => {
    const packageRoot = makeTempDir()
    const sibling = makeBuiltCheckout(join(packageRoot, '..', 'deepseek-harness'))

    const resolved = resolveDsh(packageRoot)

    expect(resolved.dshRoot).toBe(sibling)
    expect(resolved.cliPath).toBe(join(sibling, CHECKOUT_CLI))
  })

  it('falls back to a child ./deepseek-harness checkout', () => {
    const packageRoot = makeTempDir()
    const child = makeBuiltCheckout(join(packageRoot, 'deepseek-harness'))

    const resolved = resolveDsh(packageRoot)

    expect(resolved.dshRoot).toBe(child)
  })

  it('discovers an installed CLI package under DSH_HOME', () => {
    const packageRoot = makeTempDir()
    const dshHome = makeTempDir()
    const cliPkg = makeInstalledCli(
      join(dshHome, 'profiles', 'node_modules', '@deepseek-ai', 'dsh'),
    )
    process.env.DSH_HOME = dshHome

    const resolved = resolveDsh(packageRoot)

    expect(resolved.dshRoot).toBe(cliPkg)
    expect(resolved.cliPath).toBe(join(cliPkg, 'lib', 'bin.js'))
  })

  it('reports an actionable error when the checkout was never built', () => {
    const packageRoot = makeTempDir()
    process.env.DSH_HOME = makeTempDir() // isolate from any real DSH install
    mkdirSync(join(packageRoot, 'deepseek-harness'), { recursive: true }) // no lib/bin.js

    expect(() => resolveDsh(packageRoot)).toThrow(/CLI build artifact is missing/)
    expect(() => resolveDsh(packageRoot)).toThrow(/pnpm install/)
  })

  it('reports an actionable error when no checkout exists anywhere', () => {
    const packageRoot = makeTempDir()
    process.env.DSH_HOME = makeTempDir() // isolate from any real DSH install

    expect(() => resolveDsh(packageRoot)).toThrow(/Unable to locate DeepSeek Harness/)
    expect(() => resolveDsh(packageRoot)).toThrow(/deepseek-harness/)
    expect(() => resolveDsh(packageRoot)).toThrow(/DSH_ROOT=/)
  })
})
