---
name: finding-vim-patches
description: Find Vim patches that are candidates for porting to Neovim (vim-patch). Lists Vim commits since the last synced patch, classifies them against the Nvim allow-list, and checks for open PRs. Use when the user asks which Vim patches could be ported to neovim, asks for missing/missing vim-patch list, or mentions "vim-patch" or "Vimパッチ" while working in a neovim checkout.
---

# Finding Vim patch candidates

List Vim commits not yet ported to Neovim, and judge which are worth porting.

## Step 1: List commits since the last synced patch

From the neovim repo root, run (execute, don't read):

```bash
bash ~/.agents/skills/finding-vim-patches/scripts/list_missing.sh
```

Clones Vim into `<repo>/.vim-src` on first run (a minute or two), then scans the most recent `WINDOW` (default 80) Vim commits and splits them into three sections:

- **candidates** — unported, unclaimed, in scope (with size)
- **claimed by an open PR** — someone is working on it; do not port (see Step 4)
- **skipped, likely N/A** — obvious N/A pre-filtered: subject keywords (Vim9 / scriptversion / GUI / GTK / channel / job / terminal / textprop / translations), `src/nvim/` files that don't exist in the checkout (`gui_*.c`, `textprop.c`, … — grep the symbol before trusting this), and version.c-only commits. Don't port these; they only feed the N/A report in Step 5.

A commit counts as ported when its patch token (`9.2.1110`) or 7-char Vim sha appears in the Nvim log of HEAD **or origin/master** (the script fetches it). **Pull before running, or you'll see stale candidates.** The pre-filter is heuristic: new Vimscript functions/commands or new features inside files Nvim *does* have still land in candidates — Step 3 catches those.

Note: `scripts/vim-patch.sh -l` in the repo does the same, but its array handling breaks on macOS bash 3.2 and it can list already-ported patches. Prefer the script above on macOS.

## Step 2: Inspect each candidate

For each commit, get subject + size (ignore `src/version.c`-only changes):

```bash
git -C .vim-src show --stat --format='%s' <sha>
```

Diffs under ~30 lines (excluding version.c) and test-only changes are the easiest ports.

## Step 3: Classify the remaining candidates against the allow-list

The script already filtered the obvious N/A cases; judge what's left.

Authoritative criteria live in `runtime/doc/dev_vimpatch.txt` section `|dev-vimpatch-na|` ("HOW TO DECIDE IF A VIM-PATCH IS WANTED") — it is an allow-list, not a deny-list.

- IN SCOPE ("OWNED BY VIM"): quickfix, regex, runtime files (syntax / ftplugin / doc).
- Accepted in practice even outside the list: security fixes, memory leaks, perf fixes, test fixes.
- UNWANTED: channel, job, terminal, Vim9script / `:scriptversion`, build warnings, GUI, most new Vimscript functions or Ex commands.
- Everything else (buffer / window / autocmd / input …) is Nvim-owned → likely N/A. Do not port; N/A patches get reported instead (comment on the open "version.c: update" PR, or the `vim-patch:N/A` commit-message format described in dev_vimpatch.txt).

When unsure about a subsystem, check how past patches for it were handled:

```bash
git log --grep='vim-patch' --oneline -- src/nvim/<subsystem>.c
```

## Step 4: PR status is checked automatically

The script matches every candidate against open `neovim/neovim` PRs by patch token (numbered patches) or 7-char Vim sha (runtime commits):

- `claimed by an open PR` — do not port. If the PR looks stalled (months old, no reviews), ask on the PR instead of porting in parallel.
- Merged PRs need no separate check: the script fetches origin/master, so a merged port appears in the log and the commit leaves the list.

Fallback / manual investigation of a specific patch:

```bash
gh pr list --repo neovim/neovim --state all --search 'vim-patch'
```

An open PR in review and a merged PR both mean taken; only port when no PR exists.

## Step 5: Report

Table sorted oldest-first — maintainers ask for the oldest missing patch first (later patches may depend on it):

| patch | subject | size | verdict |
|-------|---------|------|---------|

Verdicts: `port (recommended)`, `port (ok)`, `N/A`, `unsure — check maintainer preference`, `claimed (PR #N)`.

## Then what

Porting is a separate step: `bash scripts/vim-patch.sh -p vX.Y.ZZZZ` (see `:h dev-vimpatch`). Commit title format: `vim-patch:X.Y.ZZZZ: <original Vim subject>`; `version.c` must NOT be edited by hand — CI updates it.
