#!/usr/bin/env bash
#
# extract.sh — copy this tree into a standalone repository with a new history.
#
# This project was developed inside a private staging repository. It is meant
# to become a public repository whose history starts at its first commit, and
# the mechanics of getting there are the point:
#
#   COPY the files. Do NOT carry the history.
#
# Not `git subtree split`, not `git filter-repo`, not adding the staging
# repository as a remote. All three move commits across, and the commits are
# the thing being left behind. A clean history is one with nothing in it to
# sanitise — not one that has been sanitised.
#
#   bash scripts/extract.sh ~/orderlane
#
set -euo pipefail

DEST="${1:-}"
if [[ -z "$DEST" ]]; then
  echo "usage: bash scripts/extract.sh <destination>" >&2
  exit 2
fi
if [[ -e "$DEST" ]]; then
  echo "refusing to write into an existing path: $DEST" >&2
  exit 1
fi

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "→ copying $SRC to $DEST"
mkdir -p "$DEST"

# Build artefacts, dependencies and generated code are reproducible from
# source, so they are not source. Excluding them here means the new repository
# cannot inherit a stale one.
tar -C "$SRC" \
  --exclude='./.git' \
  --exclude='./node_modules' \
  --exclude='*/node_modules' \
  --exclude='./.next' \
  --exclude='*/.next' \
  --exclude='./.turbo' \
  --exclude='*/.turbo' \
  --exclude='*/dist' \
  --exclude='*/src/generated' \
  --exclude='./.env*' \
  --exclude='*/.env*' \
  --exclude='*.tsbuildinfo' \
  -cf - . | tar -C "$DEST" -xf -

# These instructions are about leaving the staging repository. Once you have,
# they are somebody else's confusing archaeology.
rm -f "$DEST/EXTRACT.md"
# `.env.example` is tracked and belongs in the copy; the excludes above are
# deliberately aggressive, so put it back.
cp "$SRC/.env.example" "$DEST/.env.example"

echo "→ new history"
cd "$DEST"
git init -q -b main
git add -A
git -c user.name="${GIT_AUTHOR_NAME:-$(git config --global user.name || echo 'Orderlane')}" \
    -c user.email="${GIT_AUTHOR_EMAIL:-$(git config --global user.email || echo 'noreply@example.com')}" \
    commit -q -m "Initial public release

A multi-tenant fulfillment workspace: catalogue, orders, production and
shipping in one place, with a fulfillment process each merchant configures
rather than inherits.

Four decisions carry the design, each written up in docs/design:

  * The fulfillment lifecycle is configuration, not a type. A dependency-free
    engine moves work around a graph a merchant defines.
  * Money is a double-entry ledger of immutable postings. Balances are
    projected from entries, never stored in a column that can drift.
  * Bulk import stages, previews, then commits, and is idempotent by content.
  * Tenant isolation is a mechanism, not a discipline: a Prisma client
    extension a caller cannot widen.

Sessions are rows rather than tokens, because in a multi-tenant system the
claim being carried is revocable."

echo "→ checking"
bash scripts/check-clean-room.sh

echo
echo "Done. $DEST is a repository with one commit and no upstream."
echo
echo "Before publishing:"
echo "  cd $DEST"
echo "  npm ci && npm run generate -w @orderlane/db && npm test"
echo "  git remote add origin git@github.com:<you>/orderlane.git"
echo "  git push -u origin main"
