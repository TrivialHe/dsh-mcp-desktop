# DSH MCP 工程设计与验证文档

> 项目暂定名：`dsh-mcp`  
> 文档状态：V0.2 / Windows-first  
> 日期：2026-08-17  
> 当前验证目标：**Windows + Claude Code + 本地 DSH 源码 + DEEPSEEK_API_KEY**  
> 项目定位：一个极薄的 MCP → DSH Headless CLI Adapter。

---

# 0. 当前范围

V0.1 / V0.2 不追求“大而全”。

当前只保证：

- Windows 10/11；
- Node.js 环境；
- 本地已有可运行的 DeepSeek Harness 源码；
- Claude Code 作为首个验证 Host；
- stdio MCP；
- 一个核心 Tool：`delegate_to_dsh`；
- 用户只需要提供 `DEEPSEEK_API_KEY`；
- DSH 与 `dsh-mcp` 采用约定目录布局时，不要求额外填写 `DSH_ROOT`；
- 可以从一个**独立测试项目，甚至其子目录中启动 Claude Code**，验证 DSH 最终工作目录是否正确。

当前**不承诺**：

- macOS；
- Linux；
- Codex 已验证；
- Cursor / VS Code / 其他 MCP Host 已验证；
- npm 已发布；
- MCP Registry 已发布；
- session resume；
- background task；
- 双向通信；
- multi-agent orchestration。

这里的“通用 MCP”只表示：

> **Server 遵循标准 MCP stdio 协议，不写死 Claude Code 私有协议。**

因此未来理论上可以接 Codex 或其他 MCP Host，但 V0.x 的工程验证只做 Claude Code + Windows。

---

# 1. 项目目标

项目只解决一个问题：

> Claude Code 可以把一个独立子任务委派给本地 DeepSeek Harness，等待 DSH 执行完成，并拿回最终结果。

目标体验：

```text
Windows

D:\dev\
├── deepseek-harness\
├── dsh-mcp\
└── test-project\
    └── src\
        └── demo\
```

用户已经：

```text
1. clone DeepSeek Harness
2. clone dsh-mcp
3. build 两个项目
4. 配置 DEEPSEEK_API_KEY
```

然后可以进入：

```powershell
cd D:\dev\test-project\src\demo
claude
```

Claude Code 仍然能够：

```text
delegate_to_dsh(...)
```

并让 DSH 在正确的项目 workspace 中工作，而不是错误地在：

```text
D:\dev\dsh-mcp
```

或：

```text
D:\dev\deepseek-harness
```

中执行。

---

# 2. 总体架构

```text
Claude Code
    │
    │ MCP / stdio
    ▼
dsh-mcp
    │
    │ child_process.spawn()
    ▼
Node.exe + DSH CLI build artifact
    │
    │ --profile headless
    ▼
DeepSeek Harness
    │
    ▼
DeepSeek API
```

V0.x 中：

```text
Claude Code = parent agent / MCP host
DSH         = delegated subagent runtime
dsh-mcp     = protocol adapter
```

`dsh-mcp` 不参与：

- task planning；
- graph orchestration；
- memory；
- model routing；
- agent collaboration；
- result verification。

---

# 3. 为什么使用 stdio MCP

项目是本地开发工具，不需要 HTTP。

stdio 的优势：

- Claude Code 可以直接拉起 Server；
- 不需要监听端口；
- 不需要 daemon；
- 不需要 Web Server；
- 不需要 OAuth；
- 不需要公网服务；
- Server 生命周期跟随 MCP Host；
- 非常适合包装本地 CLI。

结构：

```text
Claude Code process
    │
    ├── stdin  ──────> dsh-mcp
    └── stdout <────── dsh-mcp
```

---

# 4. 最重要的 stdio 规则：stdout 只能用于 MCP

MCP stdio 使用 stdout 传输协议数据。

因此禁止：

```ts
console.log("debug");
```

所有调试日志必须：

```ts
console.error("debug");
```

或者写入 stderr logger。

同样，DSH child process 的 stdout 也**不能**：

