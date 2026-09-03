#!/usr/bin/env bash
# GWP design-system adherence gate. Run after every migration task.
# Fails on: hex/rgb colour literals in components, surviving Vercel brand
# tokens, and Tailwind's own palette leaking in next to GWP's ramps.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
fail=0

report() { printf '\n== %s ==\n' "$1"; }

report "hex / rgb / oklch literals in components (must be empty)"
# Exclusions beyond .test./gwp.theme.css, each a category the token layer
# cannot express, not a missed migration site:
#   footer-social.tsx / google-icon.tsx — official third-party brand marks
#     (Messenger blue, the Google "G", etc.) are fixed by the trademark
#     owner, not by our design system.
#   order-qr.tsx        — QR modules must render true #000/#fff to stay
#     scannable regardless of theme.
#   camera-panel.tsx    — <canvas> 2D context fillStyle, not themed UI.
#   print-labels-sheet.tsx — an @media print stylesheet forcing a white
#     physical label background; paper has no theme.
#   bubble.tsx          — oklch(from var(--primary) ...) computes off the
#     --primary token via CSS relative-color syntax; it is not a literal.
#   chart.tsx           — the bracketed selectors match literal stroke
#     values recharts itself renders inline, to override the vendor
#     library's own hardcoded SVG colours; they are not values we chose.
#   sidebar.tsx:383     — a comment describing Tailwind's own default
#     (transparent scrollbar track), not a colour in code.
if grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(' \
     --include='*.tsx' --include='*.ts' src/components src/app \
     | grep -v '\.test\.' \
     | grep -v 'gwp.theme.css' \
     | grep -v 'footer-social.tsx' \
     | grep -v 'google-icon.tsx' \
     | grep -v 'order-qr.tsx' \
     | grep -v 'camera-panel.tsx' \
     | grep -v 'print-labels-sheet.tsx' \
     | grep -v 'bubble.tsx' \
     | grep -v 'chart.tsx' \
     | grep -v 'Tailwind defaults it to'; then
  echo "FAIL: colour literal outside the token layer"; fail=1
else echo "ok"; fi

report "surviving Vercel brand tokens (must be empty)"
if grep -rn 'vercel-\|gray-alpha-\|ease-geist' \
     --include='*.tsx' --include='*.ts' --include='*.css' src; then
  echo "FAIL: Vercel-era token still referenced"; fail=1
else echo "ok"; fi

report "Tailwind default palette next to GWP ramps (must be empty)"
# NOTE: sky / navy / action / cream / wash / yellow / green / red / orange /
# neutral are all GWP ramp names and must NOT appear in this list — GWP owns
# them. Only names GWP defines no ramp for are forbidden here.
if grep -rnE '\b(bg|text|border|ring|fill|stroke|divide)-(slate|gray|zinc|stone|amber|lime|emerald|teal|cyan|indigo|violet|purple|fuchsia|rose|blue)-[0-9]{2,3}\b' \
     --include='*.tsx' src; then
  echo "FAIL: non-GWP palette utility"; fail=1
else echo "ok"; fi

report "neutral steps GWP does not define (only 50 and 100 exist)"
# -P (not -E) for the negative lookahead; combining -E and -P errors out on
# some grep builds and would silently no-op this check.
if grep -rnP '\b(bg|text|border|ring|fill|stroke|divide)-neutral-(?!50\b|100\b)[0-9]{2,3}\b' \
     --include='*.tsx' src; then
  echo "FAIL: neutral step outside GWP's 50/100"; fail=1
else echo "ok"; fi

report "backend metadata palette read for chrome (must be empty)"
if grep -rn 'metadata\.\(theme\|color\)\|FULFILLED_STATUS' \
     --include='*.tsx' --include='*.ts' src/components; then
  echo "FAIL: reading the forbidden metadata.ts palette"; fail=1
else echo "ok"; fi

echo
[ "$fail" -eq 0 ] && echo "ADHERENCE: PASS" || echo "ADHERENCE: FAIL"
exit "$fail"
