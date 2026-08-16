/**
 * Resolve the workspace the delegated DSH process will run inside.
 *
 * This is deliberately separate from DSH source resolution (§11): the DSH
 * source location is derived from this package's own position, while the
 * workspace is the *user's project* — which Claude Code may launch from a
 * subdirectory of.
 *
 * Priority (ENGINEERING.md §13):
 *   1. Tool argument `cwd` (explicit).
 *   2. `CLAUDE_PROJECT_DIR` — Claude Code's project directory env var.
 *   3. `MCP_WORKSPACE_DIR` — optional local fallback.
 *   4. `process.cwd()` — last resort.
 */

import { existsSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'

/**
 * Resolve and validate the workspace root.
 *
 * @param explicitCwd - optional absolute path from the Tool argument.
 * @throws Error when nothing can be resolved or the result is not an
 *   existing directory (never silently fall back to a wrong project).
 */
export function resolveWorkspace(explicitCwd?: string): string {
  if (explicitCwd !== undefined && explicitCwd !== '') {
    if (!isAbsolute(explicitCwd)) {
      throw new Error(
        `The cwd argument must be an absolute path, got:\n\n  ${explicitCwd}`,
      )
    }
    return validateWorkspace(explicitCwd)
  }

  const fromEnv =
    process.env.CLAUDE_PROJECT_DIR ?? process.env.MCP_WORKSPACE_DIR ?? process.cwd()
  return validateWorkspace(fromEnv)
}

function validateWorkspace(candidate: string): string {
  if (!existsSync(candidate)) {
    throw new Error(`Resolved workspace does not exist:\n\n  ${candidate}`)
  }
  try {
    if (!statSync(candidate).isDirectory()) {
      throw new Error(`Resolved workspace is not a directory:\n\n  ${candidate}`)
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Resolved workspace')) throw error
    throw new Error(`Resolved workspace cannot be inspected:\n\n  ${candidate}\n\n  ${String(error)}`)
  }
  return realpathSync(candidate)
}