```ts
child.stdout.pipe(process.stdout);
```

否则 DSH 的普通文本会污染 MCP JSON-RPC 数据流。

正确做法：

```text
DSH stdout
    ↓
dsh-mcp buffer
    ↓
Tool result
    ↓
MCP stdout
```

---

# 5. MCP SDK

推荐使用当前官方 TypeScript Server SDK。

核心结构保持极小：

```ts
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
```

V0.x 只需要：

```text
@modelcontextprotocol/server
zod
```

不引入：

- Express；
- Fastify；
- WebSocket；
- database；
- queue。

---

# 6. DSH 调用边界

我们只依赖 DSH 的 headless CLI。

概念调用：

```powershell
dsh --profile headless "Analyze this repository."
```

对于源码 checkout，更推荐直接调用 DSH 已 build 的 Node CLI artifact：

```text
<DSH_ROOT>\apps\cli\lib\bin.js
```

由当前 Node executable 启动：

```ts
spawn(
  process.execPath,
  [
    cliPath,
    "--profile",
    "headless",
    task,
  ],
  {
    cwd: workspace,
    shell: false,
    env: process.env,
    windowsHide: true,
  }
);
```

这样可以避开大量 Windows shell / `.cmd` quoting 问题。

---

# 7. Windows-only 的实现原则

当前阶段只处理 Windows。

不要为了“看起来跨平台”提前加入：

```text
darwin branch
linux branch
bash
chmod
SIGTERM compatibility layer
```

Windows 下重点处理：

- `\` 路径；
- 盘符；
- 路径中空格；
- UTF-8 / 中文输出；
- `node.exe`；
- `npm.cmd` / `pnpm.cmd`；
- child process termination；
- `windowsHide: true`；
- PowerShell 使用说明。

但核心 runner 尽量通过：

```ts
process.execPath
```

直接启动 JS CLI artifact。

这样甚至不需要调用：

```text
pnpm.cmd
npm.cmd
dsh.cmd
```

---

# 8. 推荐开发目录布局

为了做到：

> 有 DSH 源码 + 有 dsh-mcp + 填 API Key 就能跑

V0.x 推荐约定：

```text
D:\dev\
├── deepseek-harness\
├── dsh-mcp\
└── test-project\
```

即：

```text
deepseek-harness
```

和：

```text
dsh-mcp
```

是 sibling repositories。

这样 `dsh-mcp` 可以根据自己的安装位置自动寻找：

```text
..\deepseek-harness
```

用户不需要填写：

```text
DSH_ROOT
```

---

# 9. DSH 自动发现

推荐 resolver：

```text
1. 如果存在 DSH_ROOT
      → 使用 DSH_ROOT

2. 否则根据 dsh-mcp 自身代码位置
      → 找 sibling ../deepseek-harness

3. 找不到
      → 返回明确错误
```

虽然我们的默认目标是“只填 API Key”，仍保留：

```text
DSH_ROOT
```

作为高级 fallback。

这样开发者可以使用任意目录布局，但 README 的默认 happy path 不需要它。

---

# 10. 不要使用 `process.cwd()` 定位 DSH 源码

这是一个非常重要的工程细节。

Claude Code 很可能从：

```text
D:\dev\test-project
```

甚至：

```text
D:\dev\test-project\src\demo
```

启动。

此时：

```ts
process.cwd()
```

代表的是 Claude Code / MCP Server 当前 workspace，而不是 `dsh-mcp` 仓库位置。

因此：

```text
DSH source location
```

应该根据：

```text
dsh-mcp entrypoint 自身文件位置
```

推导。

而：

```text
DSH execution workspace
```

应该单独解析。

这两个概念绝不能混。

---

# 11. 两种路径必须严格分离

项目内部建议显式区分：

```ts
dshRoot
```

和：

```ts
workspaceRoot
```

例如：

```text
dshRoot
= D:\dev\deepseek-harness

