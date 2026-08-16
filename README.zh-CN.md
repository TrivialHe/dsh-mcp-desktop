<div align="center">

# dsh-mcp ⚡

### 别为读文件付旗舰模型的钱。

### 给 MCP 智能体的廉价高速执行层 —— 由本地 DeepSeek Harness 驱动。

智能体编程工具之所以又贵又慢，只有一个原因：它让旗舰模型一个一个地读文件。
`dsh-mcp` 把这个过程翻过来——**父代理保留推理，本地 DeepSeek Harness 干重活**：
批量读文件、改文件、跑命令，按 DeepSeek 计价，跑在你的机器上。

![Platform: Windows 11](https://img.shields.io/badge/Platform-Windows_11-0078d4)
![Protocol: MCP stdio](https://img.shields.io/badge/Protocol-MCP_stdio-8A2BE2)
![License: MIT](https://img.shields.io/badge/License-MIT-blue)

**兼容任意 MCP 客户端 · 已在 Claude Code 上完成端到端验证**

**🌐 [English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja-JP.md)**

</div>

---

## 为什么：快和便宜，是设计使然

**先说问题。** 长程、多文件任务，最能让智能体工具又费钱又费时间。Codex、Claude
Code 的做法，是让旗舰模型亲自啃完每个文件：一个文件一次 `Read`，反复探索，
上下文越滚越大，越到后面越抓不住重点。**读文件**按旗舰模型的单价收费，而且模型
是**一个个**地读——钱和时间一起烧。

**我们的做法。** 一次 `delegate_to_dsh` 调用，把最费 token 的那部分子任务，整个
交给一个全新的 DeepSeek Harness agent——它就在你的 workspace 里干活。所有文件
读写都在那里完成：批量、本地、便宜。父代理只管拿主意：**规划、诊断、决策、验证**。

20 个 SWE-bench 风格长难任务的实测（同父模型、双对照组）：

| | 有 `dsh-mcp` | 裸 agent |
|---|---|---|
| **正确率** | **20/20 · 100%** | 17/20 · 85% |
| **平均耗时** | **77s** | 107s |
| **多文件调查类** | **43–83s** | 最高 **350s** |

更快、更准，而且最烧钱的读取动作，不再占用旗舰模型。
[完整报告](#benchmark-报告) · [自己复现](#benchmark-报告)

## 工作原理

![architecture](docs/architecture.png)

*生成这张图用的提示词在
[`docs/architecture-image-prompt.md`](docs/architecture-image-prompt.md)。*

- **不是 Claude Code 专属。** `dsh-mcp` 是标准 MCP stdio 服务端，任何会说 MCP
  的客户端都能用——Claude Code 只是我们做过端到端验证的那个客户端（真实 API
  调用、子目录启动、中文、路径含空格）。
- **父代理模型。** 每次委派是一个自包含子任务；DSH 是无状态工人（每次调用全新
  进程——没有会被污染的会话）。
- **零配置，开箱即用。** DSH CLI 自动发现（环境变量覆盖 → 兄弟 checkout →
  子目录 checkout → `%USERPROFILE%\.dsh` 下已安装的 CLI）。
- **Windows-first。** `process.execPath` + 显式 argv，`shell: false`——没有
  引号地狱、没有 `.cmd` 垫片，含空格路径直接可用。

## 快速开始

**第 1 步：构建（只需一次）**

```powershell
cd dsh-mcp
npm install
npm run build                      # → dist\index.js
```

**第 2 步：注册到 Claude Code**

```powershell
claude mcp add dsh `
  --transport stdio `
  --env DEEPSEEK_API_KEY=sk-... `
  -- node D:\path\to\dsh-mcp\dist\index.js

claude mcp list                    # 确认列表里有 "dsh"
```

**第 3 步：重启 Claude Code，完成第一次委派**

Claude Code 启动时才加载 MCP 服务器，所以在任意项目目录里重启它。然后用
大白话直接说：

> 让 DSH 读取当前项目根目录的 README.md 和 package.json，返回项目名称和
> README 第一段。不要自己读取文件——全部委派出去。

你会看到 Claude 调用 `delegate_to_dsh`，几秒后答案就回来了。DSH 在**你的**
项目根目录执行——绝不会跑到 `dsh-mcp` 目录里。

> `delegate_to_dsh` 没出现？再跑一次 `claude mcp list`——服务器启动失败会在
> 那里报错。跳转到[排查](#排查)。

## Benchmark 报告

> 20 个长难多文件任务（bug 修复、重构、迁移、按 spec 实现、测试驱动、审计）·
> 自动化 ground-truth 验证（运行断言 + stdout 检查）· 双组同父模型
> · 完整明细：[`tests/bench/bench-report.md`](tests/bench/bench-report.md)
> · 任务集：[`tests/bench/tasks.mjs`](tests/bench/tasks.mjs)

| 任务 | 有 dsh-mcp | 裸 agent |
|---|---|---|
| 01 重命名导出（更新全部引用） | ✅ 120s | ✅ 47s |
| 02 级联 bug（3 层数据流丢字段） | ✅ **55s** | ❌ 158s |
| 03 按 spec 实现 | ✅ 42s | ✅ 42s |
| 04 迁移 util（更新 3 处调用方） | ✅ **60s** | ✅ 300s |
| 05 批量修复 5 个文件 | ✅ **67s** | ✅ 155s |
| 06 CJS → ESM 迁移 | ✅ 34s | ✅ 51s |
| 07 null 防护修复 | ✅ 54s | ✅ 71s |
| 08 按 spec 实现 checksum | ✅ 28s | ✅ 48s |
| 09 数据流（3 层找根因） | ✅ **43s** | ✅ 350s |
| 10 提取共享模块 | ✅ 282s | ✅ 76s |
| 11 异步边界修复 | ✅ 52s | ✅ 55s |
| 12 越界防护 | ✅ 64s | ✅ 67s |
| 13 配置键迁移 ×2 | ✅ 92s | ✅ 67s |
| 14 undefined 防护修复 | ✅ **83s** | ✅ 287s |
| 15 字符串拼接顺序 | ✅ **23s** | ❌ 67s |
| 16 循环 require | ✅ **228s** | ❌ 53s |
| 17 修复失败测试套件 | ✅ 49s | ✅ 50s |
| 18 单位换算 | ✅ 68s | ✅ 77s |
| 19 日志审计（3 个入口） | ✅ 77s | ✅ 86s |
| 20 排序比较器方向 | ✅ 29s | ✅ 32s |

**数字背后**

- **多文件调查类任务：快 3–8 倍。** 一次委派打包"读 N 个文件 + 分析"
  （09: 43s vs 350s）。裸 agent 逐文件 Read，长会话中丢失早期上下文。
- **裸 agent 的 3 个失败，全栽在精细活上** —— 跨三个模块丢字段、一行拼接
  顺序、以及经典的 Node 循环 require `module.exports` 引用替换陷阱。有 dsh-mcp
  的一组全都拿下了。
- **说几个例外** —— 提取共享模块（10）走 DSH 反而更慢（多文件改写来回折腾）；
  16 号裸组"快"，只是因为修错了就放弃。
- **简单单点任务两组打平**（裸组略快；每次委派有进程启动开销）。

**限制** —— n=20、单模型、小型仓库、裸组为 headless 权限模式。正确率差距方向
一致，但在此样本量下不构成统计显著。

复现：

```powershell
DEEPSEEK_API_KEY=sk-... node tests\bench\run-bench.mjs        # 双组 20 任务
DEEPSEEK_API_KEY=sk-... node tests\e2e-headless.mjs           # 真实 E2E（A/B/C/D）
DEEPSEEK_API_KEY=sk-... node tests\long-horizon-e2e.mjs       # 多轮委派闭环
```

> key 只进入沙箱内的临时 `mcp.json`，退出即删——绝不写入仓库、绝不打印。

## 配置

### 方式 A：注册到 Claude Code（推荐）

```powershell
claude mcp add dsh `
  --transport stdio `
  --env DEEPSEEK_API_KEY=sk-... `
  -- node D:\path\to\dsh-mcp\dist\index.js

claude mcp list
```

> 其他 MCP 客户端用同一个服务端即可——指向 `dist\index.js`，配上同样的环境
> 变量。项目级配置示例：

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

> 不要把 key 提交进 git。自动化脚本在退出前删除临时配置。

### DSH 可以装在哪里？

dsh-mcp 只按顺序探测 4 个位置找 DSH——**不会看 `PATH`**：

1. `DSH_ROOT` 环境变量——显式指定，无条件优先
2. 本包旁边的兄弟 checkout：`..\deepseek-harness`
3. 本包内部的子目录 checkout：`.\deepseek-harness`
4. DSH home 下安装的 CLI 包：
   `%USERPROFILE%\.dsh\profiles\node_modules\@deepseek-ai\dsh`
   （`DSH_HOME` 可覆盖 home 目录）

所以 DSH **装在哪都行**——兄弟 checkout、专门的工具目录、别的盘——只要设
`DSH_ROOT` 指过去。两种布局都认：源码 checkout（先构建 CLI：`pnpm install
&& pnpm run build`）或已安装的 CLI 包（`<root>\lib\bin.js`）。四个位置之外的
路径不会被自动发现；报错信息会直接告诉你去设 `DSH_ROOT`。

```powershell
# 注册时指向你自己的 DSH 目录
claude mcp add dsh `
  --transport stdio `
  --env DEEPSEEK_API_KEY=sk-... `
  --env DSH_ROOT=D:\tools\deepseek-harness `
  -- node D:\path\to\dsh-mcp\dist\index.js
```

### 环境变量

| 变量 | 含义 |
| --- | --- |
| `DEEPSEEK_API_KEY` | **必填**。透传给 DSH 子进程 |
| `DSH_ROOT` | 可选。指定 DSH checkout / 已安装 CLI |
| `DSH_HOME` | 可选。DSH home（默认 `%USERPROFILE%\.dsh`） |
| `DSH_MCP_TIMEOUT_MS` | 可选。子任务超时；**不设置 = 不超时** |
| `DSH_MCP_DEBUG=1` | stderr 诊断（`[dsh-mcp] dshRoot=... cli=...`） |

### 排查

| 现象 | 处理 |
| --- | --- |
| `Unable to locate DeepSeek Harness` | 设置 `DSH_ROOT`，或安装 DSH CLI（`npx @deepseek-ai/dsh`） |
| `CLI build artifact is missing` | 在 DSH checkout 执行 `pnpm install && pnpm run build` |
| `DEEPSEEK_API_KEY is not configured` | 补 `--env DEEPSEEK_API_KEY=...` 重新注册并重启 |
| workspace 不对 | 解析链：工具 `cwd` → `CLAUDE_PROJECT_DIR` → `MCP_WORKSPACE_DIR` → 进程 cwd |

## 怎么委派

`delegate_to_dsh` 只有一个 `task` 参数。每次调用都会启动一个**全新的** DSH
子代理，在你的项目工作区里执行并返回最终结果。DSH 跨调用**没有记忆**——这
是设计使然（没有会被污染的会话）——所以只有一条铁律：

> **每次委派必须自包含。** 把子任务需要的一切都给 DSH：文件路径、上下文、
> 期望的结果。绝不要写"同上"、"像刚才那样"、"我之前提到的那个文件"——
> DSH 看不到你的对话。

### 好委派 vs 坏委派

同一个任务，两种写法：

```text
❌ "修复 store 模块的 bug 并验证。"
   —— 哪个模块？什么 bug？怎么验证？DSH 对"那个 bug"一无所知。

✅ "src/store.js 里的 createOrder()（约第 42 行）计算订单总额时漏掉了
    tax 字段。修复它让总额包含税。然后运行 node src/tests/order.test.js
    并报告输出。"
   —— 自包含：文件、bug、期望行为、验证命令，全齐了。
```

### 三个覆盖绝大多数场景的模板

**1. 调查——DSH 读文件，父代理读报告**

```text
读取 src/modules/ 下的 a.js、b.js、c.js，报告：(1) 每个文件导出的全部
函数签名；(2) 所有 TODO/FIXME 注释及行号；(3) 这些模块各自被谁引用。
不要修改任何东西。
```

**2. 修复 + 验证——父代理拍板，DSH 执行并检查**

```text
src/utils.js 里 slugify("  hello ") 返回 "hello " 而不是 "hello"
（前导空格泄漏）。修复它，然后运行 node src/test/utils.test.js 并
报告哪些断言通过。
```

**3. 批量修改——一次委派，替代 N 次读/写来回**

```text
整个项目中，把所有 config.port 引用改为 config.serverPort（跳过
node_modules）。每个改过的文件列一行。
```

### 什么时候该委派——什么时候不该

| 委派（token 密集、自包含） | 留在父代理（需要上下文） |
|---|---|
| 读 N 个文件 + 汇总 | 权衡两种架构 |
| 多文件重命名 / 迁移 / 重构 | 决定下一步做什么 |
| 跑测试套件 / 脚本并报告输出 | 会不断演化的调试对话 |
| 实现一个边界明确的函数 | 目标本身还不清楚的事 |

### 一次委派在会话里长什么样

```text
你:   登录流程坏了。让 DSH 追踪 src/auth/ 下 login.js → session.js →
       db.js 的调用链，报告错误可能在哪个环节被吞掉，带行号。不要自己
       读文件。

DSH:  找到了：src/auth/session.js:37 捕获错误后返回 null 而没有重新抛出，
      导致 login.js 把失败当成了"未登录"。读了三个文件，未做任何修改。
```

## 成本模型

本项目全部开发与验证都跑在 **deepseek-v4-flash** 上——父代理与 DSH 皆是。
架构就是重点：父代理每轮 token 消耗保持极小（纯推理），token 密集的工作在
DSH 侧按 DeepSeek 计价完成。

这正是把父代理换成旗舰模型（如 Claude Fable 5 / Sonnet 5）后依然**更快、更省钱**
的原因：

- **更快** —— benchmark 中裸组的全部失败都是推理失败；更强的父代理一次推理
  到位而非反复重试，且 DSH 侧工作量不变。
- **更省钱** —— 父代理的 token 预算已被委派压到最小，即使单价更高，总量也
  小于裸 agent 为文件读取和探索循环付出的全额 token。
- **零迁移** —— `delegate_to_dsh` 端到端模型无关。

*旗舰模型的结论基于架构分析 + benchmark 数据推断；换父代理后用同一套
benchmark 复测即可验证。*

## 已验证

| 层 | 覆盖 | 状态 |
| --- | --- | --- |
| 单元测试 | 23 个 vitest（DSH 发现 / workspace / runner） | ✅ |
| 真实 E2E（Claude Code） | 子目录启动 · 中文 · 路径含空格 · 真实 API | ✅ |
| 长程任务 | 规划 → 调查 → 诊断 → 修复 → 读回 → 验证 | ✅ 5/5 |
| A/B benchmark | 20 任务 × 2 组（正确率 + runtime） | ✅ |
| DSH 写权限探针 | headless profile 可写文件 | ✅ |

## 设计与限制（V0.x）

- **同步 wait-for-result** —— 无流式、无后台、无轮询（工程文档 §0/§23）。
  长任务就是一次较长的 MCP 调用；默认不超时。
- **无状态工人** —— 每次委派都是全新 DSH 进程（有启动开销；简单任务无妨）。
- **并发委派** 同时修改同一 workspace 需自行承担风险——优先只读 / 独立子任务。
- **Windows-first**，MIT 协议。设计与工程依据：
  [`DSH_MCP_ENGINEERING(1).md`](DSH_MCP_ENGINEERING(1).md)（§0–§40）。

## 免责声明

`dsh-mcp` 是独立开源项目，与 **OpenAI、Anthropic、DeepSeek 均无隶属、背书或
合作关系**。DeepSeek Harness 是 DeepSeek 的开源项目，本适配器只是通过 MCP
协议与它的 CLI 集成。所有产品名称与商标归各自所有者所有。

## License

MIT
