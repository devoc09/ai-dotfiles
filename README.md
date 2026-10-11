# ai-dotfiles

AI コーディングエージェント（Pi / Claude Code / opencode）の設定とスキルをまとめて管理するリポジトリ。
実体を本リポジトリに置き、各エージェントの所定パスへ symlink を張る。

## 管理対象

| パス | リンク先 | 備考 |
|---|---|---|
| `~/.pi/agent/settings.json` | `pi/settings.json` | Pi 設定。Pi の書き込みがそのまま本リポジトリに入る |
| `~/.pi/agent/keybindings.json` | `pi/keybindings.json` | Pi キーバインド |
| `~/.pi/agent/AGENTS.md` | `pi/AGENTS.md` | Pi 全体共通の指示 |
| `~/.agents/skills/<skill>` | `skills/<skill>` ほか | Pi が読む共有スキルのハブ |

管理しないもの（秘密情報・マシン固有・キャッシュのため）:

- `~/.pi/agent/auth.json`（認証情報。API キーは環境変数でも可）
- `~/.pi/agent/models-store.json`（自動生成キャッシュ）
- `~/.pi/agent/sessions/`（履歴）
- `~/.pi/agent/install/`, `~/.pi/agent/bin/`（Pi が自己更新するバイナリ）

## セットアップ

```sh
git clone git@github.com:devoc09/ai-dotfiles.git
cd ai-dotfiles
make
```

`make` は `pi` と `skills` を実行する。Claude Code / opencode からも自作スキルを使う場合は `make claude` を追加で実行する。

## スキルの方針

出自によって扱いを分ける。

- **自作** … `skills/` に実体を置く（例: `finding-vim-patches`）。
- **外部リポジトリ由来**（`eli5`, `explainer`） … 更新は `npx skills` や上流に任せ、リンクのみ張る。
- **プラグイン同梱**（`ponytail*`, `i-have-adhd`） … 更新はプラグイン側に任せ、リンクのみ張る。

`make skills` は `~/.agents/skills` を上記の方針で組み立て直す。

## 注意

- `settings.json` は symlink のため、`/settings` や `pi install` による変更は本リポジトリに反映される。こまめに commit する。
- `deviceId` はマシンごとに生成される値なので、このリポジトリでは管理しない。
