#!/usr/bin/env node
/**
 * dsh-mcp entrypoint — a stdio MCP server that delegates tasks to a local
 * DeepSeek Harness headless CLI (§6, §25).
 *
 * stdout is reserved exclusively for the MCP JSON-RPC stream (§4); every
 * debug line goes to stderr, gated behind DSH_MCP_DEBUG=1 (§29).
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { createDshMcpServer } from './server.ts'
import { resolveDsh } from './resolve-dsh.ts'

function readVersion(): string {
  try {
    const manifest = JSON.parse(
      readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
    ) as { version?: unknown }
    return typeof manifest.version === 'string' ? manifest.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function debug(...parts: Array<string | undefined>): void {
  if (process.env.DSH_MCP_DEBUG !== '1') return
  console.error('[dsh-mcp]', ...parts)
}

// Startup diagnostics only; the tool handler re-resolves per call so DSH can
// be built (or DSH_ROOT set) without restarting the server (§29).
try {
  const resolved = resolveDsh()
  debug('dshRoot=' + resolved.dshRoot)
  debug('cli=' + resolved.cliPath)
} catch (error) {
  debug('DSH resolution failed at startup: ' + (error as Error).message)
}

serveStdio(() => {
  const server = createDshMcpServer({ version: readVersion() })
  debug('mcp server started')
  return server
})
