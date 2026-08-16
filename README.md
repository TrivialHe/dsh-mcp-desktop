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

Measured on 100 SWE-bench-style long-horizon tasks (heterogeneous model setup:
parent = deepseek-v4-pro, DSH = deepseek-v4-flash; arm B runs the same parent
model without the plugin):

| | with `dsh-mcp` | raw agent |
|---|---|---|
| **Accuracy** | **100/100 · 100%** | 89/100 · 89% |
| **Avg. wall time** | **76s** | 120s |
| **Statistical significance** | — | Fisher p < 0.001 |

Faster, more accurate — and the accuracy gap is now statistically significant
(p = 3.7×10⁻⁴ at n=100), not just directional. The expensive reads moved off
the flagship model. [Full report](tests/bench/bench-report.md) ·
[Reproduce it](#benchmark)

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

> 100 long-horizon, multi-file tasks in two batches (01–50: bug fixes,
> refactors, migrations, implement-from-spec, test-driven, audit; 51–100:
> harder — deep data flows, async races, state machines, parsers, caches,
> cross-process state) · automated ground-truth verification (run assertions +
> stdout checks; clean fixtures must fail, reference fixes must pass)
> · heterogeneous model setup: parent = deepseek-v4-pro on both arms, DSH =
> deepseek-v4-flash on arm A · full breakdown:
> [`tests/bench/bench-report.md`](tests/bench/bench-report.md)
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

Early development ran on **deepseek-v4-flash** for parent and DSH alike; the
100-task benchmark above runs the heterogeneous combo **parent =
deepseek-v4-pro[1m], DSH = deepseek-v4-flash** (arm B uses the same pro parent
without the plugin, so the delta is the plugin). The architecture is the point:
the parent's per-turn token spend stays tiny (pure reasoning), while
token-heavy work runs on the DSH side at DeepSeek pricing.

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
