# ai-dotfiles

AI コーディングエージェント（主に Pi）の設定とスキルをまとめて管理するリポジトリ。
実体を本リポジトリに置き、各エージェントの所定パスへ symlink を張る。セットアップは mise のタスクで行う。

## 管理対象

| パス | 実体 | 備考 |
|---|---|---|
| `~/.pi/agent/settings.json` | `pi/settings.json` | Pi 設定。Pi の書き込みがそのまま本リポジトリに入る |
| `~/.pi/agent/keybindings.json` | `pi/keybindings.json` | Pi キーバインド |
| `~/.pi/agent/AGENTS.md` | `pi/AGENTS.md` | Pi 全体共通の指示 |
| `~/.agents/skills/finding-vim-patches` | `skills/finding-vim-patches` | 自作スキル（Pi が読む共有ロケーション） |

管理しないもの（秘密情報・マシン固有・キャッシュのため）:

- `~/.pi/agent/auth.json`（認証情報。API キーは環境変数でも可）
- `~/.pi/agent/models-store.json`（自動生成キャッシュ）
- `~/.pi/agent/sessions/`（履歴）
- `~/.pi/agent/install/`, `~/.pi/agent/bin/`（Pi が自己更新するバイナリ）

## セットアップ

```sh
git clone git@github.com:devoc09/ai-dotfiles.git
cd ai-dotfiles
mise run setup
```

### タスク

| タスク | 内容 |
|---|---|
| `mise run setup` | `link` と `skills` をまとめて実行 |
| `mise run link` | Pi の設定と自作スキルを symlink |
| `mise run skills` | 自作以外のスキルを `gh skill` で Pi にインストール |
| `mise run skills:update` | `gh skill` 管理のスキルを更新 |
| `mise run link:claude` | 自作スキルを Claude Code / opencode からも使えるようにリンク（任意） |

## スキルの方針

出自によって所有者を分ける。

- **自作**（`finding-vim-patches`） … 本リポジトリが実体を持ち、symlink で配置する。
- **自作以外**（`eli5`, `explainer`, `ponytail*`, `i-have-adhd`） … `gh skill` に配置と更新を任せる。
  `gh skill install ... --agent pi --scope user` で `~/.pi/agent/skills/` 配下に入り、更新は `gh skill update` で行う。
  本リポジトリは実体を持たず、インストールコマンドだけを `mise.toml` に記録する。

Pi は `~/.pi/agent/skills`（gh skill 管理）と `~/.agents/skills`（自作）の両方を読み込む。

## 注意

- `settings.json` は symlink のため、`/settings` や `pi install` による変更は本リポジトリに反映される。こまめに commit する。
- `deviceId` はマシンごとに生成される値なので、このリポジトリでは管理しない。