workspaceRoot
= D:\dev\test-project
```

调用：

```text
node
D:\dev\deepseek-harness\apps\cli\lib\bin.js
--profile
headless
<task>
```

但 child process：

```text
cwd = D:\dev\test-project
```

这正是整个插件是否正确的关键。

---

# 12. Claude Code 子目录验证目标

开发阶段要专门测试：

```text
D:\dev\test-project\
├── README.md
├── package.json
├── src\
│   ├── index.ts
│   └── demo\
│       └── target.ts
└── tests\
```

先进入子目录：

```powershell
cd D:\dev\test-project\src\demo
claude
```

然后要求 Claude：

```text
请让 DSH 检查当前项目的 README.md 和 package.json，
并告诉我项目名称，不要自己读取文件。
```

Claude 应调用：

```text
delegate_to_dsh
```

验证 DSH 是否能读取：

```text
D:\dev\test-project\README.md
```

而不是仅看到：

```text
D:\dev\test-project\src\demo
```

或者误入：

```text
D:\dev\dsh-mcp
D:\dev\deepseek-harness
```

---

# 13. Claude Code workspace 解析策略

V0.x 优先使用 Claude Code 提供的项目目录环境信息。

推荐顺序：

```text
1. Tool 参数 cwd（如果显式提供）
2. CLAUDE_PROJECT_DIR
3. MCP_WORKSPACE_DIR（我们自己的可选 fallback）
4. process.cwd()
```

实现：

```ts
function resolveWorkspace(explicitCwd?: string): string {
  return (
    explicitCwd ??
    process.env.CLAUDE_PROJECT_DIR ??
    process.env.MCP_WORKSPACE_DIR ??
    process.cwd()
  );
}
```

然后：

```ts
fs.realpath(...)
```

并确认：

```text
exists
isDirectory
```

---

# 14. 为什么要测试“从子目录启动 Claude Code”

因为我们真正想确认的是：

> dsh-mcp 是否能够正确区分“Server 自己在哪里”和“用户项目在哪里”。

如果只在：

```text
D:\dev\dsh-mcp
```

目录运行 Claude Code，

很多错误实现也会“碰巧能跑”。

子目录测试能抓出：

- `process.cwd()` 被错误用于寻找 DSH；
- workspace 解析错误；
- relative path 假设错误；
- MCP server 安装路径与项目路径耦合；
- child process 在错误 cwd 执行。

因此它应该成为 V0.x 的核心 E2E 测试，而不是附加测试。

---

# 15. MCP Tool 设计

V0.x 只做一个：

```text
delegate_to_dsh
```

Schema：

```ts
{
  task: z
    .string()
    .min(1)
    .describe(
      "A self-contained task to delegate to DeepSeek Harness."
    ),

  cwd: z
    .string()
    .optional()
    .describe(
      "Optional absolute workspace path. Usually omit this when running from Claude Code."
    ),
}
```

---

# 16. Tool Description

建议：

```text
Delegate an independent coding, analysis, debugging, research, or repository
task to a local DeepSeek Harness agent.

The delegated DSH agent runs autonomously inside the current Claude Code
project workspace and returns its final result when complete.

Use this tool for self-contained subtasks that can be executed independently.
The delegated agent may inspect files, run commands, and modify files according
to the task instructions.
```

这个 description 非常重要。

它决定 Claude Code 是否会把合适的子任务委派出去。

---

# 17. API Key

API Key 不进入 Tool schema。

禁止：

```json
{
  "task": "...",
  "api_key": "sk-..."
}
```

只使用：

```text
DEEPSEEK_API_KEY
```

数据流：

```text
Claude Code MCP config
        ↓
dsh-mcp process.env
        ↓
DSH child process
        ↓
