/**
 * Resolve the DeepSeek Harness checkout that `dsh-mcp` will drive.
 *
 * Order (see ENGINEERING.md §9):
 *   1. `DSH_ROOT` — explicit override, wins unconditionally.
 *   2. Sibling checkout `../deepseek-harness` next to this package.
 *   3. Child checkout `./deepseek-harness` (dev convenience for in-repo
 *      layouts; not part of the documented happy path).
 *   4. Installed CLI package under the DSH home (default
 *      %USERPROFILE%\.dsh, `DSH_HOME` to override) — covers a DSH
 *      installed through its plugin/CLI package, no checkout needed.
 *   5. Actionable error otherwise.
 *
 * A usable DSH comes in two layouts, both accepted:
 *   - source checkout: <root>\apps\cli\lib\bin.js (§24)
 *   - installed CLI package: <root>\lib\bin.js
 *
 * IMPORTANT: the DSH source location is anchored at this module's own file
 * location (via `import.meta.url`), never at `process.cwd()` — Claude Code
 * may launch the server from any project directory (§10).
 *
 * The module sits exactly one directory under the package root in both the
 * source tree (`src/`) and the build output (`dist/`), so `new URL("../", ...)`
 * resolves to the package root in either case.
 */

import { existsSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface DshResolution {
  /** Absolute path of the DeepSeek Harness root that owns the CLI. */
  dshRoot: string
  /** Absolute path of the built CLI artifact (apps\cli\lib\bin.js or lib\bin.js). */
  cliPath: string
}

interface Candidate {
  root: string
  cliPath: string
}

/** Locate the CLI build artifact inside `root`, if the layout is built. */
function findCli(root: string): Candidate | undefined {
  const checkout = join(root, 'apps', 'cli', 'lib', 'bin.js')
  if (existsSync(checkout)) return { root, cliPath: checkout }
  const installed = join(root, 'lib', 'bin.js')
  if (existsSync(installed)) return { root, cliPath: installed }
  return undefined
}

function resolve(candidate: Candidate): DshResolution {
  return {
    dshRoot: realpathSync(candidate.root),
    cliPath: realpathSync(candidate.cliPath),
  }
}

/** Human-readable Windows-style path for error messages. */
function display(path: string): string {
  return path.replace(/\//g, '\\')
}

/**
 * Locate the DSH CLI and verify its build artifact exists.
 *
 * @param packageRoot - root of the `dsh-mcp` package; defaults to the
 *   directory containing this module's package.json. Tests inject a temp root.
 * @throws Error with an actionable message when DSH cannot be found or was
 *   never built (never print env values, §30).
 */
export function resolveDsh(packageRoot?: string): DshResolution {
  const root = packageRoot ?? fileURLToPath(new URL('../', import.meta.url))

  // 1. Explicit override. `DSH_ROOT` may point at a checkout or at the
  //    installed CLI package directly.
  const fromEnv = process.env.DSH_ROOT
  if (fromEnv) {
    const candidate = findCli(fromEnv)
    if (candidate === undefined) {
      throw new Error(
        `DSH_ROOT points to an invalid DeepSeek Harness location:\n\n` +
          `  ${display(fromEnv)}\n\n` +
          `Neither CLI build artifact was found:\n\n` +
          `  ${display(join(fromEnv, 'apps', 'cli', 'lib', 'bin.js'))}\n` +
          `  ${display(join(fromEnv, 'lib', 'bin.js'))}\n\n` +
          `For a source checkout, run inside the DSH repository:\n\n` +
          `  pnpm install\n  pnpm run build`,
      )
    }
    return resolve(candidate)
  }

  // 2 / 3 / 4. Auto-discovery relative to this package's own location,
  //    then the DSH home (installed CLI package).
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const candidates = [
    join(root, '..', 'deepseek-harness'), // sibling layout (documented happy path)
    join(root, 'deepseek-harness'), // child layout (dev convenience)
    join(dshHome, 'profiles', 'node_modules', '@deepseek-ai', 'dsh'), // installed CLI
  ]
  for (const candidate of candidates) {
    const found = findCli(candidate)
    if (found !== undefined) return resolve(found)
  }

  // A checkout exists but was never built: say so explicitly (§24 / §30).
  for (const candidate of candidates.slice(0, 2)) {
    if (existsSync(candidate)) {
      throw new Error(
        `DeepSeek Harness was found, but the CLI build artifact is missing:\n\n` +
          `  ${display(join(candidate, 'apps', 'cli', 'lib', 'bin.js'))}\n\n` +
          `Run inside the DSH repository:\n\n` +
          `  pnpm install\n  pnpm run build`,
      )
    }
  }

  // 5. Nothing anywhere: actionable error naming the expected layout (§30).
  throw new Error(
    `Unable to locate DeepSeek Harness.\n\n` +
      `Expected sibling checkout:\n` +
      `  ${display(join(root, '..', 'deepseek-harness'))}\n\n` +
      `You may alternatively set:\n` +
      `  DSH_ROOT=D:\\path\\to\\deepseek-harness`,
  )
}
