#!/usr/bin/env bash
# Fails when the previous product name appears outside .github/brand-guard-allowlist.txt.
# Usage: bash .github/brand-guard.sh [git-ref]   (no ref: tracked files in the working tree)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

pattern='hy[p]er?nomia'
allow='.github/brand-guard-allowlist.txt'
ref=("$@")

set +e
hits=$(git grep -n -I -i -E "$pattern" "${ref[@]}" -- . ":(exclude)$allow")
rc=$?
set -e
[ "$rc" -le 1 ] || exit "$rc"

entries=$(grep -v -e '^#' -e '^$' "$allow" || true)
if [ -n "$hits" ] && [ -n "$entries" ]; then
  hits=$(printf '%s\n' "$hits" | grep -v -F -e "$entries" || true)
fi

if [ ${#ref[@]} -gt 0 ]; then
  names=$(git ls-tree -r --name-only "${ref[0]}" | grep -i -E "$pattern" || true)
else
  names=$(git ls-files | grep -i -E "$pattern" || true)
fi

if [ -n "$hits" ] || [ -n "$names" ]; then
  echo "Previous product name found (use Starlecta, or add a fixed substring to $allow):"
  if [ -n "$hits" ]; then printf '%s\n' "$hits"; fi
  if [ -n "$names" ]; then printf '%s\n' "$names" | sed 's/^/file name: /'; fi
  exit 1
fi
echo "brand guard: clean"
