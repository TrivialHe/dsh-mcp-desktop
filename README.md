<div align="center">

# dsh-mcp ⚡

### Stop paying flagship-model prices for file reads.

### A cheap, fast execution layer for MCP agents — powered by a local DeepSeek Harness.

Agentic coding tools are expensive and slow for one reason: they let a
flagship model read files one by one. `dsh-mcp` flips that — **the parent agent
keeps the reasoning, the local DeepSeek Harness does the heavy lifting**:
batch reads, edits, and command runs, at DeepSeek pricing, on your machine.

![Platform: Windows 11](https://img.shields.io/badge/Platform-Windows_11-0078d4)
![Protocol: MCP stdio](https://img.shields.io/badge/Protocol-MCP_stdio-8A2BE2)
![License: MIT](https://img.shields.io/badge/License-MIT-blue)

**Works with any MCP client · tested end-to-end with Claude Code**

**🌐 [English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja-JP.md)**

</div>

---

## Why: fast and cheap, by design

**The pain.** Long-horizon, multi-file work is where agentic tools bleed money
and time. Codex and Claude Code do it by letting the flagship model grind
through every file itself: one `Read` per file, exploration loops, context
that grows and drifts. You pay flagship per-token rates for the *reading*, and
you wait for the model to do it *serially*.

**The fix.** One `delegate_to_dsh` call hands the whole token-heavy subtask to
a fresh, focused DeepSeek Harness agent running inside your workspace. All the
file I/O happens there — batched, local, cheap. The parent stays in the loop
for what actually needs a brain: **planning, diagnosis, decisions, verification**.

Measured on 20 SWE-bench-style long-horizon tasks (same parent model, both arms):

| | with `dsh-mcp` | raw agent |
|---|---|---|
| **Accuracy** | **20/20 · 100%** | 17/20 · 85% |
| **Avg. wall time** | **77s** | 107s |
| **Multi-file investigation** | **43–83s** | up to **350s** |

Faster, more accurate, and the expensive reads moved off the flagship model.
[Full report](#benchmark) · [Reproduce it](#benchmark)

## How it works

![architecture](docs/architecture.png)

*The prompt used to generate this is in
[`docs/architecture-image-prompt.md`](docs/architecture-image-prompt.md).*

- **Not Claude-Code-specific.** `dsh-mcp` is a standard MCP stdio server. Any
  client that speaks MCP can use it — Claude Code is simply the client we
  validated end-to-end (real API calls, subdir launches, Chinese, spaces in
  paths).
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

**Step 2 — register with Claude Code**

```powershell
claude mcp add dsh `
  --transport stdio `
  --env DEEPSEEK_API_KEY=sk-... `
  -- node D:\path\to\dsh-mcp\dist\index.js

claude mcp list                    # confirm "dsh" is listed
```

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

> 20 long-horizon, multi-file tasks (bug fixes, refactors, migrations,
> implement-from-spec, test-driven, audit) · automated ground-truth verification
> (run assertions + stdout checks) · same parent model on both arms
> · full breakdown: [`tests/bench/bench-report.md`](tests/bench/bench-report.md)
> · dataset: [`tests/bench/tasks.mjs`](tests/bench/tasks.mjs)

| Task | with dsh-mcp | raw agent |
|---|---|---|
| 01 rename-export (update all references) | ✅ 120s | ✅ 47s |
| 02 cascade-bug (3-layer data flow, lost field) | ✅ **55s** | ❌ 158s |
| 03 implement-from-spec | ✅ 42s | ✅ 42s |
| 04 move-util (migrate + update 3 callers) | ✅ **60s** | ✅ 300s |
| 05 fix-todos (5 files, batch) | ✅ **67s** | ✅ 155s |
| 06 CJS → ESM migration | ✅ 34s | ✅ 51s |
| 07 null-guard fix | ✅ 54s | ✅ 71s |
| 08 implement checksum per spec | ✅ 28s | ✅ 48s |
| 09 data-flow (3-layer root cause) | ✅ **43s** | ✅ 350s |
| 10 dedupe → shared module | ✅ 282s | ✅ 76s |
| 11 async boundary fix | ✅ 52s | ✅ 55s |
| 12 out-of-range guard | ✅ 64s | ✅ 67s |
| 13 config key migration ×2 | ✅ 92s | ✅ 67s |
| 14 undefined-guard fix | ✅ **83s** | ✅ 287s |
| 15 string concat order | ✅ **23s** | ❌ 67s |
| 16 circular require | ✅ **228s** | ❌ 53s |
| 17 fix failing test suite | ✅ 49s | ✅ 50s |
| 18 unit conversion | ✅ 68s | ✅ 77s |
| 19 logging audit (3 entries) | ✅ 77s | ✅ 86s |
| 20 sort comparator direction | ✅ 29s | ✅ 32s |

**What the numbers say**

- **Multi-file investigation tasks: 3–8× faster.** One delegation batches "read
  N files + analyze" (09: 43s vs 350s). A raw agent reads file by file and loses
  early context in long sessions.
- **All 3 raw-agent failures are precision tasks** — a lost field across three
  modules, a one-line concat bug, and the classic Node circular-require
  `module.exports` swap trap. The dsh-mcp arm solved all of them.
- **Honest exceptions** — a shared-module extraction (10) is slower through DSH
  (multi-file rewrite round-trips); 16's raw arm was "fast" only because it gave
  up early with the wrong fix.
- **Simple single-point tasks** are a wash (raw arm slightly faster; every
  delegation pays a process-spawn cost).

**Limitations** — n=20, single model, small repos, headless permission mode for
the raw arm. The accuracy gap is directional, not statistically significant at
this n.

Reproduce:

```powershell
DEEPSEEK_API_KEY=sk-... node tests\bench\run-bench.mjs        # both arms, 20 tasks
DEEPSEEK_API_KEY=sk-... node tests\e2e-headless.mjs           # real E2E (A/B/C/D)
DEEPSEEK_API_KEY=sk-... node tests\long-horizon-e2e.mjs       # multi-delegation loop
```

> Keys only ever enter a temp `mcp.json` inside a sandbox, deleted on exit —
> never written to the repo, never printed.

## Configuration

### Option A — register with Claude Code (recommended)

```powershell
claude mcp add dsh `
  --transport stdio `
  --env DEEPSEEK_API_KEY=sk-... `
  -- node D:\path\to\dsh-mcp\dist\index.js

claude mcp list
```

> Any other MCP client can use the same server — point it at
> `dist\index.js` with the same env vars. Example project-level config:

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

## How to delegate

`delegate_to_dsh` takes one `task` argument. Every call spawns a **brand-new**
DSH agent that runs in your project workspace and returns its final result.
DSH has no memory across calls — that's the design (no session to corrupt) —
and it sets the one rule that matters:

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

Everything here was developed and verified on **deepseek-v4-flash** — parent and
DSH alike. The architecture is the point: the parent's per-turn token spend
stays tiny (pure reasoning), while token-heavy work runs on the DSH side at
DeepSeek pricing.

This is what makes a flagship parent (e.g. Claude Fable 5 / Sonnet 5) both
**faster and cheaper** when combined with dsh-mcp:

- **Faster** — every raw-arm failure in the benchmark is a reasoning failure;
  a stronger parent reasons once instead of retrying, and DSH workload doesn't
  change.
- **Cheaper** — the parent's token budget is already minimized by delegation,
  so a higher-priced model still costs less than a raw agent paying full token
  volume for file reads and exploration loops.
- **Zero migration** — `delegate_to_dsh` is model-agnostic end to end.

*The flagship-model claim is architecture + benchmark inference; swap the
parent and re-run the same suite to verify.*

## Verified

| Layer | Coverage | Status |
| --- | --- | --- |
| Unit | 23 vitest (DSH discovery / workspace / runner) | ✅ |
| Real E2E (Claude Code) | subdir launch · Chinese · spaces in path · real API | ✅ |
| Long-horizon | plan → investigate → decide → fix → read-back → verify | ✅ 5/5 |
| A/B benchmark | 20 tasks × 2 arms (accuracy + runtime) | ✅ |
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