DeepSeek Harness credential resolution
```

优点：

- API Key 不进入聊天历史；
- 不进入 MCP Tool arguments；
- `dsh-mcp` 不需要 credential store；
- 不需要 `.env` parser；
- 不需要配置文件。

---

# 18. 推荐项目结构

```text
dsh-mcp/
├── src/
│   ├── index.ts
│   ├── server.ts
│   ├── dsh-runner.ts
│   ├── resolve-dsh.ts
│   └── resolve-workspace.ts
│
├── tests/
│   ├── resolve-dsh.test.ts
│   ├── resolve-workspace.test.ts
│   ├── runner.test.ts
│   └── claude-e2e.md
│
├── package.json
├── tsconfig.json
├── README.md
├── ENGINEERING.md
└── LICENSE
```

V0.x 可以先不放：

```text
server.json
.github/workflows/release.yml
```

因为 npm / MCP Registry 发布不是当前 blocker。

---

# 19. 内部 runner seam

即使项目非常小，也建议保留：

```ts
export interface DshRunRequest {
  task: string;
  cwd: string;
}

export interface DshRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface DshRunner {
  run(request: DshRunRequest): Promise<DshRunResult>;
}
```

然后当前实现：

```text
CliDshRunner
```

未来如果 DSH 出现：

```text
JSON RPC
structured output
stream-json
SDK
```

只需要替换 runner，不改 MCP contract。

---

# 20. Child process 实现

推荐：

```ts
const child = spawn(
  process.execPath,
  [
    dshCliPath,
    "--profile",
    "headless",
    task,
  ],
  {
    cwd: workspaceRoot,
    env: {
      ...process.env,
    },
    shell: false,
    windowsHide: true,
  }
);
```

禁止：

```ts
spawn(
  `node "${dshCliPath}" --profile headless "${task}"`,
  { shell: true }
);
```

---

# 21. 为什么 Windows 下坚持 `shell: false`

可以避免：

- `cmd.exe` quoting；
- PowerShell quoting；
- task 中双引号；
- `&`；
- `|`；
- `>`；
- 路径空格；
- shell injection；
- `.cmd` shim 行为差异。

所有参数作为 argv 独立元素传入。

---

# 22. DSH output capture

```ts
let stdout = "";
let stderr = "";

child.stdout.on("data", (chunk) => {
  stdout += chunk.toString("utf8");
});

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});
```

禁止：

```ts
child.stdout.pipe(process.stdout);
```

---

# 23. MCP 返回

成功：

```ts
return {
  content: [
    {
      type: "text",
      text: stdout.trim(),
    },
  ],
};
```

失败：

```ts
return {
  isError: true,
  content: [
    {
      type: "text",
      text:
        `DSH exited with code ${code}\n\n` +
        stderr.trim(),
    },
  ],
};
```

V0.x 不设计：

```text
task_id
session_id
status polling
mailbox
progress event
```

---

# 24. DSH 源码前置要求

“有 DSH 源码”在工程上应定义为：

> 已经安装依赖并 build 成功的 DSH checkout。

在：

```powershell
cd D:\dev\deepseek-harness
```

执行一次：

```powershell
pnpm install
pnpm run build
```

然后确认：

```text
D:\dev\deepseek-harness\apps\cli\lib\bin.js
```

存在。

`dsh-mcp` 不应该自动执行：

```text
pnpm install
pnpm run build
```

因为这会：

- 引入不可控副作用；
- 延长首次 Tool Call；
- 增加错误类型；
- 让 adapter 变重。

---

# 25. 本地开发安装

在：

```powershell
cd D:\dev\dsh-mcp
```

执行：

```powershell
npm install
npm run build
```

之后 entrypoint：

```text
D:\dev\dsh-mcp\dist\index.js
```

可以被 Claude Code 作为 stdio MCP Server 拉起。

---

# 26. 推荐的 Windows 本地验证布局

完整布局：

```text
D:\dev\
├── deepseek-harness\
│   └── apps\
│       └── cli\
│           └── lib\
│               └── bin.js
│
├── dsh-mcp\
│   ├── dist\
│   │   └── index.js
│   └── ...
│
└── test-project\
    ├── README.md
    ├── package.json
    ├── src\
    │   └── demo\
    │       └── target.ts
    └── tests\
```

这个布局满足：

```text
dsh-mcp
    ↔ 自动发现 sibling deepseek-harness

Claude Code
    ↔ 可以在 test-project 任意子目录启动
