#!/bin/bash
# wt.sh add <slug> <branch>   -> prints the path of a throwaway worktree of origin/<branch> at <repo>/.animatic/wt-<slug>
# wt.sh rm  <slug>
# Records exactly what is in a PR without touching your own checkout, and without a second `npm/bun install`:
# node_modules is rebuilt as links. Workspace links (relative symlinks, e.g. node_modules/@acme/ui -> ../../packages/ui)
# are copied as-is so they point at the worktree's own code; every other package links to your checkout's copy.
set -euo pipefail
MAIN=$(git rev-parse --show-toplevel)
WT="$MAIN/.animatic/wt-$2"
if [ "$1" = rm ]; then git -C "$MAIN" worktree remove --force "$WT" 2>/dev/null || rm -rf "$WT"; git -C "$MAIN" worktree prune; exit 0; fi
git -C "$MAIN" fetch -q origin "$3"
[ -d "$WT" ] || git -C "$MAIN" worktree add --detach "$WT" "origin/$3" >/dev/null
link_dir() { # $1 = node_modules dir relative to repo root
  local src="$MAIN/$1" dst="$WT/$1"; [ -d "$src" ] || return 0; [ -d "$(dirname "$dst")" ] || return 0
  mkdir -p "$dst"
  for e in "$src"/* "$src"/.bin; do
    [ -e "$e" ] || [ -L "$e" ] || continue; n=$(basename "$e"); [ -e "$dst/$n" ] || [ -L "$dst/$n" ] && continue
    if [[ "$n" == @* ]] && [ -d "$e" ] && [ ! -L "$e" ]; then           # a scope folder: go one level down
      mkdir -p "$dst/$n"
      for s in "$e"/*; do t=$(readlink "$s" 2>/dev/null || true)
        if [ -n "$t" ] && [[ "$t" != /* ]]; then ln -s "$t" "$dst/$n/$(basename "$s")"; else ln -s "$s" "$dst/$n/$(basename "$s")"; fi
      done
    else t=$(readlink "$e" 2>/dev/null || true)
      if [ -n "$t" ] && [[ "$t" != /* ]]; then ln -s "$t" "$dst/$n"; else ln -s "$e" "$dst/$n"; fi
    fi
  done
}
link_dir node_modules
for d in $(cd "$MAIN" && find . -mindepth 3 -maxdepth 3 -type d -name node_modules -not -path './node_modules/*' -not -path './.animatic/*' | sed 's#^\./##'); do link_dir "$d"; done
# local env files the app needs (never committed): copy them over
(cd "$MAIN" && git ls-files --others --ignored --exclude-standard -- '*.env' '*.env.*' '**/.env' '**/.env.*' 2>/dev/null) | while read -r f; do
  case "$f" in .animatic/*|*/node_modules/*) continue;; esac
  [ -d "$WT/$(dirname "$f")" ] && cp "$MAIN/$f" "$WT/$f"
done
echo "$WT"
