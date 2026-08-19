<div align="center">

# dsh-mcp ⚡

### 速くて安い——重労働が deepseek-v4-flash で動くからです。

### MCP エージェントのための、安くて速い実行層 —— ローカル DeepSeek Harness が支える。

エージェント型のコーディングツールが高くて遅い理由は、ひとつしかありません。
親モデルにファイルを1つずつ読ませているからです。`dsh-mcp` はその流れを逆転
させます——**親エージェントが推論を持ち、ローカル DeepSeek Harness が重労働を
請け負う**：一括の読み込み・編集・コマンド実行を、deepseek-v4-flash 価格で、
あなたのマシン上で。

![Platform: Windows 11](https://img.shields.io/badge/Platform-Windows_11-0078d4)
![Protocol: MCP stdio](https://img.shields.io/badge/Protocol-MCP_stdio-8A2BE2)
![License: MIT](https://img.shields.io/badge/License-MIT-blue)

**あらゆる MCP クライアントで動作 · Claude Code でのエンドツーエンド検証済み**

**🌐 [English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja-JP.md)**

</div>

---

## なぜ：速くて安いのは、設計の結果です

**問題。** 長期・複数ファイルにわたる作業は、エージェント型ツールが時間とお金を
最も消耗する場面です。Codex も Claude Code も、親モデルに全ファイルを自ら
読ませる方式です。ファイルごとに `Read` を繰り返し、探索ループを回し、
コンテキストは肥大して話があちこちに逸れていく。**読み込みそのものに**
親モデルの単価を払い、しかもモデルが**1 つずつ**読む——時間もお金も、
二重に失われていきます。

**解決策。** 一度の `delegate_to_dsh` で、トークンを最も消費するサブタスクを
丸ごと、新しい独立した DeepSeek Harness エージェントへ渡します。実行はあなたの
ワークスペース内。ファイル I/O はすべてそちらで——一括で、ローカルで、安く。
親エージェントは判断を下す立場に留まり、本当に頭を使う部分だけを担います：
**計画・診断・判断・検証**。

100 の SWE-bench スタイル長期タスクでの実測（ヘテロジニアス構成：
親 = deepseek-v4-pro、DSH = deepseek-v4-flash；B 群は同じ親モデルで
プラグインなし）：

| | dsh-mcp あり | 素のエージェント |
|---|---|---|
| **正解率** | **100/100 · 100%** | 89/100 · 89% |
| **平均所要時間** | **76s** | 120s |
| **統計的有意性** | — | Fisher p < 0.001 |

速く、正確に——しかも正解率の差は**統計的に有意**になりました
（n=100 で p = 3.7×10⁻⁴、もはや方向性の結論ではありません）。最もコストの
かかる読み込みは、deepseek-v4-flash で動いています。
[完全なレポート](tests/bench/bench-report.md) · [自分で再現](#benchmark-レポート)

## 仕組み

![architecture](docs/architecture.png)

*生成に使ったプロンプトは
[`docs/architecture-image-prompt.md`](docs/architecture-image-prompt.md) に
あります。*

- **標準の MCP stdio サーバー。** MCP を話せるクライアントならどれでも使えます——
  Claude Code は、私たちがエンドツーエンドで検証したクライアントです（実 API
  呼び出し、サブディレクトリ起動、中国語、パス内スペースを確認済み）。
- **親エージェント・モデル。** 各委譲は自己完結型のサブタスクひとつ。DSH は
  ステートレスなワーカーです（呼び出しごとに新しいプロセス。汚染される
  セッションは存在しません）。
- **設定なしでそのまま動く。** DSH CLI を自動検出します（環境変数による
  上書き → 兄弟 checkout → 子ディレクトリ checkout → `%USERPROFILE%\.dsh` に
  インストール済みの CLI）。
- **Windows ファースト。** `process.execPath` + 明示的な argv、`shell: false`——
  引用符地獄も `.cmd` シムもなし。スペースを含むパスもそのまま動きます。

## クイックスタート

**ステップ 1 — ビルド（一度だけ）**

```powershell
cd dsh-mcp
npm install
npm run build                      # → dist\index.js
```

**ステップ 2 — お使いの MCP クライアントに登録（例として Claude Code）**

```powershell
claude mcp add dsh `
  --transport stdio `
  --env DEEPSEEK_API_KEY=sk-... `
  -- node D:\path\to\dsh-mcp\dist\index.js

claude mcp list                    # 一覧に "dsh" があることを確認
```

これは標準の MCP サーバーです——同じ `dist\index.js` が OpenAI Codex、
Cursor、VS Code など、あらゆる MCP クライアントでも動きます
（[デプロイ](#デプロイ) を参照）。

**ステップ 3 — Claude Code を再起動し、最初の委譲を実行**

MCP サーバーは起動時に読み込まれるので、任意のプロジェクト内で再起動して
から、ふつうの言葉で頼むだけです：

> DSH にこのプロジェクトの README.md と package.json を読ませ、プロジェクト名と
> README の最初の段落を報告させてください。ファイルは自分では読まないで——
> すべて委譲してください。

Claude が `delegate_to_dsh` を呼び出し、数秒で答えが返ってきます。DSH は
**あなたの**プロジェクトルートで実行されます——決して `dsh-mcp` ディレクトリ
では実行されません。

> `delegate_to_dsh` が表示されない？もう一度 `claude mcp list` を実行——
> サーバーの起動失敗はそこでエラーとして表示されます。
> [トラブルシューティング](#トラブルシューティング) へ。

## Benchmark レポート

> 100 の長期・複数ファイルタスクを 2 バッチで（01–50：バグ修正、リファクタリング、
> 移行、仕様からの実装、テスト駆動、監査；51–100：難易度アップ——深いデータフロー、
> 非同期レース、状態機械、パーサー、キャッシュ、プロセス間状態）· 自動化された
> ground-truth 検証（実行アサーション + stdout チェック；clean fixture は必ず
> FAIL、参考修正は必ず PASS）· ヘテロジニアス構成：両群の親 = deepseek-v4-pro、
> A 群の DSH = deepseek-v4-flash
> · **実験ノート：このベンチマークの Claude Code は deepseek-v4-pro カーネル
> で動いています**（`ANTHROPIC_MODEL` 環境変数で設定）——両群の親は DeepSeek
> モデルであり、Anthropic モデルではありません。つまり差分はまさにプラグ
> インそのもの：同じ DeepSeek 親モデルで、プラグインあり vs なし
> · 完全な詳細：[`tests/bench/bench-report.md`](tests/bench/bench-report.md)
> · タスクセット：[`tests/bench/tasks.mjs`](tests/bench/tasks.mjs)

| | dsh-mcp あり | 素のエージェント |
|---|---|---|
| **正解率** | **100/100 · 100%** | 89/100 · 89% |
| **平均所要時間** | **76.5s** | 120.2s |
| **総所要時間** | 7647s | 12019s |
| **失敗タスク** | 0 | 11 |

**数字が示すこと**

- **素のエージェントの失敗 11 件は、すべて「途中でやめた」系。** 5 件は
  複数ファイルの作業（リネーム、ログ移行、util 分割）：参照は直したのに旧
  ファイルを残す、5 ファイル中 3 つだけ移行して終了。5 件は単点の作業：
  2 つのバグのうち 1 つだけ修正、HTML 5 文字中 3 文字だけエスケープ、
  重複除去したのにソートしていない。DSH は委譲内で検証コマンドを実行してから
  返すため、「しっぽの漏れ」をそこで止められます。
- **複数ファイル調査系がいちばんの差**——委譲ひとつで「N ファイルの読み込み +
  分析」を一括処理。素のエージェントはファイルを 1 つずつ読み、長いセッションで
  初期の内容を失います。
- **今回は統計的に有意。** 正解率 100% vs 89%（n=100）の Fisher 正確検定
  p = 3.7×10⁻⁴（< 0.001）。20 タスクのパイロットは方向性のみでしたが、
  100 タスクで差が確定しました。
- **難易度の高いバッチ（51–100）ほどプラグインの価値が出る**——A 群は両
  バッチとも 100%、難しいバッチの平均 65s。B 群は 88% → 90% ですが、累計
  11 件の失敗は減っていません。
- **例外も正直に書いておきます** —— 共通モジュール抽出（10）は DSH 経由の
  ほうが遅い（複数ファイル書き換えの往復コスト）。難しいバッチでは再現していません。

再現：

```powershell
DEEPSEEK_API_KEY=sk-... node tests\bench\run-bench.mjs AB 01-50     # 両群 100 タスク
DEEPSEEK_API_KEY=sk-... node tests\bench\run-bench.mjs AB 51-100    # （範囲フィルター）
DEEPSEEK_API_KEY=sk-... node tests\e2e-headless.mjs           # 実 E2E（A/B/C/D）
DEEPSEEK_API_KEY=sk-... node tests\long-horizon-e2e.mjs       # 複数委譲ループ
```

> キーはサンドボックス内の一時 `mcp.json` にのみ置かれ、終了時に削除されます——
> リポジトリに書き込まれることも、出力されることもありません。

## ツール

責務ごとに分類したツール群——親エージェントが意図に合わせて正確に
選べます（ツール名と説明こそがモデルの判断材料です）：

| ツール | 何に使うか | 制約 |
|---|---|---|
| `delegate_to_dsh` | 汎用の自己完結タスク | なし——すべて task 文次第 |
| `dsh_investigate` | 読み取り専用の調査：ファイル閲覧、呼び出し経路の追跡、「X がどこから使われているか」 | ファイルを変更せず、副作用のあるコマンドを実行しないよう指示 |
| `dsh_fix` | コードの変更：バグ修正、リファクタリング、移行、明確に仕様化された実装 | 変更後は検証し（タスクが検査コマンドを指定している場合）、変更した全ファイルを列挙 |
| `dsh_execute` | コマンド実行：テストスイート、ビルドスクリプト、環境確認 | 完全な出力と終了コードを報告し、ソースは触らない |
| `dsh_status` | 環境診断：DSH 解決、CLI バージョン、モデル設定、タイムアウト、キーの有無 | DSH 子プロセスを起動せず、API キーも不要 |

委譲系ツールは共通のスキーマ：`task`（必須）、`cwd`（任意）、`timeoutMs`
（呼び出し単位で `DSH_MCP_TIMEOUT_MS` を上書き）、`trackChanges`（既定で on）。

**変更追跡——ブラックボックスに尻尾が付く。** DSH headless は最終メッセージ
しか返しません：diff もファイル一覧もありません。そこで委譲の前後で
ワークスペースをスナップショットし、結果の末尾に `[mcp]` ブロックを
付けて、親が委譲で実際に触れたファイルを確認できるようにします：

```text
<DSH の最終出力>

[mcp] exitCode: 0
[mcp] durationMs: 45210
[mcp] cwd: D:\workspace\foo
[mcp] changedFiles: 2
[mcp]   M src/store.js      (modified)
[mcp]   A src/store.test.js (added)
```

巨大リポジトリでは `trackChanges: false`（または `DSH_MCP_TRACK_CHANGES=0`）
でスナップショットを省けます。依存/ビルドディレクトリ（`node_modules`、
`.git`、`dist`、`build`、`coverage` など）と隠しディレクトリは常に
スナップショットから除外されます。

> 分類の制約はタスクテンプレートで適用されます（CLI レベルではありません
> ——DSH headless には読み取り専用フラグがありません）。変更追跡がセーフ
> ティネットです：万一 `dsh_investigate` が何かを変更してしまっても、
> `[mcp] changedFiles` が違反を暴き、親が自分で確認できます。

## デプロイ

`dsh-mcp` は**標準の MCP stdio サーバー**です。MCP を話せるクライアントなら
どれでもホストできます——Claude Code、OpenAI Codex、Cursor、VS Code、
Claude Desktop、あるいは自作ツール。サーバーと `dsh` ツール群はどの
クライアントでもまったく同じで、登録手順だけが違います。Claude Code は
私たちがエンドツーエンドで検証したクライアントです。

### Claude Code（1 コマンド——例）

```powershell
claude mcp add dsh `
  --transport stdio `
  --env DEEPSEEK_API_KEY=sk-... `
  -- node D:\path\to\dsh-mcp\dist\index.js

claude mcp list
```

### OpenAI Codex

Codex は `%USERPROFILE%\.codex\config.toml` から MCP サーバーを読み込みます
（プロジェクトレベル：`.codex\config.toml`）。追記：

```toml
[mcp_servers.dsh]
command = "node"
args = ["D:\\path\\to\\dsh-mcp\\dist\\index.js"]
env = { DEEPSEEK_API_KEY = "sk-..." }
```

`codex` を再起動して、そのまま頼んでください——例：「dsh_investigate
ツールで README と package.json を読み、プロジェクト名を報告して」。
Codex は DSH の内部を見られません（ホストにとって DSH はブラックボックス
です）——だからこそ、すべての委譲は `[mcp] changedFiles` ブロックを
返します：ホストが Claude Code でなくても、親は委譲が何に触れたかを
知ることができます。

### その他の MCP クライアント

`dist\index.js` を指し、同じ環境変数を設定してください。多くのクライアント
は JSON 形式の `mcpServers` 設定を受け付けます（Claude Code の
プロジェクトレベル設定、Cursor の `mcp.json`、VS Code、Claude Desktop など）：

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

> キーを git にコミットしないでください。自動化スクリプトは終了前に一時設定を
> 削除します。

### DSH はどこにインストールできますか？

dsh-mcp が DSH を探すのは、順番に見ていく正確に 4 か所だけです——
**`PATH` は見ません**：

1. `DSH_ROOT` 環境変数——明示指定。無条件に最優先
2. このパッケージの隣の checkout：`..\deepseek-harness`
3. このパッケージ内の子 checkout：`.\deepseek-harness`
4. DSH home 配下にインストールされた CLI パッケージ：
   `%USERPROFILE%\.dsh\profiles\node_modules\@deepseek-ai\dsh`
   （`DSH_HOME` で home を上書き可能）

つまり DSH は**どこにインストールしても構いません**——兄弟 checkout、
専用のツールディレクトリ、別ドライブでも——`DSH_ROOT` で指定すれば
OK です。どちらのレイアウトも認識します：ソース checkout（先に CLI を
ビルド：`pnpm install && pnpm run build`）またはインストール済み CLI
パッケージ（`<root>\lib\bin.js`）。この 4 か所以外は自動検出されません。
エラーメッセージが `DSH_ROOT` の設定を案内します。

```powershell
# 自分のディレクトリにある DSH を登録
claude mcp add dsh `
  --transport stdio `
  --env DEEPSEEK_API_KEY=sk-... `
  --env DSH_ROOT=D:\tools\deepseek-harness `
  -- node D:\path\to\dsh-mcp\dist\index.js
```

### 環境変数

| 変数 | 意味 |
| --- | --- |
| `DEEPSEEK_API_KEY` | **必須**。DSH 子プロセスへ環境経由で渡されます。 |
| `DSH_ROOT` | 任意。DSH の checkout / インストール済み CLI を指定。 |
| `DSH_HOME` | 任意。DSH home（既定 `%USERPROFILE%\.dsh`）。 |
| `DSH_MCP_TIMEOUT_MS` | 任意。子プロセスのタイムアウト；**未設定 = タイムアウトなし**。 |
| `DSH_MCP_DEBUG=1` | stderr 診断（`[dsh-mcp] dshRoot=... cli=...`）。 |

### トラブルシューティング

| 症状 | 対処 |
| --- | --- |
| `Unable to locate DeepSeek Harness` | `DSH_ROOT` を設定するか、DSH CLI をインストール（`npx @deepseek-ai/dsh`） |
| `CLI build artifact is missing` | DSH checkout で `pnpm install && pnpm run build` |
| `DEEPSEEK_API_KEY is not configured` | `--env DEEPSEEK_API_KEY=...` を付けて再登録し、Claude Code を再起動 |
| ワークスペースが違う | 解決順：ツール `cwd` → `CLAUDE_PROJECT_DIR` → `MCP_WORKSPACE_DIR` → サーバー cwd |
| 委譲が失敗して原因が分からない | まず `dsh_status` を実行——DSH 解決、CLI バージョン、モデル設定、タイムアウト、キーの有無を報告します |

## 委譲のしかた

委譲系ツールはどれも `task` 引数をひとつ取ります（完全なツール群は
[ツール](#ツール) を参照）。呼び出しのたびに**真新しい** DSH エージェントが
起動し、あなたのワークスペースで実行されて、最終結果を返します。DSH は
呼び出しをまたいだ**記憶を持ちません**——これが設計です（汚染される
セッションが存在しない）——そして、それこそが唯一の鉄則を決めます：

> **すべての委譲は自己完結に。** サブタスクに必要なものをすべて DSH に
> 渡してください：ファイルパス、コンテキスト、期待する結果。
> 「上と同じ」「さっきのように」「さっき言ったあのファイル」は禁止——
> DSH はあなたの会話を見られません。

### 良い委譲 vs 悪い委譲

同じタスク、2 通りの書き方：

```text
❌ 「store モジュールのバグを修正して検証して。」
   —— どのモジュール？ どのバグ？ どう検証する？ DSH は「そのバグ」を
      知りません。

✅ 「src/store.js の createOrder()（42 行目あたり）が注文合計の計算で
    tax フィールドを無視しています。合計に税が含まれるよう修正して
    ください。その後 node src/tests/order.test.js を実行し、出力を
    報告してください。」
   —— 自己完結：ファイル、バグ、期待する動作、検証コマンドが揃っています。
```

### ほとんどのケースをカバーする 3 つのテンプレート

**1. 調査 — DSH が読み、親がレポートを読む**

```text
src/modules/ の a.js、b.js、c.js を読んで報告してください：(1) 各ファイルが
エクスポートする関数シグネチャの一覧、(2) TODO/FIXME コメントと行番号、
(3) 各モジュールがどこから import されているか。変更はしないでください。
```

**2. 修正 + 検証 — 親が判断し、DSH が実行・確認する**

```text
src/utils.js の slugify("  hello ") が "hello " を返してしまいます
（先頭の空白が漏れる）。修正してから node src/test/utils.test.js を
実行し、どのアサーションが通ったか報告してください。
```

**3. 一括編集 — 多数の読み書き往復の代わりに、委譲ひとつ**

```text
プロジェクト全体で、config.port への参照をすべて config.serverPort に
変更してください（node_modules は除外）。変更したファイルを 1 行ずつ
列挙してください。
```

### 委譲すべきとき — すべきでないとき

| 委譲（トークン集約・自己完結） | 親に残す（コンテキストが必要） |
|---|---|
| N 個のファイルの読み込み + 要約 | 2 つのアーキテクチャの比較 |
| 複数ファイルのリネーム / 移行 / リファクタリング | 次に何を作るかの決定 |
| テストスイート / スクリプトの実行と出力報告 | どんどん変わるデバッグの会話 |
| 仕様が明確な関数の実装 | ゴール自体がまだ不明確なもの |

### セッションでの委譲の実際の流れ

```text
あなた:  ログインフローが壊れています。src/auth/ の login.js → session.js →
        db.js の呼び出しの流れを DSH に追跡させ、エラーがどこで握り
        つぶされ得るかを行番号付きで報告させてください。ファイルは
        自分では読まないでください。

DSH:    見つけました：src/auth/session.js:37 がエラーを捕捉して rethrow
        せず null を返すため、login.js は失敗を「未ログイン」として扱って
        います。3 つのファイルを読みましたが、変更はしていません。
```

## コストモデル

速くて安いのは、どちらも DSH 側で動くモデル——**deepseek-v4-flash**——による
ものです。初期開発はすべて flash で行われました（親エージェントも DSH も同様）。
上の 100 タスク benchmark はヘテロジニアス構成 **親 = deepseek-v4-pro[1m]、
DSH = deepseek-v4-flash** で実行しています（B 群は同じ pro 親モデルを
プラグインなしで使用——差はプラグインそのもの）。benchmark 内の Claude Code
カーネルは DeepSeek のモデルです（`ANTHROPIC_MODEL: deepseek-v4-pro[1m]`）——
Anthropic モデルではありません。以下の結論は「親が十分に強い」ことだけを
仮定しており、ベンダーには依存しません。

- **より速く** —— トークン集約的なサブタスク（ファイル読み込み、探索ループ）は
  親のセッションで直列に処理される代わりに、DSH 内で一括処理されます。実測の
  平均所要時間は −36%（76.5s vs 120.2s）。
- **より安く** —— 重いトークン消費が deepseek-v4-flash 価格で実行され、親の
  トークン予算は委譲によって最小限（純粋な推論のみ）に保たれます。
- **移行ゼロ** —— `delegate_to_dsh` はエンドツーエンドでモデル非依存です。

## 検証済み

| レイヤー | カバレッジ | 状態 |
| --- | --- | --- |
| ユニットテスト | 42 件の vitest（DSH 検出 / workspace / runner / 変更追跡 / ツール群） | ✅ |
| 実 E2E（Claude Code） | サブディレクトリ起動 · 中国語 · パスにスペース · 実 API | ✅ |
| 長期タスク | 計画 → 調査 → 診断 → 修正 → 読み返し → 検証 | ✅ 5/5 |
| A/B benchmark | 100 タスク × 2 群（正解率 + runtime、p<0.001） | ✅ |
| DSH 書き込みプローブ | headless プロファイルでのファイル書き込み | ✅ |

## 設計と制限（V0.x）

- **同期 wait-for-result** —— ストリーミングなし、バックグラウンドなし、ポーリング
  なし（設計ドキュメント §0/§23）。長いタスクは 1 回の長い MCP 呼び出しになり
  ます。既定ではタイムアウトしません。
- **ステートレスワーカー** —— 委譲のたびに新しい DSH プロセスが起動します
  （起動コストあり。単純なタスクでは問題ありません）。
- **並行委譲**が同じワークスペースを同時に変更するのは自己責任です——読み取り
  専用 / 独立したサブタスクを推奨します。
- **Windows ファースト**、MIT ライセンス。設計とエンジニアリング根拠：
  [`DSH_MCP_ENGINEERING(1).md`](DSH_MCP_ENGINEERING(1).md)（§0–§40）。

## 免責事項

`dsh-mcp` は独立したオープンソースプロジェクトであり、**OpenAI・Anthropic・
DeepSeek のいずれとも提携・承認・協力関係はありません**。DeepSeek Harness は
DeepSeek のオープンソースプロジェクトであり、本アダプタは MCP プロトコルを通じて
その CLI と統合しているにすぎません。すべての製品名および商標は、それぞれの
権利者に帰属します。

## License

MIT