```

---

# 27. Claude Code 本地添加 MCP

开发阶段不需要 npm 发布。

直接让 Claude Code 启动本地 build artifact。

示意：

```powershell
claude mcp add `
  --transport stdio `
  --env DEEPSEEK_API_KEY=YOUR_KEY `
  dsh `
  -- node D:\dev\dsh-mcp\dist\index.js
```

然后：

```powershell
claude mcp list
```

确认 `dsh` 存在。

如果自动 sibling discovery 失败，开发调试期间可以临时加：

```powershell
--env DSH_ROOT=D:\dev\deepseek-harness
```

但最终 README 的默认 happy path 仍然应该是不填 `DSH_ROOT`。

---

# 28. Claude Code 子目录 E2E 验证

进入测试项目深层目录：

```powershell
cd D:\dev\test-project\src\demo
claude
```

建议依次测试。

## Test A：只读项目信息

Prompt：

```text
不要自己读取文件。
把“读取当前项目根目录 README.md 和 package.json，
返回项目名称以及 README 第一段”委派给 DSH。
```

期望：

```text
Claude Code
    ↓
delegate_to_dsh
    ↓
DSH
    ↓
D:\dev\test-project
```

而不是：

```text
D:\dev\test-project\src\demo
```

也不是：

```text
D:\dev\dsh-mcp
```

---

## Test B：验证 workspace

在 `test-project` 放一个唯一文件：

```text
MCP_WORKSPACE_SENTINEL.txt
```

内容：

```text
workspace-ok-2026
```

Prompt：

```text
不要自己查找。
让 DSH 找到 MCP_WORKSPACE_SENTINEL.txt 并返回文件内容。
```

如果 DSH 返回：

```text
workspace-ok-2026
```

说明 workspace routing 基本正确。

---

## Test C：验证子目录启动

分别从：

```text
D:\dev\test-project
```

和：

```text
D:\dev\test-project\src\demo
```

启动 Claude Code。

两次 DSH 都应该看到同一个 project workspace。

---

## Test D：验证中文

Prompt：

```text
让 DSH 读取 README.md，并用中文总结两句话。
```

确认：

- 中文输入正常；
- 中文 stdout 正常；
- MCP 返回没有乱码。

---

## Test E：路径含空格

复制测试项目到：

```text
D:\dev\Test Project With Spaces\
```

重新验证一次。

这个测试对 Windows 很重要。

---

# 29. 建议增加一个开发诊断 Tool 吗？

**不建议正式暴露。**

可以在测试环境中临时加一个：

```text
debug_environment
```

返回：

```text
resolved dshRoot
resolved workspaceRoot
resolved dshCliPath
```

但正式 V0.x release 应删除。

更好的方案是用：

```text
DSH_MCP_DEBUG=1
```

时通过 stderr 输出：

```text
[dsh-mcp] dshRoot=...
[dsh-mcp] workspaceRoot=...
[dsh-mcp] cli=...
```

既方便 Windows 调试，也不会污染 MCP stdout。

---

# 30. 错误设计

错误必须可行动。

## 找不到 API Key

```text
DEEPSEEK_API_KEY is not configured.

Configure it in the Claude Code MCP environment and restart the MCP server.
```

## 找不到 DSH

```text
Unable to locate DeepSeek Harness.

Expected sibling checkout:
  D:\dev\deepseek-harness

You may alternatively set:
  DSH_ROOT=D:\path\to\deepseek-harness
```

## DSH 未 build

```text
DeepSeek Harness was found, but the CLI build artifact is missing:

  apps\cli\lib\bin.js

Run inside the DSH repository:

  pnpm install
  pnpm run build
```

## workspace 错误

```text
Resolved workspace does not exist:
  ...
```

## DSH child 失败

返回：

```text
exitCode
stderr
```

不要打印：

```text
process.env
DEEPSEEK_API_KEY
```

---

# 31. Timeout

V0.x 可以提供一个简单环境变量：

```text
DSH_MCP_TIMEOUT_MS
```

如果未配置：

```text
不主动 timeout
```

如果配置：

```text
超时
  ↓
终止 child
  ↓
