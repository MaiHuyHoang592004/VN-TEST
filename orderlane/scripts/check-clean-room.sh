#!/usr/bin/env bash
#
# check-clean-room.sh — refuses anything that should not be in a public repo.
#
# This project was designed and built from scratch, but it was informed by
# commercial work. That makes "nothing from that work is in here" a claim, and
# a claim nobody re-checks is one that quietly stops being true around the
# tenth commit. So it is a gate instead.
#
# It scans the working tree AND the commit messages and diffs, because
# sanitising files while leaving the history alone is the usual way this is got
# wrong.
#
#   bash scripts/check-clean-room.sh            # tree + history
#   bash scripts/check-clean-room.sh --tree     # tree only (fast, pre-commit)
#
# Exit 0 clean, 1 on any finding.
#
set -uo pipefail

ROOT="${CLEAN_ROOM_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null)}"
ROOT="${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT" || exit 1

TREE_ONLY=0
[[ "${1:-}" == "--tree" ]] && TREE_ONLY=1

FAIL=0
RED=$'\033[31m'; GREEN=$'\033[32m'; DIM=$'\033[2m'; OFF=$'\033[0m'
[[ -t 1 ]] || { RED=""; GREEN=""; DIM=""; OFF=""; }

# ─── Denylists ───────────────────────────────────────────────────────────────
# Case-insensitive extended regular expressions. Keep these specific: a pattern
# broad enough to match ordinary English will be disabled by the first person it
# annoys, and a disabled gate checks nothing.

# Prior employers, products and people.
BANNED_IDENTITY=(
  'gwprint'
  'gwprintz'
  'goodwoodprint'
  'opcreative'
)

# Table and concept names from a system that is not this one. This is the layer
# renaming does not hide, which is why it is checked separately.
BANNED_PRIOR_SCHEMA=(
  'topuptransaction'
  'basketposition'
  'warehouseinventory'
  'stockimport'
  'importmovement'
  'warehouse_external'
  'fulfillment-system-be'
)

# Vendors and internal integrations that were somebody else's commercial choice.
BANNED_VENDORS=(
  'kiloship'
  'pirateship'
  'drx_(api|webhook)'
  'drive\.google\.com'
  'drive-thirdparty\.googleusercontent\.com'
)

# Phrasing that reveals this as a working copy of something else rather than a
# product in its own right.
BANNED_PROVENANCE=(
  'legacy (system|backend|database|schema|table|data)'
  'migrat(ed|ion) (from|report|status)'
  'mangled.source'
  '\.archive/'
  'oldproject'
)

# Real addresses. Domains reserved for documentation are allowed.
EMAIL_ALLOW='(example\.(com|org|net)|test\.local|localhost|noreply@|users\.noreply\.github\.com)'

# ─── Scanners ────────────────────────────────────────────────────────────────
GREP_EXCLUDES=(
  --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next
  --exclude-dir=dist --exclude-dir=coverage --exclude-dir=.turbo
  --exclude=package-lock.json --exclude=pnpm-lock.yaml --exclude=yarn.lock
  --exclude="$(basename "${BASH_SOURCE[0]}")"
)

scan_tree() {
  local label="$1"; shift
  local hits=0
  for pattern in "$@"; do
    local out
    out="$(grep -rniE "${GREP_EXCLUDES[@]}" -- "$pattern" . 2>/dev/null | head -20)"
    if [[ -n "$out" ]]; then
      (( hits == 0 )) && printf '%s✗ %s%s\n' "$RED" "$label" "$OFF"
      hits=1; FAIL=1
      printf '  %s/%s/%s\n' "$DIM" "$pattern" "$OFF"
      printf '%s\n' "$out" | sed 's/^/    /'
    fi
  done
  (( hits == 0 )) && printf '%s✓ %s%s\n' "$GREEN" "$label" "$OFF"
}

scan_history() {
  local label="$1"; shift
  local hits=0
  for pattern in "$@"; do
    local out
    # --grep searches commit messages; -S --pickaxe-regex searches the diffs.
    out="$( { git log --all --oneline -i --grep="$pattern" 2>/dev/null
              git log --all --oneline -i -S"$pattern" --pickaxe-regex 2>/dev/null
            } | sort -u | head -10 )"
    if [[ -n "$out" ]]; then
      (( hits == 0 )) && printf '%s✗ %s%s\n' "$RED" "$label" "$OFF"
      hits=1; FAIL=1
      printf '  %s/%s/%s\n' "$DIM" "$pattern" "$OFF"
      printf '%s\n' "$out" | sed 's/^/    /'
    fi
  done
  (( hits == 0 )) && printf '%s✓ %s%s\n' "$GREEN" "$label" "$OFF"
}

echo "── Working tree ──────────────────────────────────────────"
scan_tree "Prior employers, products, people" "${BANNED_IDENTITY[@]}"
scan_tree "Prior system's schema"             "${BANNED_PRIOR_SCHEMA[@]}"
scan_tree "Third-party vendors"               "${BANNED_VENDORS[@]}"
scan_tree "Provenance phrasing"               "${BANNED_PROVENANCE[@]}"

real_emails="$(grep -rhoE "${GREP_EXCLUDES[@]}" \
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' . 2>/dev/null \
  | grep -viE "$EMAIL_ALLOW" | sort -u)"
if [[ -n "$real_emails" ]]; then
  printf '%s✗ Email addresses outside the allowlist%s\n' "$RED" "$OFF"
  printf '%s\n' "$real_emails" | sed 's/^/    /'
  FAIL=1
else
  printf '%s✓ Email addresses%s\n' "$GREEN" "$OFF"
fi

# Spreadsheets, dumps and env files are never source. A .sql file is legitimate
# only where Prisma generates one.
bad_files="$(find . \
    -path ./.git -prune -o -path ./node_modules -prune -o -path ./.next -prune -o \
    \( -name '*.xlsx' -o -name '*.xls' -o -name '*.csv' -o -name '*.tsv' \
       -o -name '*.dump' -o -name '*.bak' -o -name '.env' -o -name '.env.local' \
       -o -name '.env.production' \) -print 2>/dev/null)"
bad_sql="$(find . -name '*.sql' -not -path './.git/*' -not -path './node_modules/*' \
    -not -path '*/prisma/migrations/*' -print 2>/dev/null)"
if [[ -n "$bad_files$bad_sql" ]]; then
  printf '%s✗ Data or secret files that must not be committed%s\n' "$RED" "$OFF"
  printf '%s\n' "$bad_files$bad_sql" | grep -v '^$' | sed 's/^/    /'
  FAIL=1
else
  printf '%s✓ File types%s\n' "$GREEN" "$OFF"
fi

if (( TREE_ONLY == 0 )) && [[ -d .git ]]; then
  echo
  echo "── Commit history ────────────────────────────────────────"
  scan_history "Prior employers, products, people" "${BANNED_IDENTITY[@]}"
  scan_history "Prior system's schema"             "${BANNED_PRIOR_SCHEMA[@]}"
  scan_history "Provenance phrasing"               "${BANNED_PROVENANCE[@]}"
fi

echo
if (( FAIL )); then
  printf '%sNOT CLEAN — resolve the findings above before publishing.%s\n' "$RED" "$OFF"
  exit 1
fi
printf '%sClean.%s\n' "$GREEN" "$OFF"
