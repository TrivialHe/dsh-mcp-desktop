<div align="center">

# dsh-mcp ⚡

### Fast and cheap — the heavy work runs on deepseek-v4-flash.

### An execution layer for MCP agents — powered by a local DeepSeek Harness.

Agentic coding tools are expensive and slow for one reason: the parent model
reads files one by one. `dsh-mcp` flips that — **the parent agent keeps the
reasoning, the local DeepSeek Harness does the heavy lifting**: batch reads,
edits, and command runs, priced at deepseek-v4-flash rates, on your machine.

![Platform: Windows 11](https://img.shields.io/badge/Platform-Windows_11-0078d4)
![Protocol: MCP stdio](https://img.shields.io/badge/Protocol-MCP_stdio-8A2BE2)
![License: MIT](https://img.shields.io/badge/License-MIT-blue)

**Works with any MCP client · tested end-to-end with Claude Code**

**🌐 [English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja-JP.md)**

</div>

---

## Why: fast and cheap, by design

**The pain.** Long-horizon, multi-file work is where agentic tools bleed money
and time: the parent model grinds through every file itself — one `Read` per
file, exploration loops, context that grows and drifts. You pay the parent's
per-token rates for the *reading*, and you wait for the model to do it
*serially*.

**The fix.** One `delegate_to_dsh` call hands the whole token-heavy subtask to
a fresh, focused DeepSeek Harness agent running **deepseek-v4-flash** inside
your workspace. All the file I/O happens there — batched, local, cheap. The
parent stays in the loop for what actually needs a brain: **planning,
diagnosis, decisions, verification**.

Measured on 100 SWE-bench-style long-horizon tasks (heterogeneous model setup:
parent = deepseek-v4-pro, DSH = deepseek-v4-flash; arm B runs the same parent
model without the plugin):

| | with `dsh-mcp` | raw agent |
|---|---|---|
| **Accuracy** | **100/100 · 100%** | 89/100 · 89% |
| **Avg. wall time** | **76s** | 120s |
| **Statistical significance** | — | Fisher p < 0.001 |

Faster, more accurate — and the accuracy gap is now statistically significant
(p = 3.7×10⁻⁴ at n=100), not just directional. The expensive reads now run on
deepseek-v4-flash. [Full report](tests/bench/bench-report.md) ·
[Reproduce it](#benchmark)

## How it works

![architecture](docs/architecture.png)

*The prompt used to generate this is in
[`docs/architecture-image-prompt.md`](docs/architecture-image-prompt.md).*

- **A standard MCP stdio server.** Any client that speaks MCP can use it —
  Claude Code is the client we validated end-to-end (real API calls, subdir
  launches, Chinese, spaces in paths).
- **Parent-agent model.** Each delegation is one self-contained subtask; DSH is
  a stateless worker (fresh process per call — no session to corrupt).
- **Zero config, works out of the box.** The DSH CLI is auto-discovered (env override →
  sibling checkout → child checkout → installed under `%USERPROFILE%\.dsh`).
- **Windows-first.** `process.execPath` + explicit argv, `shell: false` — no
  quoting bugs, no `.cmd` shims, spaces-in-paths just work.

## Quick start

**Step 1 — build once**

```powershell
cd dsh-mcp
npm install
npm run build                      # → dist\index.js
```

**Step 2 — register with your MCP client (Claude Code shown as the example)**

```powershell
claude mcp add dsh `
  --transport stdio `
  --env DEEPSEEK_API_KEY=sk-... `
  -- node D:\path\to\dsh-mcp\dist\index.js

claude mcp list                    # confirm "dsh" is listed
```

This is a standard MCP server — the same `dist\index.js` also works with
OpenAI Codex, Cursor, VS Code and any other MCP client (see
[Deployment](#deployment)).

**Step 3 — restart Claude Code, then make your first delegation**

Claude Code loads MCP servers at startup, so restart it inside any project.
Then just ask, in plain words:

> Have DSH read this project's README.md and package.json, and report the
> project name and the first paragraph of the README. Don't read the files
> yourself — delegate everything.

You'll see Claude call `delegate_to_dsh`, and the answer comes back in
seconds. DSH runs in **your** project root — never in the `dsh-mcp` directory.

> `delegate_to_dsh` not showing up? Re-run `claude mcp list` — if the server
> failed to start, it will report an error there. Jump to
> [Troubleshooting](#troubleshooting).

## Benchmark

> 100 long-horizon, multi-file tasks in two batches (01–50: bug fixes,
> refactors, migrations, implement-from-spec, test-driven, audit; 51–100:
> harder — deep data flows, async races, state machines, parsers, caches,
> cross-process state) · automated ground-truth verification (run assertions +
> stdout checks; clean fixtures must fail, reference fixes must pass)
> · heterogeneous model setup: parent = deepseek-v4-pro on both arms, DSH =
> deepseek-v4-flash on arm A · full breakdown:
> [`tests/bench/bench-report.md`](tests/bench/bench-report.md)
> · **experiment note: the Claude Code in this benchmark runs on a
> deepseek-v4-pro kernel** (configured via the `ANTHROPIC_MODEL` env var) —
> the parent is a DeepSeek model, not an Anthropic model, on both arms. The
> delta is therefore exactly the plugin: the same DeepSeek parent, with vs.
> without `dsh-mcp`
> · dataset: [`tests/bench/tasks.mjs`](tests/bench/tasks.mjs)

| | with `dsh-mcp` | raw agent |
|---|---|---|
| **Accuracy** | **100/100 · 100%** | 89/100 · 89% |
| **Avg. wall time** | **76.5s** | 120.2s |
| **Total wall time** | 7647s | 12019s |
| **Failures** | 0 | 11 |

**What the numbers say**

- **Every raw-agent failure is a "finished half" failure.** 5 of 11 are
  cross-file jobs (renames, log migrations, util splits) where the raw agent
  changed references but left the old file behind, or migrated 3 of 5 files;
  5 are single-point jobs where it fixed one bug out of two, escaped 3 of 5
  HTML chars, deduped but didn't sort. DSH verifies inside the delegation and
  catches the leftovers before handing back.
- **Multi-file investigation stays the biggest win** — batch "read N files +
  analyze" in one delegation vs. file-by-file reads that lose early context.
- **Statistically significant now.** Fisher exact test on accuracy
  (100% vs 89%, n=100): p = 3.7×10⁻⁴ (< 0.001). The 20-task pilot was
  directional only; at 100 tasks the gap is real.
- **The harder batch (51–100) makes the plugin look better, not worse** —
  arm A: 100% in both batches, avg 65s on the hard batch; arm B: 88% → 90%
  but still leaves 11 failures overall.
- **Honest exception** — one shared-module extraction (10) was slower through
  DSH (multi-file rewrite round-trips). Nothing like it reappeared in the hard
  batch.

Reproduce:

```powershell
DEEPSEEK_API_KEY=sk-... node tests\bench\run-bench.mjs AB 01-50     # both arms, 100 tasks
DEEPSEEK_API_KEY=sk-... node tests\bench\run-bench.mjs AB 51-100    # (range filter)
DEEPSEEK_API_KEY=sk-... node tests\e2e-headless.mjs                 # real E2E (A/B/C/D)
DEEPSEEK_API_KEY=sk-... node tests\long-horizon-e2e.mjs             # multi-delegation loop
```

> Keys only ever enter a temp `mcp.json` inside a sandbox, deleted on exit —
> never written to the repo, never printed.

## Tools

One tool family, split by responsibility so the parent agent picks by intent
(tool name + description are the model's decision input):

| Tool | Use it for | Constraint |
|---|---|---|
| `delegate_to_dsh` | generic self-contained tasks | none — everything is up to your task text |
| `dsh_investigate` | read-only analysis: read files, trace call flows, "find where X is used" | the agent is instructed to never modify files or run side-effecting commands |
| `dsh_fix` | modifying code: bug fixes, refactors, migrations, well-specified implementations | the agent verifies (when the task names a check) and lists every file it changed |
| `dsh_execute` | running commands: test suites, build scripts, environment queries | the agent reports full output + exit code, leaves source files alone |
| `dsh_status` | environment diagnostics: DSH resolution, CLI version, model config, timeout, key presence | no DSH child process, no API key required |

All delegation tools share one schema: `task` (required), `cwd` (optional),
`timeoutMs` (per-call override of `DSH_MCP_TIMEOUT_MS`) and `trackChanges`
(default true).

**Change tracking — the black box gets a tail.** DSH's headless CLI only
returns its final message: no diff, no file list. Every delegation therefore
snapshots your workspace before and after and appends a `[mcp]` block to the
result, so the parent can see what the delegation actually touched:

```text
<DSH final output>

[mcp] exitCode: 0
[mcp] durationMs: 45210
[mcp] cwd: D:\workspace\foo
[mcp] changedFiles: 2
[mcp]   M src/store.js      (modified)
[mcp]   A src/store.test.js (added)
```

Use `trackChanges: false` (or `DSH_MCP_TRACK_CHANGES=0`) to skip snapshots on
very large repositories. Dependency/build dirs (`node_modules`, `.git`,
`dist`, `build`, `coverage`, …) and hidden dirs are always excluded.

> Category constraints are enforced via task templates, not the CLI — DSH's
> headless mode has no read-only flag. Change tracking is the safety net: if
> `dsh_investigate` did modify something anyway, the `[mcp] changedFiles`
> list exposes it and the parent can check the files itself.

## Deployment

`dsh-mcp` is a **standard MCP stdio server**. Any client that speaks MCP can
host it — Claude Code, OpenAI Codex, Cursor, VS Code, Claude Desktop, or your
own tooling. The server and the `dsh` tool family are identical everywhere;
only the registration step differs. Claude Code is the client we validated
end-to-end.

### Claude Code (one command — the example)

```powershell
claude mcp add dsh `
  --transport stdio `
  --env DEEPSEEK_API_KEY=sk-... `
  -- node D:\path\to\dsh-mcp\dist\index.js

claude mcp list
```

### OpenAI Codex

Codex loads MCP servers from its config at `%USERPROFILE%\.codex\config.toml`
(project-level: `.codex\config.toml`). Append:

```toml
[mcp_servers.dsh]
command = "node"
args = ["D:\\path\\to\\dsh-mcp\\dist\\index.js"]
env = { DEEPSEEK_API_KEY = "sk-..." }
```

Restart `codex`, then just ask — e.g. "Use the dsh_investigate tool to read
the README and package.json and report the project name." Codex cannot see
inside DSH (it is a black box to the host), which is exactly why every
delegation returns the `[mcp] changedFiles` block — the parent learns what
the delegation touched even when the host is not Claude Code.

### Any other MCP client

Point your client at `dist\index.js` with the same env vars. Most clients
accept a JSON `mcpServers` block (Claude Code project-level config, Cursor
`mcp.json`, VS Code, Claude Desktop, …):

```json
{
  "mcpServers": {
    "dsh": {
      "command": "node",
      "args": ["D:\\path\\to\\dsh-mcp\\dist\\index.js"],
      "env": { "DEEPSEEK_API_KEY": "sk-..." }
    }
  }
}
```

> Don't commit the key. The automation scripts delete their temp config before
> exiting.

### Where can DSH be installed?

DSH is located in exactly four places, checked in order — **the server never
looks at `PATH`**:

1. `DSH_ROOT` env var — explicit override, wins unconditionally
2. A sibling checkout next to this package: `..\deepseek-harness`
3. A child checkout inside this package: `.\deepseek-harness`
4. An installed CLI package under the DSH home:
   `%USERPROFILE%\.dsh\profiles\node_modules\@deepseek-ai\dsh`
   (`DSH_HOME` overrides the home directory)

So you can install DSH **anywhere** — a sibling checkout, a dedicated tools
directory, a different drive — and point `DSH_ROOT` at it. Either layout
works: a source checkout (build its CLI first: `pnpm install && pnpm run build`)
or an installed CLI package (`<root>\lib\bin.js`). Anything outside these four
locations is simply not discovered; the error message tells you to set
`DSH_ROOT`.

```powershell
# register with a DSH that lives in your own directory
claude mcp add dsh `
  --transport stdio `
  --env DEEPSEEK_API_KEY=sk-... `
  --env DSH_ROOT=D:\tools\deepseek-harness `
  -- node D:\path\to\dsh-mcp\dist\index.js
```

### Environment variables

| Variable | Meaning |
| --- | --- |
| `DEEPSEEK_API_KEY` | **Required.** Passed to DSH through the environment. |
| `DSH_ROOT` | Optional. Point at a DSH checkout / installed CLI. |
| `DSH_HOME` | Optional. DSH home (default `%USERPROFILE%\.dsh`). |
| `DSH_MCP_TIMEOUT_MS` | Optional. Child timeout; **unset = no timeout**. |
| `DSH_MCP_DEBUG=1` | stderr diagnostics (`[dsh-mcp] dshRoot=... cli=...`). |

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Unable to locate DeepSeek Harness` | Set `DSH_ROOT`, or install the DSH CLI (`npx @deepseek-ai/dsh`) |
| `CLI build artifact is missing` | In the DSH checkout: `pnpm install && pnpm run build` |
| `DEEPSEEK_API_KEY is not configured` | Re-add with `--env DEEPSEEK_API_KEY=...`, restart Claude Code |
| Wrong workspace | Resolution: tool `cwd` → `CLAUDE_PROJECT_DIR` → `MCP_WORKSPACE_DIR` → server cwd |
| Delegation fails, can't tell why | Run `dsh_status` first — it reports DSH resolution, CLI version, model config, timeout and key presence |

## How to delegate

Every delegation tool takes one `task` argument (see [Tools](#tools) for
the full family). Each call spawns a **brand-new** DSH agent that runs in
your project workspace and returns its final result. DSH has no memory
across calls — that's the design (no session to corrupt) — and it sets the
one rule that matters:

> **Make every delegation self-contained.** Give DSH everything the subtask
> needs: the file paths, the context, the expected result. Never write
> "as above", "like before", or "that file I mentioned earlier" — DSH cannot
> see your conversation.

### Good vs. bad delegation

The same task, written two ways:

```text
❌ "Fix the bug in the store module and verify."
   — Which module? What bug? Verify how? DSH has no memory of "the" bug.

✅ "In src/store.js, createOrder() (around line 42) computes the order total
    without the tax field. Fix it so the total includes tax. Then run
    node src/tests/order.test.js and report the output."
   — Self-contained: file, bug, expected behavior, verification command.
```

### Three templates that cover most delegations

**1. Investigation — DSH reads the files, the parent reads the report**

```text
Read src/modules/a.js, b.js and c.js and report: (1) every exported
function signature, (2) all TODO/FIXME comments with line numbers,
(3) where each module is imported from. Don't modify anything.
```

**2. Fix + verify — the parent decides, DSH executes and checks**

```text
In src/utils.js, slugify("  hello ") returns "hello " instead of "hello"
(leading whitespace leaks through). Fix it, then run
node src/test/utils.test.js and report which assertions pass.
```

**3. Batch edit — one delegation instead of N read/edit round-trips**

```text
Across the project, replace every occurrence of config.port with
config.serverPort in all .js files (skip node_modules). List each file
you changed, one line per file.
```

### When to delegate — and when not to

| Delegate (token-heavy, self-contained) | Keep with the parent (needs context) |
|---|---|
| Read + summarize N files | Weighing two architectures |
| Multi-file rename / migration / refactor | Deciding what to build next |
| Run a suite / script and report output | A debugging conversation that evolves |
| Implement a well-specified function | Anything whose goal is still unclear |

### What a delegation looks like in a session

```text
You:   The login flow is broken. Have DSH trace login.js → session.js → db.js
       under src/auth/ and report where an error could be swallowed, with
       line numbers. Don't read the files yourself.

DSH:   Found it: src/auth/session.js:37 catches the error and returns null
       instead of rethrowing, so login.js treats the failure as "not logged
       in". Three files read, nothing modified.
```

## Cost model

Fast and cheap both come from the model on the DSH side: **deepseek-v4-flash**.
Early development ran entirely on flash (parent and DSH alike); the 100-task
benchmark above runs the heterogeneous combo **parent = deepseek-v4-pro[1m],
DSH = deepseek-v4-flash** (arm B uses the same pro parent without the plugin,
so the delta is the plugin). The Claude Code kernel in the benchmark is
DeepSeek's model — `ANTHROPIC_MODEL: deepseek-v4-pro[1m]` — not an Anthropic
one; the claims below only assume a strong parent, regardless of vendor.

- **Faster** — token-heavy subtasks (file reads, exploration loops) run batched
  in DSH instead of serially in the parent session; measured −36% average wall
  time (76.5s vs 120.2s).
- **Cheaper** — the heavy token spend runs at deepseek-v4-flash rates, and the
  parent's token budget is minimized by delegation (pure reasoning).
- **Zero migration** — `delegate_to_dsh` is model-agnostic end to end.

## Verified

| Layer | Coverage | Status |
| --- | --- | --- |
| Unit | 42 vitest (DSH discovery / workspace / runner / change tracking / tools) | ✅ |
| Real E2E (Claude Code) | subdir launch · Chinese · spaces in path · real API | ✅ |
| Long-horizon | plan → investigate → decide → fix → read-back → verify | ✅ 5/5 |
| A/B benchmark | 100 tasks × 2 arms (accuracy + runtime, p<0.001) | ✅ |
| DSH write probe | headless profile can write files | ✅ |

## Design & limitations (V0.x)

- **Synchronous wait-for-result** — no streaming, no background, no polling
  (ENGINEERING §0/§23). A long task is one longer MCP call; no timeout by
  default.
- **Stateless workers** — each delegation is a fresh DSH process (fresh startup
  cost; fine for simple tasks).
- **Concurrent delegations** edit the same workspace at their own risk — prefer
  read-only / independent subtasks.
- **Windows-first**, MIT licensed. Docs & engineering rationale:
  [`DSH_MCP_ENGINEERING(1).md`](DSH_MCP_ENGINEERING(1).md) (§0–§40).

## Disclaimer

`dsh-mcp` is an independent open-source project. It is **not affiliated with,
endorsed by, or sponsored by OpenAI, Anthropic, or DeepSeek**. DeepSeek Harness
is DeepSeek's open-source project; this adapter merely integrates with its CLI
over the MCP protocol. All product names and trademarks belong to their
respective owners.

## License

MIT