MCP error
```

由于当前只支持 Windows，只需要认真验证 Windows child termination。

不必提前做跨平台 signal abstraction。

---

# 32. 并发

V0.x 不做 scheduler。

每次：

```text
delegate_to_dsh
```

启动一个独立 headless DSH process。

如果 Claude Code 同时发两个 Tool Call：

```text
DSH process A
DSH process B
```

可以并行。

但 README 应提醒：

> 多个 DSH 实例同时修改同一个 workspace 可能产生冲突。

第一版最推荐：

- code investigation；
- debugging；
- test analysis；
- research；
- read-only inspection；
- 独立修改任务。

---

# 33. package.json

开发阶段示意：

```json
{
  "name": "dsh-mcp",
  "version": "0.1.0",
  "description": "A lightweight MCP server for delegating tasks to DeepSeek Harness.",
  "type": "module",
  "bin": {
    "dsh-mcp": "dist/index.js"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "engines": {
    "node": ">=22.19.0"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "prepack": "npm run build && npm test"
  },
  "dependencies": {
    "@modelcontextprotocol/server": "^2",
    "zod": "^4"
  },
  "devDependencies": {
    "typescript": "^5",
    "vitest": "^3"
  }
}
```

当前不需要为了发布提前加入复杂 release 配置。

---

# 34. 测试策略

当前 CI / 本地测试只针对：

```text
Windows
```

推荐 GitHub Actions：

```yaml
runs-on: windows-latest
```

执行：

```text
npm ci
npm run build
npm test
```

unit tests：

```text
resolve-dsh
resolve-workspace
runner args
stdout capture
stderr capture
error handling
```

真实 Claude Code + DSH E2E 暂时手工跑。

---

# 35. 最重要的自动化单测

## resolve-dsh

测试：

```text
dsh-mcp sibling 有 deepseek-harness
    → 自动找到

存在 DSH_ROOT
    → DSH_ROOT 优先

都不存在
    → actionable error
```

---

## resolve-workspace

测试：

```text
explicit cwd
    > CLAUDE_PROJECT_DIR
    > MCP_WORKSPACE_DIR
    > process.cwd()
```

---

## runner

不要真的调用 DeepSeek API。

mock：

```text
node fake-dsh.js
```

模拟：

```text
stdout
stderr
exit 0
exit 1
timeout
unicode
```

---

# 36. 手工 E2E 是 V0.x 的主要验收

当前最有价值的验收不是 Linux/macOS matrix，而是：

```text
Windows 11
+
Claude Code
+
真实 DSH
+
真实 DEEPSEEK_API_KEY
+
从目标项目子目录启动 Claude
```

这条链路跑通，就说明项目核心成立。

---

# 37. V0.x 验收标准

## MCP

- [ ] Claude Code 能连接本地 stdio MCP
- [ ] `tools/list` 能看到 `delegate_to_dsh`
- [ ] Server stdout 没有普通日志
- [ ] DSH stdout 被捕获为 Tool result

## Windows

- [ ] Windows 11 验证
- [ ] PowerShell 安装流程可复制
- [ ] 路径带空格可用
- [ ] 中文 prompt / output 不乱码
- [ ] 不使用 `shell: true`

## DSH

- [ ] sibling `deepseek-harness` 自动发现
- [ ] `DSH_ROOT` fallback 可用
- [ ] 缺 build artifact 返回明确错误
- [ ] child process 使用 DSH CLI artifact

## Workspace

- [ ] 从 `test-project` 启动 Claude 正常
- [ ] 从 `test-project\src\demo` 启动 Claude 正常
- [ ] 两种情况下 DSH 都工作在正确 project workspace
- [ ] DSH 不会误把 `dsh-mcp` 当 workspace
- [ ] DSH 不会误把 `deepseek-harness` 当 workspace

## Security

- [ ] API Key 不进入 Tool arguments
- [ ] API Key 不打印
- [ ] 不读取目标 repo `.env`
- [ ] cwd 进行 realpath / directory 检查

---

# 38. 当前发布策略

当前阶段：

> **先不把 npm / MCP Registry 当成开发目标。**

V0.x 完全可以 GitHub-only。

用户：

```powershell
git clone <deepseek-harness>
git clone <dsh-mcp>
```

然后：

```powershell
cd deepseek-harness
pnpm install
pnpm run build

cd ..\dsh-mcp
npm install
npm run build
```

Claude Code 指向：

```text
D:\dev\dsh-mcp\dist\index.js
```

即可。

这已经是完整 MCP 使用方式。

---

# 39. 什么时候再发布 npm

满足以下条件再发：

- Windows Claude Code E2E 稳定；
- 有至少一个别人机器上的验证；
- README 安装步骤稳定；
- sibling auto-discovery 没明显坑；
- DSH CLI 当前版本兼容性确认。

届时才把：

```text
node D:\...\dist\index.js
```

升级为：

```text
npx -y @scope/dsh-mcp
```

---

# 40. MCP Registry 放到更后面

Registry 是 discovery metadata，不是运行必需项。

建议顺序：

```text
V0.1
GitHub clone only

    ↓

V0.2
Windows + Claude Code 稳定

    ↓

V0.3
npm

    ↓

V0.4
MCP Registry

    ↓

Future
Codex / macOS / Linux validation
```

避免一开始把时间消耗在发布链路而不是实际可用性上。

---

# 41. 推荐开发顺序

## Milestone 1：Fake MCP

实现：

```text
stdio MCP
+
delegate_to_dsh
+
Fake runner
```

先证明 Claude Code 能调用 Tool。

---

## Milestone 2：Windows DSH runner

实现：

```text
resolve sibling DSH
+
spawn process.execPath
+
headless CLI
+
capture output
```

---

## Milestone 3：Workspace routing

实现：

```text
cwd
CLAUDE_PROJECT_DIR
realpath
```

重点验证：

```text
Claude Code 从子目录启动
```

---

## Milestone 4：真实 E2E

```text
Claude Code
    ↓
delegate_to_dsh
    ↓
真实 DSH
    ↓
真实 DeepSeek API
    ↓
读取 test-project sentinel
```

---

## Milestone 5：Windows robustness

验证：

```text
中文
路径空格
DSH_ROOT fallback
错误提示
timeout
```

---

## Milestone 6：再考虑发布

不是当前 blocker。

---

# 42. README 第一屏建议

```md
# dsh-mcp

Use DeepSeek Harness as a local subagent from Claude Code on Windows.

## Status

Early preview.

Currently tested on:

- Windows 11
- Claude Code
- Local stdio MCP
- Local DeepSeek Harness source checkout

## Requirements

- Node.js >= 22.19
- DeepSeek Harness source checkout
- DEEPSEEK_API_KEY

## Recommended layout

D:\dev\
├── deepseek-harness\
├── dsh-mcp\
└── your-project\

## Build

cd D:\dev\deepseek-harness
pnpm install
pnpm run build

cd D:\dev\dsh-mcp
npm install
npm run build

## Add to Claude Code

claude mcp add ...
```

README 不要写：

```text
Cross-platform
Claude + Codex + Cursor fully supported
```

直到真的验证。

---

# 43. 最终技术边界

V0.x 的最终结构：

```text
Windows 11
   │
   ▼
Claude Code
   │
   │ stdio MCP
   ▼
delegate_to_dsh
   │
   ▼
CliDshRunner
   │
   ├── resolve dshRoot
   │       └── sibling deepseek-harness
   │
   ├── resolve workspaceRoot
   │       └── CLAUDE_PROJECT_DIR
   │
   ▼
node.exe
<DSH_ROOT>\apps\cli\lib\bin.js
--profile headless
<task>
   │
   │ cwd = Claude project root
   ▼
DeepSeek Harness
```

核心设计原则只有四条：

1. **DSH 源码位置与 workspace 位置严格分离。**
2. **Windows 下直接用 `process.execPath` + argv，不走 shell。**
3. **Claude Code 从项目子目录启动也必须得到正确 workspace。**
4. **第一阶段先把 Git clone 本地使用做稳，再考虑发布。**

这就是当前版本需要实现的全部工程范围。
