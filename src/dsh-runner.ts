/**
 * Runs the DSH headless CLI as a child process and captures its output.
 *
 * Rules enforced here (ENGINEERING.md §20-§23):
 *   - `process.execPath` + explicit argv, never a shell string;
 *   - `shell: false` — avoids cmd.exe/PowerShell quoting, `&`, `|`, `>`,
 *     path spaces, `.cmd` shim behavior, and shell injection;
 *   - `windowsHide: true`;
 *   - child stdout/stderr are captured as utf8 buffers, never piped to
 *     `process.stdout` (that would corrupt the MCP JSON-RPC stream, §4);
 *   - a run that exits non-zero is a normal `DshRunResult` (the server maps
 *     it to an MCP error result); only spawn failures and timeouts throw.
 */

import { spawn, spawnSync } from 'node:child_process'

export interface DshRunRequest {
  task: string
  cwd: string
  /** Per-call timeout in ms; overrides the runner's configured default. */
  timeoutMs?: number
}

export interface DshRunResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface DshRunner {
  run(request: DshRunRequest): Promise<DshRunResult>
}

/** Thrown when DSH could not be started or was killed by timeout. */
export class DshRunError extends Error {
  readonly kind: 'spawn' | 'timeout'
  readonly stderr: string

  constructor(kind: 'spawn' | 'timeout', message: string, stderr = '') {
    super(message)
    this.kind = kind
    this.stderr = stderr
  }
}

const DEFAULT_TIMEOUT_MS = 0 // 0 = no timeout (§31)

export interface CliDshRunnerOptions {
  /** Absolute path to the built DSH CLI artifact (apps\cli\lib\bin.js). */
  cliPath: string
  /** Timeout in ms; 0 or unset means no timeout. */
  timeoutMs?: number
  /** Extra env to merge over process.env (used by tests). */
  env?: NodeJS.ProcessEnv
}

export class CliDshRunner implements DshRunner {
  private readonly cliPath: string
  private readonly timeoutMs: number
  private readonly env: NodeJS.ProcessEnv

  constructor(options: CliDshRunnerOptions) {
    this.cliPath = options.cliPath
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.env = options.env ?? {}
  }

  async run(request: DshRunRequest): Promise<DshRunResult> {
    const timeoutMs = request.timeoutMs ?? this.timeoutMs
    const child = spawn(
      process.execPath,
      [this.cliPath, '--profile', 'headless', request.task],
      {
        cwd: request.cwd,
        env: { ...process.env, ...this.env },
        shell: false,
        windowsHide: true,
      },
    )

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    const terminated = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        child.on('error', (error) => reject(error))
        child.on('close', (code, signal) => resolve({ code, signal }))
      },
    )

    // Timeout: terminate the child, then force-kill the process tree on
    // Windows if it does not die within a grace period (§31).
    let timer: NodeJS.Timeout | undefined
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill()
        if (process.platform === 'win32') {
          // `child.kill()` only terminates the direct child; the headless
          // profile may spawn its own children, so fall back to a tree kill.
          setTimeout(() => {
            if (child.exitCode === null && child.pid !== undefined) {
              spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
                windowsHide: true,
              })
            }
          }, 1500)
        }
      }, timeoutMs)
    }

    try {
      const { code, signal } = await terminated
      if (signal !== null) {
        throw new DshRunError('timeout', `DSH timed out and was terminated (signal: ${signal}).`)
      }
      return { exitCode: code ?? -1, stdout, stderr }
    } catch (error) {
      if (error instanceof DshRunError) throw error
      const message = error instanceof Error ? error.message : String(error)
      throw new DshRunError('spawn', `Failed to start DSH: ${message}`)
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }
}
