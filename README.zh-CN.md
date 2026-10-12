# DSH MCP Desktop

让 Codex 在正在运行的 DeepSeek Harness 桌面端创建任务、观察实时进度，并继续同一个会话。任务出现在指定工作目录对应的分组中，沿用桌面端的模型和权限。

本项目保留原版 headless MCP 工具，并新增桌面会话工具。想在桌面端看到任务，应使用 `dsh_desktop_*` 工具。

## 环境要求

- Node.js 22.19.0 或更高版本。
- 已安装并至少启动过一次 DSH 桌面端，存在 `~/.dsh/profiles/desktop`。
- 桌面端已配置可用模型，能够正常对话。
- 使用 Codex 自动注册时，`codex` 命令需要在 PATH 中。

当前桌面接入已在 Windows 和 DSH 0.1.7-rc.2 环境验证。其他平台和 DSH 版本需要重新验证插件与 RPC 接口兼容性。

## 安装

在终端运行：

```powershell
git clone https://github.com/TrivialHe/dsh-mcp-desktop.git
cd dsh-mcp-desktop
npm ci --ignore-scripts
npm run build
npm run desktop:install
```

安装器向桌面 profile 的 `cordis.patch.yml` 添加带标记的插件条目，保存首次修改前的 `.dsh-mcp-desktop.backup` 备份，并将 MCP 注册为 `dsh-desktop`。重复执行不会重复插入插件。

完成后退出并重新打开 DSH 桌面端，再启动新的 Codex 会话。桌面端必须保持运行。不要移动已经安装的仓库目录，因为 profile 和 MCP 注册使用它的绝对路径。

自定义 DSH home 或 MCP 名称：

```powershell
npm run desktop:install -- --home C:/YourDSHHome --name dsh-desktop
```

只安装桌面插件，不自动注册 Codex：

```powershell
npm run desktop:install -- --no-register
```

随后在 MCP 客户端中设置 Node.js 可执行文件为启动命令，参数为仓库中 `desktop/server.mjs` 的绝对路径。Codex 配置示例：

```toml
[mcp_servers.dsh-desktop]
command = "node"
args = ["C:/Tools/dsh-mcp-desktop/desktop/server.mjs"]
```

将示例路径替换为自己的实际安装路径。

## 发出任务

可以直接对 Codex 说：

> 请通过 DSH 桌面会话实现这个功能：[需求]。工作目录为 [绝对目录]，标题为 [任务名称]。使用 dsh_desktop_start 创建任务，后续调查、修改和测试沿用同一个 session_id。由你审查结果并验收。

继续已有任务：

> 继续 DSH 桌面会话 [session_id]，完成 [追加需求]。不要创建新会话，检查完成结果后再交付。

任务提交返回的是接收凭证。验收时需要等待对应请求结束，再检查 `finish_reason`、结果、代码和测试证据。不要把 `accepted: true` 当成成功完成。

## 桌面工具

| 工具 | 参数 | 用途 |
| --- | --- | --- |
| `dsh_desktop_start` | `cwd`、`title`、可选 `task` | 创建目录分组内的会话；返回 `session_id` 和 `workspace_id`。提供任务时还返回请求凭证。 |
| `dsh_desktop_send` | `session_id`、`task`、`mode` | 继续同一会话。`mode` 默认 `queue`，可选 `steer`。 |
| `dsh_desktop_status` | `session_id` | 获取运行状态、流式文本、近期事件类型和最终回复。 |
| `dsh_desktop_wait` | `session_id`、`after_seq`、`request_id`、`seconds` | 使用提交凭证中的序号和请求 ID 等待对应请求。默认 30 秒，范围 1-60 秒。超时返回 `timeout`，不会重新发送任务。 |
| `dsh_desktop_interrupt` | `session_id` | 请求取消该会话的执行，保留历史。随后检查状态确认是否停止。 |

观察进程断开后，可再次用同一个 `session_id` 查询或追加消息。它会重新连接原会话，不会自动重发先前任务。审批和用户问题仍由桌面端处理，MCP 不会代答。

原版 `delegate_to_dsh`、`dsh_investigate`、`dsh_fix`、`dsh_execute` 和 `dsh_status` 属于 headless 通道。其配置见 [上游说明](README.upstream.md)，不会作为本插件创建的桌面任务运行。

## 连接与凭据

桌面插件通过 DSH 的正常本机认证流程生成连接 cookie，MCP 通过回环 HTTP RPC 和 WebSocket 连接桌面服务。桌面模式不需要另外设置 `DEEPSEEK_API_KEY`，也不复制模型密钥。

连接凭据和运行状态位于 `desktop/runtime/`，已从 Git 和 npm 发布文件中排除。Windows 使用当前用户 ACL，其他系统使用私有文件权限。不要分享该目录；连接 cookie 可以操作该用户的桌面会话。

`session/create` 使用 `workspaceId` 绑定目录分组；`cwd` 只用于查找或创建对应工作区。新任务创建后会查询工作区成员，确认会话确实已分组。

## 排障

- **桌面连接不可用**：确认插件已安装，重启 DSH，检查 `desktop/runtime/desktop-plugin-health.json` 和连接文件是否生成，再重启 MCP。
- **任务不在桌面端出现**：确认使用的是 `dsh_desktop_start`，并检查传入目录和返回的 `workspace_id`。
- **已有其他 bridge 条目**：安装器会拒绝覆盖未受本项目标记管理的插件。保留原安装，或先移除旧条目后再安装。不要同时启用两个同名桌面插件。
- **认证或模型错误**：先在 DSH 桌面端直接测试对话。桌面任务沿用桌面端配置；headless 配置单独排查。
- **等待超时**：查询原会话状态，必要时继续等待同一个请求，避免再次发送同一任务。

卸载时先执行 `codex mcp remove dsh-desktop`，再从桌面 profile 中移除 `BEGIN dsh-mcp-desktop` 到 `END dsh-mcp-desktop` 的完整块，重启 DSH。若安装时使用了其他 MCP 名称，使用那个名称。

## 验证

```powershell
npm run build
npm test
npm run test:desktop
```

桌面回归测试覆盖请求完成关联、断线后不重发、远程地址拒绝、工作区字段及分组验证。原版测试覆盖 headless 实现。

在已安装并启动桌面插件后，运行真实连接测试：

```powershell
npm run smoke:desktop
```

该测试通过 MCP 创建一个桌面会话，用两轮固定文本验证实时回复和上下文保留。它不要求读取项目文件或运行命令，使用当前终端所在目录作为测试工作区。测试会产生模型调用费用，并在桌面端保留验收会话。

## 来源与许可证

基于 [Mr-potato-123/dsh-mcp](https://github.com/Mr-potato-123/dsh-mcp)，参考 [dqtz5vpvj9-create/dsh-subagent-mcp](https://github.com/dqtz5vpvj9-create/dsh-subagent-mcp) 的原生会话接入方式。详细来源见 [desktop/NOTICE.md](desktop/NOTICE.md)，保留两项目的 MIT 许可证。本项目是独立社区扩展。
