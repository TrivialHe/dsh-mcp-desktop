# Architecture diagram prompt (Image 2.0)

Use one of the prompts below to generate the README architecture diagram.
Recommended: 16:9, ~2x for README width. Once generated, save as
`docs/architecture.png` and reference it from the READMEs.

## English

```
A clean, modern software architecture diagram, dark background, flat vector style.
Title at top left: "dsh-mcp — a cheap, fast execution layer for MCP agents".

Three layers, connected by a horizontal flow from left to right:

Left column, a rounded rectangle labeled "Parent agent — any MCP client"
with a small terminal icon, text "core reasoning: plan · diagnose · decide · verify".
A thin connecting line (labeled "MCP stdio: delegate_to_dsh(task)") runs to:

Middle, a small compact plugin icon labeled "dsh-mcp — one thin MCP server",
single tool "delegate_to_dsh".

From the middle, an arrow labeled "spawn headless CLI · wait for result" runs to:

Right column, a larger rounded rectangle labeled "Local execution layer —
DeepSeek Harness", containing a terminal window with lines of code and file icons,
annotated "reads · edits · runs commands".

A return arrow from the right rectangle back to the left, labeled "final result".

Color accents: blue for the parent agent, green for the execution layer,
orange for the adapter. Subtle grid background. No 3D, no gradients, crisp
minimalist technical illustration, no text spelling errors.
```

## 简体中文

```
一张干净现代的软件架构图，深色背景，扁平矢量风格。
左上角标题："dsh-mcp —— 为 MCP 智能体打造的廉价高速执行层"。

三层结构，从左到右横向流动：

左侧一个圆角矩形，标签"父代理 —— 任意 MCP 客户端"，带一个小终端图标，
文字"核心推理：规划 · 诊断 · 决策 · 验证"。
一条细连线（标注"MCP stdio: delegate_to_dsh(task)"）连向：

中间一个紧凑的插件图标，标签"dsh-mcp —— 单个极薄 MCP 服务端"，
只有一个工具"delegate_to_dsh"。

从中间向右一条箭头，标注"spawn headless CLI · 等待结果"，连向：

右侧一个更大的圆角矩形，标签"本地执行层 —— DeepSeek Harness"，
内部是一个代码终端窗口和文件图标，标注"读文件 · 改文件 · 跑命令"。

从右侧矩形回到左侧的返回箭头，标注"最终结果"。

配色：父代理用蓝色，执行层用绿色，适配器用橙色。浅色网格背景。
不要 3D 效果、不要渐变，干净极简的技术插图风格，不要出现错别字。
```

## 日本語

```
クリーンでモダンなソフトウェアアーキテクチャ図。ダーク背景、フラットなベクター
スタイル。左上にタイトル：「dsh-mcp —— MCP エージェントのための、安くて速い実行層」。

3 層構造を左から右への横方向のフローで接続：

左に角丸長方形、ラベル「親エージェント —— 任意の MCP クライアント」、
小さな端末アイコン付き、文字「コア推論：計画・診断・判断・検証」。
細い接続線（「MCP stdio: delegate_to_dsh(task)」とラベル付け）が：

中央のコンパクトなプラグインアイコン、ラベル「dsh-mcp —— ひとつの極薄 MCP サーバー」、
ツールは「delegate_to_dsh」のみ。

中央から右へ、ラベル「spawn headless CLI・結果を待機」の矢印が：

右側のより大きな角丸長方形、ラベル「ローカル実行層 —— DeepSeek Harness」、
内部にコードのターミナルウィンドウとファイルアイコン、注釈「読み込み・編集・コマンド実行」。

右の長方形から左へ戻る矢印、ラベル「最終結果」。

配色：親エージェントは青、実行層は緑、アダプタはオレンジ。淡いグリッド背景。
3D やグラデーションを使わず、すっきりとしたミニマルな技術イラスト。誤字なし。
```

## Notes

- The mermaid diagram in the READMEs is the source of truth for layout;
  keep the three labels and the flow direction if you tweak the prompt.
- After generation: save as `docs/architecture.png`, then update the
  "Architecture diagram" section in all three READMEs to embed the image:
  `![architecture](docs/architecture.png)`
