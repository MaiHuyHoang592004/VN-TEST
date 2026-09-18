#!/usr/bin/env bash
#
# check-clean-room.sh — cổng chặn dấu vết lineage.
#
# Chạy trong CI của repo công khai. Trả về 0 khi sạch, 1 khi tìm thấy vi phạm.
# Quét cả cây làm việc lẫn lịch sử Git (thông điệp commit), vì sanitize file mà
# quên history là lỗ hổng phổ biến nhất.
#
#   bash scripts/check-clean-room.sh            # cây làm việc + history
#   bash scripts/check-clean-room.sh --tree     # chỉ cây làm việc (nhanh, cho pre-commit)
#
set -uo pipefail

# Gốc repo: ưu tiên git, để script chạy đúng dù được đặt ở đâu.
ROOT="${CLEAN_ROOM_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null)}"
ROOT="${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT" || exit 1

TREE_ONLY=0
[[ "${1:-}" == "--tree" ]] && TREE_ONLY=1

FAIL=0
RED=$'\033[31m'; GREEN=$'\033[32m'; DIM=$'\033[2m'; OFF=$'\033[0m'
[[ -t 1 ]] || { RED=""; GREEN=""; DIM=""; OFF=""; }

# ─── Danh sách cấm ──────────────────────────────────────────────────────────
# Sửa cho đúng dự án của bạn. Mỗi dòng là một regex ERE, so khớp không phân biệt
# hoa thường.

# Tên công ty, sản phẩm cũ, con người.
BANNED_IDENTITY=(
  'gwprint'
  'gwprintz'
  'goodwoodprint'
  'opcreative'
  'niyamvora'
  'huyhoang[0-9]*'
)

# Tên bảng/khái niệm của hệ thống cũ. Đây là lớp mà "đổi tên" không giấu được,
# nên nó phải nằm trong gate.
BANNED_LEGACY_SCHEMA=(
  'topuptransaction'
  'basketposition'
  'warehouseinventory'
  'stockimport'
  'importmovement'
  'warehouse_external'
  'fulfillment-system-be'
)

# Nhà cung cấp và tích hợp nội bộ.
BANNED_VENDORS=(
  'kiloship'
  'pirateship'
  'drx_(api|webhook)'
  'drive\.google\.com'
  'drive-thirdparty\.googleusercontent\.com'
)

# Từ ngữ tố cáo repo là bản sao đang làm việc chứ không phải sản phẩm.
BANNED_PROVENANCE=(
  'legacy (system|backend|database|schema|table|data)'
  'migrat(ed|ion) (from|report|status)'
  'mangled.source'
  '\.archive/'
  'oldproject'
)

# Email và domain thật. Cho phép rõ ràng các domain dành riêng cho ví dụ.
EMAIL_ALLOW='(example\.(com|org|net)|test\.local|localhost|noreply@|your-app\.com)'

# ─── Hàm quét ───────────────────────────────────────────────────────────────
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
      if (( hits == 0 )); then printf '%s✗ %s%s\n' "$RED" "$label" "$OFF"; fi
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
    # -S tìm trong nội dung diff; --grep tìm trong thông điệp commit.
    out="$( { git log --all --oneline --grep="$pattern" -i 2>/dev/null
              git log --all --oneline -i -S"$pattern" --pickaxe-regex 2>/dev/null
            } | sort -u | head -10 )"
    if [[ -n "$out" ]]; then
      if (( hits == 0 )); then printf '%s✗ %s%s\n' "$RED" "$label" "$OFF"; fi
      hits=1; FAIL=1
      printf '  %s/%s/%s\n' "$DIM" "$pattern" "$OFF"
      printf '%s\n' "$out" | sed 's/^/    /'
    fi
  done
  (( hits == 0 )) && printf '%s✓ %s%s\n' "$GREEN" "$label" "$OFF"
}

# ─── 1. Cây làm việc ────────────────────────────────────────────────────────
echo "── Cây làm việc ──────────────────────────────────────────"
scan_tree "Tên công ty / sản phẩm cũ / con người" "${BANNED_IDENTITY[@]}"
scan_tree "Lược đồ hệ thống cũ"                   "${BANNED_LEGACY_SCHEMA[@]}"
scan_tree "Nhà cung cấp và tích hợp nội bộ"       "${BANNED_VENDORS[@]}"
scan_tree "Dấu vết quá trình làm việc"            "${BANNED_PROVENANCE[@]}"

# ─── 2. Email thật ──────────────────────────────────────────────────────────
real_emails="$(grep -rhoE "${GREP_EXCLUDES[@]}" \
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' . 2>/dev/null \
  | grep -viE "$EMAIL_ALLOW" | sort -u)"
if [[ -n "$real_emails" ]]; then
  printf '%s✗ Email ngoài danh sách cho phép%s\n' "$RED" "$OFF"
  printf '%s\n' "$real_emails" | sed 's/^/    /'
  FAIL=1
else
  printf '%s✓ Email%s\n' "$GREEN" "$OFF"
fi

# ─── 3. Loại file không được tồn tại ────────────────────────────────────────
bad_files="$(find . \
    -path ./.git -prune -o -path ./node_modules -prune -o -path ./.next -prune -o \
    \( -name '*.xlsx' -o -name '*.xls' -o -name '*.csv' -o -name '*.tsv' \
       -o -name '*.dump' -o -name '*.bak' -o -name '.env' -o -name '.env.local' \
       -o -name '.env.prod' -o -name '.env.production' \) -print 2>/dev/null)"
# File .sql chỉ hợp lệ khi nằm trong prisma/migrations (do Prisma sinh ra).
bad_sql="$(find . -name '*.sql' -not -path './.git/*' -not -path './node_modules/*' \
    -not -path '*/prisma/migrations/*' -print 2>/dev/null)"
if [[ -n "$bad_files$bad_sql" ]]; then
  printf '%s✗ File dữ liệu / bí mật không được commit%s\n' "$RED" "$OFF"
  printf '%s\n' "$bad_files$bad_sql" | grep -v '^$' | sed 's/^/    /'
  FAIL=1
else
  printf '%s✓ Loại file%s\n' "$GREEN" "$OFF"
fi

# ─── 4. Lịch sử Git ─────────────────────────────────────────────────────────
if (( TREE_ONLY == 0 )) && [[ -d .git ]]; then
  echo
  echo "── Lịch sử Git ───────────────────────────────────────────"
  scan_history "Tên công ty / sản phẩm cũ / con người" "${BANNED_IDENTITY[@]}"
  scan_history "Lược đồ hệ thống cũ"                   "${BANNED_LEGACY_SCHEMA[@]}"
  scan_history "Dấu vết quá trình làm việc"            "${BANNED_PROVENANCE[@]}"
fi

echo
if (( FAIL )); then
  printf '%sKHÔNG SẠCH — sửa các mục trên trước khi public.%s\n' "$RED" "$OFF"
  exit 1
fi
printf '%sSẠCH.%s\n' "$GREEN" "$OFF"
