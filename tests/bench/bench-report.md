# dsh-mcp A/B Benchmark 报告（20 任务）

> 日期：2026-08-17。模型：deepseek-v4-flash（claude.exe 实际会话模型）。
> 复现：`DEEPSEEK_API_KEY=... node tests/bench/run-bench.mjs`（见 [run-bench.mjs](run-bench.mjs)、[tasks.mjs](tasks.mjs)）。

## 方法

- **任务集**：20 个 SWE-bench 风格长难多文件任务（修正/重构/实现/迁移/测试驱动/审计），
  每个任务含 fixture + 自然语言 issue + 自动化 ground-truth 验证（运行断言 + stdout 检查）。
  双向校准：干净 fixture 必 FAIL（20/20），正确修复必 PASS（抽样验证）。
- **组 A（有插件）**：claude 只见 `mcp__dsh__delegate_to_dsh`，所有文件操作委派 DSH
  （parent-agent 模型，ENGINEERING.md §1）。
- **组 B（无插件基线）**：claude 用原生 Read/Write/Edit/Glob/Grep/Bash + acceptEdits。
- **指标**：pass/fail（二元）+ 每任务 wall time；单任务超时 600s 保护。

## 结果总览

| 指标 | A（有 dsh-mcp） | B（无插件） | Δ |
|---|---|---|---|
| 正确率 | **20/20（100%）** | **17/20（85%）** | **+15pp** |
| 平均耗时 | **77.4s** | 107.0s | **−28%** |
| 总耗时 | **1548s** | 2140s | **−28%（−592s）** |
| 失败任务 | 0 | 02、15、16 | — |

## 逐任务明细

| # | 任务（类型） | A 结果 | A 耗时 | B 结果 | B 耗时 | 差值 |
|---|---|---|---|---|---|---|
| 01 | rename-export（跨文件引用更新） | ✅ | 120.2s | ✅ | 47.2s | B −73s |
| 02 | cascade-bug（3 层数据流丢字段） | ✅ | 54.9s | ❌ | 158.2s | **A −103s** |
| 03 | implement-spec（按 spec 实现） | ✅ | 41.9s | ✅ | 42.0s | ≈ |
| 04 | move-util（迁移 + 更新 3 处引用） | ✅ | 60.2s | ✅ | 300.4s | **A −240s** |
| 05 | fix-todos（5 文件批量修复） | ✅ | 66.5s | ✅ | 154.5s | **A −88s** |
| 06 | cjs-to-esm（迁移） | ✅ | 34.1s | ✅ | 51.4s | A −17s |
| 07 | type-fix（null 防护） | ✅ | 54.2s | ✅ | 71.2s | A −17s |
| 08 | missing-function（实现） | ✅ | 28.3s | ✅ | 48.0s | A −20s |
| 09 | data-flow（3 层追踪找根因） | ✅ | 43.3s | ✅ | 349.6s | **A −306s** |
| 10 | dedupe-refactor（提取共享模块） | ✅ | 282.1s | ✅ | 76.1s | **B −206s** |
| 11 | async-fix（异步边界） | ✅ | 51.7s | ✅ | 54.8s | ≈ |
| 12 | boundary-check（越界防护） | ✅ | 63.7s | ✅ | 67.1s | ≈ |
| 13 | config-mapping（旧键迁移 ×2） | ✅ | 91.8s | ✅ | 67.4s | B −24s |
| 14 | error-handling（未定义防护） | ✅ | 82.8s | ✅ | 287.4s | **A −205s** |
| 15 | string-format（拼接顺序） | ✅ | 23.0s | ❌ | 67.1s | **A 过/B 败** |
| 16 | import-cycle（循环 require） | ✅ | 228.0s | ❌ | 53.2s | **A 过/B 败** |
| 17 | fix-failing-test（跑测试修实现） | ✅ | 48.5s | ✅ | 49.6s | ≈ |
| 18 | metric-conversion（单位换算） | ✅ | 67.8s | ✅ | 76.8s | ≈ |
| 19 | logging-audit（3 入口加注释） | ✅ | 76.6s | ✅ | 86.3s | ≈ |
| 20 | sort-order（比较器方向） | ✅ | 28.8s | ✅ | 32.0s | ≈ |

## 模式分析

**1. 批量文件读取/追踪类任务，A 组大幅领先（60s → 300s+ 缩小到 43–83s）**
04/05/09/14：一次委派把"N 个文件的读取 + 初步分析"打包给 DSH 完成，
而 B 组逐个 Read + 多轮推理，且轮次间信息丢失（Claude Code headless 无滚动
上下文记忆，多文件读取后容易丢失早期文件内容）。

**2. B 组 3 个失败全部是"需要精确追踪/精确修改"的任务**
- 02（3 层数据流丢字段）：150s 后仍未定位根因
- 15（拼接顺序）：输出仍是 `30 is Alice years old`——最简单的单点 bug 也漏了
- 16（循环 require）：输出 `A:B:undefined`——踩中 Node `module.exports = {...}`
  引用替换陷阱（b.js 持有旧空引用），修法错误
A 组 3 个全过（16 号 A 组 228s 内修好，包括识别 exports 陷阱）。

**3. 意外：10-dedupe 与 16 号任务 B 组反而快**
- 10：A 组 282s vs B 组 76s——DSH 创建新文件/目录时往返次数多（写 shared/ 目录、
  逐个文件改写），无缓存状态下任务粒度碎。
- 16：B 组 53s 是"错误地快"（修错就放弃），非优势。

**4. 简单单点任务两组接近，B 组略快**（01 除外——B 组 47s vs A 组 120s，
01 是 A 组首个任务，含 MCP server 冷启动）。

## 限制

- n=20 小样本；正确率差异 100% vs 85% 方向一致但不构成统计显著（p>0.05）。
- 单模型（deepseek-v4-flash）、任务规模小型（每任务 <10 文件、无 npm 依赖）。
- V0.x wait-for-result 同步模型（§0/§23）：无流式/后台/断点续传，超长任务
  单次调用的可扩展性是后续版本的边界。
- 组 B 的 headless 权限配置（acceptEdits）与交互式使用有差异。
