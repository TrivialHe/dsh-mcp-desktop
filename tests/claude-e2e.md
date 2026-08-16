# Claude Code E2E 验证

> 对应 ENGINEERING.md §28 / §36。

## 自动化方式（推荐）

`tests/e2e-headless.mjs` 用 `claude -p`（headless）驱动真实链路：
Claude Code → MCP stdio → `delegate_to_dsh` → 真实 DSH → 真实 DeepSeek API。

```powershell
set DEEPSEEK_API_KEY=sk-...
node tests\e2e-headless.mjs        # Test A/B/C/D 全量
node tests\e2e-headless.mjs A      # 只跑 Test A
```

### 长程任务（parent-agent 委派模型）

`tests/long-horizon-e2e.mjs` 验证核心推理在 Claude、执行在 DSH 的
多步委派闭环（ENGINEERING.md §1 定位）：

```powershell
set DEEPSEEK_API_KEY=sk-...
node tests\long-horizon-e2e.mjs
```

场景：3 个模块各带一个 TODO 逻辑问题。Claude 自行规划 → 委派 DSH
①调查（读文件+报告 TODO）→ Claude 自行诊断并决定修复 → 委派 DSH
②修复（TODO 行正下方插入 `// fixed-by-claude-<模块>` 标记）→ 委派
DSH ③读回 → Claude 自行逐模块验证并总结。

断言：磁盘上 3 个文件真实被修改（标记在 TODO 行正下方）、流中出现
≥2 次 `delegate_to_dsh` 工具调用、Claude 输出最终总结。
prompt 强制每次委派自包含（DSH 每次调用是独立无状态进程，§23）。

实测（2026-08-17，deepseek-v4-flash）：约 45–60 秒完成，3 次委派
均正确执行，Claude 保持核心推理（诊断/决策/验证），全程无超时。

脚本自动：创建临时测试项目（README/package.json/sentinel/git init）、写临时
`mcp.json`（含 API key，退出前删除）、从 `src\demo` 子目录与项目根分别启动
claude、断言 DSH 返回的内容。DSH 通过 dsh-mcp 自动发现（无需 `DSH_ROOT`）。

## 手工方式

前置条件：

## 前置条件

```text
D:\dev\
├── deepseek-harness\   （已 pnpm install && pnpm run build）
├── dsh-mcp\            （已 npm install && npm run build）
└── test-project\       （一个普通项目）
```

- `test-project` 中包含：

```text
test-project\
├── README.md
├── package.json
├── src\
│   └── demo\
│       └── target.ts
└── tests\
```

- 已注册 MCP（README 中的 `claude mcp add` 命令），并配置了
  `DEEPSEEK_API_KEY`。

## Test A：只读项目信息

从任意目录启动 Claude Code 后，输入：

```text
不要自己读取文件。
把"读取当前项目根目录 README.md 和 package.json，
返回项目名称以及 README 第一段"委派给 DSH。
```

期望：Claude 调用 `delegate_to_dsh`，DSH 在 `D:\dev\test-project` 工作，
返回 README 内容，而不是 `src\demo`、`dsh-mcp` 或 `deepseek-harness`。

## Test B：验证 workspace

在 `test-project` 根目录放一个唯一文件：

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

期望 DSH 返回 `workspace-ok-2026`。

## Test C：验证子目录启动

分别从：

```powershell
cd D:\dev\test-project
claude
```

和：

```powershell
cd D:\dev\test-project\src\demo
claude
```

启动 Claude Code，重复 Test A / Test B。两次 DSH 都应看到同一个 project
workspace（`D:\dev\test-project`）。

## Test D：验证中文

```text
让 DSH 读取 README.md，并用中文总结两句话。
```

确认：中文输入正常、中文 stdout 正常、MCP 返回没有乱码。

## Test E：路径含空格

复制测试项目到：

```text
D:\dev\Test Project With Spaces\
```

重复 Test A–D。路径中的空格不应造成任何问题（runner 使用
`process.execPath` + argv，`shell: false`）。

## 失败排查

| 现象 | 检查 |
| --- | --- |
| `Unable to locate DeepSeek Harness` | 目录布局不匹配，设置 `DSH_ROOT` 或调整布局 |
| `CLI build artifact is missing` | 在 DSH 仓库执行 `pnpm install && pnpm run build` |
| `DEEPSEEK_API_KEY is not configured` | `claude mcp add` 时补 `--env DEEPSEEK_API_KEY=...` 并重启 |
| workspace 指向错误 | 确认 `CLAUDE_PROJECT_DIR` 生效；工具参数 `cwd` 会覆盖 |
| 需要诊断信息 | 给 MCP server 设置 `DSH_MCP_DEBUG=1`，看 stderr 的 `[dsh-mcp]` 行 |

诊断行示例：

```text
[dsh-mcp] dshRoot=D:\dev\deepseek-harness
[dsh-mcp] cli=D:\dev\deepseek-harness\apps\cli\lib\bin.js
```
