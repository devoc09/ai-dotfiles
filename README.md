# ai-dotfiles

Configuration and skills for AI coding agents (mainly Pi), managed like dotfiles.
The repository holds the source of truth and symlinks it into each tool's expected path.
Setup runs through mise tasks.

## Managed paths

| Path | Source | Notes |
|---|---|---|
| `~/.pi/agent/settings.json` | `pi/settings.json` | Pi settings. Pi writes here, so changes land in this repository |
| `~/.pi/agent/keybindings.json` | `pi/keybindings.json` | Pi keybindings |
| `~/.pi/agent/AGENTS.md` | `pi/AGENTS.md` | Global instructions for Pi |
| `~/.agents/skills/finding-vim-patches` | `skills/finding-vim-patches` | Owned skill (shared location Pi reads) |

Not managed (secrets, machine-local state, caches):

- `~/.pi/agent/auth.json` (credentials; API keys can come from environment variables instead)
- `~/.pi/agent/models-store.json` (generated cache)
- `~/.pi/agent/sessions/` (history)
- `~/.pi/agent/install/`, `~/.pi/agent/bin/` (binaries Pi updates itself)

## Setup

```sh
git clone git@github.com:devoc09/ai-dotfiles.git
cd ai-dotfiles
mise run setup
```

### Tasks

| Task | Purpose |
|---|---|
| `mise run setup` | Run `link` and `skills` |
| `mise run link` | Symlink Pi configuration and the owned skill |
| `mise run skills` | Install non-owned skills for Pi via `gh skill` |
| `mise run skills:update` | Update `gh skill`-managed skills |
| `mise run link:claude` | Also link the owned skill for Claude Code / opencode (optional) |

## Skill policy

Ownership is split by origin.

- **Owned** (`finding-vim-patches`): this repository holds the content and links it into place.
- **Non-owned** (`eli5`, `explainer`, `ponytail*`, `i-have-adhd`): `gh skill` owns installation and updates.
  `gh skill install ... --agent pi --scope user` places them under `~/.pi/agent/skills/`, and `gh skill update` keeps them current.
  This repository keeps no copy, only the install commands in `mise.toml`.

Pi reads both `~/.pi/agent/skills` (managed by gh skill) and `~/.agents/skills` (owned skills).

## Notes

- `settings.json` is a symlink, so changes made through `/settings` or `pi install` land in this repository. Commit them.
- `deviceId` is generated per machine and is not tracked here.
