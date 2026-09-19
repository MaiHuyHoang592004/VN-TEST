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

# Real addresses. Allowed: the domains RFC 2606 reserves for documentation
# (example.com/.net/.org — note that example.co.uk is a real registrable domain
# and is NOT reserved), GitHub's no-reply form, and `git@host`, which is an SSH
# user and host rather than an address.
EMAIL_ALLOW='(example\.(com|org|net)|test\.local|localhost|noreply@|users\.noreply\.github\.com|^git@)'

# ─── What gets scanned ───────────────────────────────────────────────────────
#
# The files that would be published, not every byte on disk. Inside a git
# repository that is exactly `git ls-files --cached --others --exclude-standard`
# — tracked files plus new ones that are not ignored. Scanning the working tree
# instead means a generated Prisma client or a node_modules fixture can fail
# the gate over a string that will never leave the machine, and a gate that
# cries wolf is a gate somebody switches off.
SELF="$(basename "${BASH_SOURCE[0]}")"

scanned_files() {
  if [[ -d .git ]] || git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git ls-files --cached --others --exclude-standard
  else
    find . -type f \
      -not -path './.git/*' -not -path '*/node_modules/*' -not -path '*/.next/*' \
      -not -path '*/dist/*' -not -path '*/.turbo/*' -not -path '*/coverage/*' \
      -printf '%P\n'
  fi | grep -vE "(^|/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|${SELF})$"
}

# Materialised once: every scanner reads the same list, and a repository with
# thousands of files is walked once rather than once per pattern.
FILE_LIST="$(scanned_files)"
[[ -n "$FILE_LIST" ]] || { echo "nothing to scan"; exit 0; }

grep_files() {
  printf '%s\n' "$FILE_LIST" | tr '\n' '\0' | xargs -0 -r grep "$@" 2>/dev/null
}

scan_tree() {
  local label="$1"; shift
  local hits=0
  for pattern in "$@"; do
    local out
    out="$(grep_files -niE -- "$pattern" | head -20)"
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
    #
    # The diff search excludes this file. It contains the denylist, so the
    # commit that adds it necessarily introduces every banned term — the gate
    # reports itself, on a repository that is otherwise spotless. Found the
    # first time it ran over a freshly extracted history, which is exactly when
    # a false positive is most expensive: it is the moment somebody decides the
    # check is noise and stops reading it.
    out="$( { git log --all --oneline -i --grep="$pattern" 2>/dev/null
              git log --all --oneline -i -S"$pattern" --pickaxe-regex \
                -- . ":(exclude)scripts/$SELF" 2>/dev/null
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

real_emails="$(grep_files -hoE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' \
  | grep -viE "$EMAIL_ALLOW" | sort -u)"
if [[ -n "$real_emails" ]]; then
  printf '%s✗ Email addresses outside the allowlist%s\n' "$RED" "$OFF"
  printf '%s\n' "$real_emails" | sed 's/^/    /'
  FAIL=1
else
  printf '%s✓ Email addresses%s\n' "$GREEN" "$OFF"
fi

# Spreadsheets, dumps and env files are never source.
bad_files="$(printf '%s\n' "$FILE_LIST" \
  | grep -iE '(\.(xlsx|xls|csv|tsv|dump|bak)$|(^|/)\.env(\.(local|production))?$)' || true)"
# A .sql file is legitimate only where Prisma generates one.
bad_sql="$(printf '%s\n' "$FILE_LIST" | grep -E '\.sql$' | grep -v '/prisma/migrations/' || true)"
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
