#!/usr/bin/env bash
# List recent Vim commits not yet ported to the Neovim checkout in $1, split into:
# candidates, claimed by an open PR, and skipped as likely N/A (Vim9, GUI,
# channel/job/terminal, translations, source files Nvim doesn't have).
#
# A commit counts as ported when its patch token (9.2.1110) or Vim sha appears
# in the Nvim log of HEAD or origin/master — so pull first or you'll see stale
# candidates.
#
# Usage: list_missing.sh [neovim-repo-dir]
#   VIM_SOURCE_DIR overrides where Vim sources live (default: <repo>/.vim-src)
#   NVIM_REPO      overrides the GitHub repo for PR checks (default: neovim/neovim)
#   WINDOW         how many recent Vim commits to scan (default: 80)
set -euo pipefail

nvim_dir="${1:-$(pwd)}"
vim_dir="${VIM_SOURCE_DIR:-$nvim_dir/.vim-src}"
repo="${NVIM_REPO:-neovim/neovim}"
window="${WINDOW:-80}"

if [ ! -d "$vim_dir/.git" ]; then
  echo "Cloning Vim into $vim_dir ..." >&2
  git clone --filter=blob:none https://github.com/vim/vim.git "$vim_dir"
else
  git -C "$vim_dir" fetch -q origin master
fi

# Refresh upstream master so patches merged upstream aren't re-listed.
git -C "$nvim_dir" fetch -q origin master 2>/dev/null || true
refs="HEAD"
if git -C "$nvim_dir" rev-parse -q --verify origin/master >/dev/null 2>&1; then
  refs="HEAD origin/master"
  behind=$(git -C "$nvim_dir" rev-list --count HEAD..origin/master || echo 0)
  if [ "${behind:-0}" -gt 0 ]; then
    echo "NOTE: local HEAD is $behind commits behind origin/master — consider: git pull --ff-only" >&2
  fi
fi

# Every vim-patch token (9.2.1110 / partial:9.2.1108 / 7+ char sha) in the Nvim
# log — full history, so a patch ported long ago is never re-listed.
ported=$(mktemp)
git -C "$nvim_dir" log $refs --format=%s%n%b |
  grep -oE 'vim-patch:(partial:)?[0-9]+\.[0-9]+\.[0-9]+|vim-patch:[0-9a-f]+' |
  sed 's/^vim-patch://' | sort -u > "$ported" || true

# Display-only sync point: newest token from recent commits (full history can
# contain stale tokens newer than anything Vim ever released).
last=$(git -C "$nvim_dir" log -100 $refs --format=%s%n%b |
  grep -oE 'vim-patch:[0-9]+\.[0-9]+\.[0-9]+' |
  sed 's/^vim-patch://' | sort -uV | tail -1 || true)
echo "last synced patch: ${last:-none}"
echo

# Open PRs only — merged ones are already in the log above.
prs=$(mktemp)
gh pr list --repo "$repo" --state open --limit 300 --json number,title,isDraft \
  --jq '.[] | "OPEN\t#\(.number)\t\(if .isDraft then "draft" else "open" end)\t\(.title)"' >> "$prs" 2>/dev/null || true

# Obvious N/A markers in the subject. This only pre-filters — new Vimscript
# functions/commands inside files Nvim *does* have still need Step 3 judgment.
na_subject_re='vim9|scriptversion|gui|gtk|channel|job|terminal|textprop|popup image|translation'

cand=$(mktemp) claim=$(mktemp) skip=$(mktemp)
trap 'rm -f "$ported" "$prs" "$cand" "$claim" "$skip"' EXIT

for sha in $(git -C "$vim_dir" log --reverse --format='%h' -"$window" origin/master); do
  subj=$(git -C "$vim_dir" show -s --format='%s' "$sha")
  files=$(git -C "$vim_dir" show --name-only --format='' "$sha")
  non_version=$(printf '%s\n' "$files" | grep -v '^src/version.c$' || true)
  if [ -z "$non_version" ]; then
    continue  # version.c-only: nothing to port
  fi

  # Patch token: numbered patches use "9.2.1110", runtime commits the 7-char
  # sha (how vim-patch PR titles reference them).
  case "$subj" in
    "patch "*)
      tok=$(printf '%s' "$subj" | sed -E 's/^patch ([0-9]+\.[0-9]+\.[0-9]+):.*/\1/')
      [ "$tok" = "$subj" ] && tok="" ;;
    *)
      tok=${sha%"${sha#???????}"} ;;
  esac
  [ -z "$tok" ] && continue

  # Already ported (log token or brace lists like "9.2.{1100,1101}" match via -F)?
  if grep -qF "$tok" "$ported"; then
    continue
  fi

  # Claimed by an open PR? (numeric tokens also match inside brace lists)
  case "$subj" in
    "patch "*)
      tre=$(printf '%s' "$tok" | sed 's/\./\\./g')
      pr=$(grep -E "${tre}([^0-9]|\$)" "$prs" | head -1 || true) ;;
    *)
      pr=$(grep -F "$tok" "$prs" | head -1 || true) ;;
  esac
  if [ -n "$pr" ]; then
    printf '%s %s [%s]\n' "$sha" "$subj" "$(printf '%s' "$pr" | tr '\t' ' ')" >> "$claim"
    continue
  fi

  reason=""
  for f in $non_version; do
    case "$f" in
      src/testdir/*) ;;  # Vim tests map loosely to Nvim's test/ — judge manually
      src/proto/*|*.pro) ;;  # Vim-only generated prototypes
      runtime/lang/*|src/po/*)
        reason="translations"; break ;;
      src/*)
        # Vim's src/X maps to Nvim's src/nvim/X.
        nf="src/nvim/${f#src/}"
        if [ ! -e "$nvim_dir/$nf" ]; then
          reason="Nvim has no $nf (may live elsewhere — grep the symbol first)"; break
        fi ;;
    esac
  done
  if [ -z "$reason" ] && printf '%s\n' "$subj" | grep -qiE "$na_subject_re"; then
    reason="subject: $(printf '%s\n' "$subj" | grep -oiE "$na_subject_re" | head -1)"
  fi

  size=$(git -C "$vim_dir" show --shortstat --format='' "$sha" | sed 's/^ *//')
  if [ -n "$reason" ]; then
    printf '%s %s [%s]\n' "$sha" "$subj" "$reason" >> "$skip"
  else
    printf '%s %s (%s)\n' "$sha" "$subj" "$size" >> "$cand"
  fi
done

print_section() {
  if [ -s "$1" ]; then
    echo
    echo "$2"
    cat "$1"
  fi
}

echo "=== candidates (unclaimed, in scope, oldest first)"
cat "$cand"
print_section "$claim" "=== claimed by an open PR (don't port; check review state if stalled)"
print_section "$skip"  "=== skipped, likely N/A (double-check before reporting)"
