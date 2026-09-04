#!/usr/bin/env bash
# GWP design-system adherence gate. Run after every migration task.
# Fails on: hex/rgb colour literals in components, surviving Vercel brand
# tokens, and Tailwind's own palette leaking in next to GWP's ramps.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
fail=0

report() { printf '\n== %s ==\n' "$1"; }

report "hex / rgb / oklch literals in components (must be empty)"
# Exclusions are REGEX false positives, not colour decisions — each is
# anchored to a path segment (a leading "/" and trailing ":") so it cannot
# also swallow an unrelated future file that merely shares a substring (e.g.
# a future revenue-chart.tsx next to chart.tsx). Categories:
#   footer-social.tsx / google-icon.tsx - official third-party brand marks
#     (Messenger blue, the Google "G", etc.) fixed by the trademark owner,
#     not by our design system.
#   order-qr.tsx           - QR modules must render true #000/#fff to stay
#     scannable regardless of theme.
#   camera-panel.tsx       - <canvas> 2D context fillStyle, not themed UI.
#   print-labels-sheet.tsx - an @media print stylesheet forcing a white
#     physical label background; paper has no theme.
#   chart.tsx              - the bracketed selectors match literal stroke
#     values recharts itself renders inline, to override the vendor
#     library's own hardcoded SVG colours; not values we chose.
#   gwp.theme.css           - the vendored, generated token file itself.
# The oklch(from ...) filter is by CONTENT, not filename: it is a colour
# DERIVED from a token via CSS relative-colour syntax (bubble.tsx's Tailwind
# arbitrary values use an underscore in place of the space; globals.css's
# hover-lift glow uses a real space) - not a literal, wherever it appears.
# The last filter drops whole-comment lines (a hex value mentioned in prose
# documentation is not an applied style).
if grep -rnE '#[0-9a-fA-F]{3,8}|rgba?\(|oklch\(|color-mix\(|:[[:space:]]*(white|black|red|blue|green|yellow|orange|purple|pink|gray|grey)' \
     --include='*.tsx' --include='*.ts' --include='*.css' src \
     | grep -v '\.test\.' \
     | grep -E -v '/gwp\.theme\.css:' \
     | grep -E -v '/footer-social\.tsx:' \
     | grep -E -v '/google-icon\.tsx:' \
     | grep -E -v '/order-qr\.tsx:' \
     | grep -E -v '/camera-panel\.tsx:' \
     | grep -E -v '/print-labels-sheet\.tsx:' \
     | grep -E -v '/chart\.tsx:' \
     | grep -F -v 'oklch(from_var(' \
     | grep -F -v 'oklch(from var(' \
     | grep -E -v 'color-mix\([^)]*var\(' \
     | grep -E -v '(mask|mask-image|mask-composite):' \
     | grep -E -v '^[^:]+:[0-9]+: *(//|\*|/\*)'; then
  echo "FAIL: colour literal outside the token layer"; fail=1
else echo "ok"; fi

report "surviving Vercel brand tokens (must be empty)"
if grep -rn 'vercel-\|gray-alpha-\|ease-geist' \
     --include='*.tsx' --include='*.ts' --include='*.css' src; then
  echo "FAIL: Vercel-era token still referenced"; fail=1
else echo "ok"; fi

report "Tailwind default palette next to GWP ramps (must be empty)"
# NOTE: sky / navy / action / cream / wash / yellow / green / red / orange /
# neutral are all GWP ramp names and must NOT appear in this list - GWP owns
# them. Only names GWP defines no ramp for are forbidden here.
if grep -rnE '\b(bg|text|border|ring|fill|stroke|divide)-(slate|gray|zinc|stone|amber|lime|emerald|teal|cyan|indigo|violet|purple|fuchsia|rose|blue)-[0-9]{2,3}\b' \
     --include='*.tsx' --include='*.ts' --include='*.css' src; then
  echo "FAIL: non-GWP palette utility"; fail=1
else echo "ok"; fi

report "neutral steps GWP does not define (only 50 and 100 exist)"
# -P (not -E) for the negative lookahead; combining -E and -P errors out on
# some grep builds and would silently no-op this check.
if grep -rnP '\b(bg|text|border|ring|fill|stroke|divide)-neutral-(?!50\b|100\b)[0-9]{2,3}\b' \
     --include='*.tsx' --include='*.ts' --include='*.css' src; then
  echo "FAIL: neutral step outside GWP's 50/100"; fail=1
else echo "ok"; fi

report "backend metadata palette read for chrome (must be empty)"
if grep -rn 'metadata\.\(theme\|color\)\|FULFILLED_STATUS' \
     --include='*.tsx' --include='*.ts' src/components; then
  echo "FAIL: reading the forbidden metadata.ts palette"; fail=1
else echo "ok"; fi

# --- Layer 4 checks. These only became meaningful once the pages themselves
# --- were recomposed, so they are appended rather than retrofitted.

report "status rendered as anything but StatusBadge (must be empty)"
# Every hand-picked status colour in the app was deleted in Layer 4. This is
# the check that stops the next one being added: a page must derive status
# colour from STATUS_TONES, never from a local ternary or variant map.
if grep -rnE '<Badge[^>]*status|statusVariant|statusColor|STATUS_COLORS'      --include='*.tsx' src/components/pages; then
  echo "FAIL: a page is picking a status colour by hand"; fail=1
else echo "ok"; fi

report "pages hand-rolling the operational page container (must be empty)"
# <Page> owns the max-w-7xl gutters. A <main> that sets that width itself is a
# page that did not adopt it. Deliberately anchored to <main ... max-w-7xl>
# rather than max-w-7xl alone: the fulfillment station's sticky action bar is a
# <div> that matches the page width on purpose, and the auth, invite, forbidden
# and coming-soon screens are centred full-height compositions that are NOT
# operational pages and must not be forced into one.
if grep -rnE '<main[^>]*max-w-7xl' --include='*.tsx' src/app src/components/pages      | grep -v '/components/ds/page\.tsx:'; then
  echo "FAIL: a page is not using <Page>"; fail=1
else echo "ok"; fi

report "display face used outside titles/KPIs (review each hit)"
# Informational, not failing: a legitimate new page title trips it too. DS rule
# 4 rations Baloo 2 to brand moments, page titles and KPI numbers, so every hit
# here should be one of those three and nothing else.
grep -rn 'font-display' --include='*.tsx' src/components src/app | grep -v '/components/ds/'
echo "(informational)"

echo
[ "$fail" -eq 0 ] && echo "ADHERENCE: PASS" || echo "ADHERENCE: FAIL"
exit "$fail"
