<!--
  ARCHIVED — HISTORY, NOT AUTHORITY.

  This is the pre-migration Geist/Vercel spec the dashboard was built to. The
  app now follows the GoodWoodPrint design system in `docs/design-system/`;
  read `SKILL.md` (the four rules, one page) and then `readme.md`.

  It is kept because it documents what was built and why, and because a
  component whose behaviour was decided here still behaves that way. Do NOT
  take a colour, a shadow, a type scale or a component recipe from this file:
  every one of them was remapped in the migration, and the design system names
  the old theme among the sources that will mislead a reader.
-->

---
version: alpha
name: Geist
description: Vercel’s Geist design system, Light theme (the Dark theme is documented at /design.dark.md).
colors:
  primary: "#171717"
  secondary: "#4d4d4d"
  tertiary: "#006bff"
  neutral: "#f2f2f2"
  background-100: "#ffffff"
  background-200: "#fafafa"
  gray-100: "#f2f2f2"
  gray-200: "#ebebeb"
  gray-300: "#e6e6e6"
  gray-400: "#eaeaea"
  gray-500: "#c9c9c9"
  gray-600: "#a8a8a8"
  gray-700: "#8f8f8f"
  gray-800: "#7d7d7d"
  gray-900: "#4d4d4d"
  gray-1000: "#171717"
  gray-alpha-100: "#0000000d"
  gray-alpha-200: "#00000015"
  gray-alpha-300: "#0000001a"
  gray-alpha-400: "#00000014"
  gray-alpha-500: "#00000036"
  gray-alpha-600: "#0000003d"
  gray-alpha-700: "#00000070"
  gray-alpha-800: "#00000082"
  gray-alpha-900: "#000000b3"
  gray-alpha-1000: "#000000e8"
  blue-100: "#f0f7ff"
  blue-200: "#e9f4ff"
  blue-300: "#dfefff"
  blue-400: "#cae7ff"
  blue-500: "#94ccff"
  blue-600: "#48aeff"
  blue-700: "#006bff"
  blue-800: "#0059ec"
  blue-900: "#005ff2"
  blue-1000: "#002359"
  red-100: "#ffeeef"
  red-200: "#ffe8ea"
  red-300: "#ffe3e4"
  red-400: "#ffd7d6"
  red-500: "#ffb1b3"
  red-600: "#ff676d"
  red-700: "#fc0035"
  red-800: "#ea001d"
  red-900: "#d8001b"
  red-1000: "#47000c"
  amber-100: "#fff6de"
  amber-200: "#fff4cf"
  amber-300: "#fff1c1"
  amber-400: "#ffdc73"
  amber-500: "#ffc543"
  amber-600: "#ffa600"
  amber-700: "#ffae00"
  amber-800: "#ff9300"
  amber-900: "#aa4d00"
  amber-1000: "#561900"
  green-100: "#ecfdec"
  green-200: "#e5fce7"
  green-300: "#d3fad1"
  green-400: "#b9f5bc"
  green-500: "#82eb8d"
  green-600: "#4ce15e"
  green-700: "#28a948"
  green-800: "#279141"
  green-900: "#107d32"
  green-1000: "#003a00"
  teal-100: "#defffb"
  teal-200: "#ddfef6"
  teal-300: "#ccf9f1"
  teal-400: "#b1f7ec"
  teal-500: "#52f0db"
  teal-600: "#00e3c4"
  teal-700: "#00ac96"
  teal-800: "#00927f"
  teal-900: "#007f70"
  teal-1000: "#003f34"
  purple-100: "#faf0ff"
  purple-200: "#f9f0ff"
  purple-300: "#f6e8ff"
  purple-400: "#f2d9ff"
  purple-500: "#dfa7ff"
  purple-600: "#c979ff"
  purple-700: "#a000f8"
  purple-800: "#8500d1"
  purple-900: "#7d00cc"
  purple-1000: "#2f004e"
  pink-100: "#ffe8f6"
  pink-200: "#ffe8f3"
  pink-300: "#ffdfeb"
  pink-400: "#ffd3e1"
  pink-500: "#fdb3cc"
  pink-600: "#f97ea7"
  pink-700: "#f22782"
  pink-800: "#e4106e"
  pink-900: "#c41562"
  pink-1000: "#460523"
  # Wide-gamut accent variants in oklch for P3 displays (sRGB hex above is the fallback)
  blue-100-p3: "oklch(97.32% 0.0141 251.56)"
  blue-200-p3: "oklch(96.29% 0.0195 250.59)"
  blue-300-p3: "oklch(94.58% 0.0293 249.84870859673202)"
  blue-400-p3: "oklch(91.58% 0.0473 245.11621922481282)"
  blue-500-p3: "oklch(82.75% 0.0979 248.48)"
  blue-600-p3: "oklch(73.08% 0.1583 248.133320980386)"
  blue-700-p3: "oklch(57.61% 0.2508 258.23)"
  blue-800-p3: "oklch(51.51% 0.2399 257.85)"
  blue-900-p3: "oklch(53.18% 0.2399 256.9900584162342)"
  blue-1000-p3: "oklch(26.67% 0.1099 254.34)"
  red-100-p3: "oklch(96.5% 0.0223 13.09)"
  red-200-p3: "oklch(95.41% 0.0299 14.252646656611997)"
  red-300-p3: "oklch(94.33% 0.0369 15.011509923860523)"
  red-400-p3: "oklch(91.51% 0.0471 19.8)"
  red-500-p3: "oklch(84.47% 0.1018 17.71)"
  red-600-p3: "oklch(71.12% 0.1881 21.22)"
  red-700-p3: "oklch(62.56% 0.2524 23.03)"
  red-800-p3: "oklch(58.19% 0.2482 25.15)"
  red-900-p3: "oklch(54.99% 0.232 25.29)"
  red-1000-p3: "oklch(24.8% 0.1041 18.86)"
  amber-100-p3: "oklch(97.48% 0.0331 85.79)"
  amber-200-p3: "oklch(96.81% 0.0495 90.24227879900472)"
  amber-300-p3: "oklch(95.93% 0.0636 90.52)"
  amber-400-p3: "oklch(91.02% 0.1322 88.25)"
  amber-500-p3: "oklch(86.55% 0.1583 79.63)"
  amber-600-p3: "oklch(80.25% 0.1953 73.59)"
  amber-700-p3: "oklch(81.87% 0.1969 76.46)"
  amber-800-p3: "oklch(77.21% 0.1991 64.28)"
  amber-900-p3: "oklch(52.79% 0.1496 54.65)"
  amber-1000-p3: "oklch(30.83% 0.099 45.48)"
  green-100-p3: "oklch(97.59% 0.0289 145.42)"
  green-200-p3: "oklch(96.92% 0.037 147.15)"
  green-300-p3: "oklch(94.6% 0.0674 144.23)"
  green-400-p3: "oklch(91.49% 0.0976 146.24)"
  green-500-p3: "oklch(85.45% 0.1627 146.3)"
  green-600-p3: "oklch(80.25% 0.214 145.18)"
  green-700-p3: "oklch(64.58% 0.1746 147.27)"
  green-800-p3: "oklch(57.81% 0.1507 147.5)"
  green-900-p3: "oklch(51.75% 0.1453 147.65)"
  green-1000-p3: "oklch(29.15% 0.1197 147.38)"
  teal-100-p3: "oklch(97.72% 0.0359 186.7)"
  teal-200-p3: "oklch(97.06% 0.0347 180.66)"
  teal-300-p3: "oklch(94.92% 0.0478 182.07)"
  teal-400-p3: "oklch(92.76% 0.0718 183.78)"
  teal-500-p3: "oklch(86.88% 0.1344 182.42)"
  teal-600-p3: "oklch(81.5% 0.161 178.96)"
  teal-700-p3: "oklch(64.92% 0.1572 181.95)"
  teal-800-p3: "oklch(57.53% 0.1392 181.66)"
  teal-900-p3: "oklch(52.08% 0.1251 182.93)"
  teal-1000-p3: "oklch(32.11% 0.0788 179.82)"
  purple-100-p3: "oklch(96.65% 0.0244 312.1890119359961)"
  purple-200-p3: "oklch(96.73% 0.0228 309.8)"
  purple-300-p3: "oklch(94.85% 0.0364 310.15)"
  purple-400-p3: "oklch(91.77% 0.0614 312.82)"
  purple-500-p3: "oklch(81.26% 0.1409 310.8)"
  purple-600-p3: "oklch(72.07% 0.2083 308.19)"
  purple-700-p3: "oklch(55.5% 0.3008 306.12)"
  purple-800-p3: "oklch(48.58% 0.2638 305.73)"
  purple-900-p3: "oklch(47.18% 0.2579 304)"
  purple-1000-p3: "oklch(23.96% 0.13 305.66)"
  pink-100-p3: "oklch(95.69% 0.0359 344.6218910697224)"
  pink-200-p3: "oklch(95.71% 0.0321 353.14)"
  pink-300-p3: "oklch(93.83% 0.0451 356.29)"
  pink-400-p3: "oklch(91.12% 0.0573 358.82)"
  pink-500-p3: "oklch(84.28% 0.0915 356.99)"
  pink-600-p3: "oklch(74.33% 0.1547 0.24)"
  pink-700-p3: "oklch(63.52% 0.238 1.01)"
  pink-800-p3: "oklch(59.51% 0.2339 4.21)"
  pink-900-p3: "oklch(53.5% 0.2058 2.84)"
  pink-1000-p3: "oklch(26% 0.0977 359)"
typography:
  heading-72:
    fontFamily: Geist Sans
    fontSize: 72px
    fontWeight: 600
    lineHeight: 72px
    letterSpacing: -4.32px
  heading-64:
    fontFamily: Geist Sans
    fontSize: 64px
    fontWeight: 600
    lineHeight: 64px
    letterSpacing: -3.84px
  heading-56:
    fontFamily: Geist Sans
    fontSize: 56px
    fontWeight: 600
    lineHeight: 56px
    letterSpacing: -3.36px
  heading-48:
    fontFamily: Geist Sans
    fontSize: 48px
    fontWeight: 600
    lineHeight: 56px
    letterSpacing: -2.88px
  heading-40:
    fontFamily: Geist Sans
    fontSize: 40px
    fontWeight: 600
    lineHeight: 48px
    letterSpacing: -2.4px
  heading-32:
    fontFamily: Geist Sans
    fontSize: 32px
    fontWeight: 600
    lineHeight: 40px
    letterSpacing: -1.28px
  heading-24:
    fontFamily: Geist Sans
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
    letterSpacing: -0.96px
  heading-20:
    fontFamily: Geist Sans
    fontSize: 20px
    fontWeight: 600
    lineHeight: 26px
    letterSpacing: -0.4px
  heading-16:
    fontFamily: Geist Sans
    fontSize: 16px
    fontWeight: 600
    lineHeight: 24px
    letterSpacing: -0.32px
  heading-14:
    fontFamily: Geist Sans
    fontSize: 14px
    fontWeight: 600
    lineHeight: 20px
    letterSpacing: -0.28px
  button-16:
    fontFamily: Geist Sans
    fontSize: 16px
    fontWeight: 500
    lineHeight: 20px
  button-14:
    fontFamily: Geist Sans
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
  button-12:
    fontFamily: Geist Sans
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
  label-20:
    fontFamily: Geist Sans
    fontSize: 20px
    fontWeight: 400
    lineHeight: 32px
  label-18:
    fontFamily: Geist Sans
    fontSize: 18px
    fontWeight: 400
    lineHeight: 20px
  label-16:
    fontFamily: Geist Sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 20px
  label-14:
    fontFamily: Geist Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  label-14-mono:
    fontFamily: Geist Mono
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  label-13:
    fontFamily: Geist Sans
    fontSize: 13px
    fontWeight: 400
    lineHeight: 16px
  label-13-mono:
    fontFamily: Geist Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 20px
  label-12:
    fontFamily: Geist Sans
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  label-12-mono:
    fontFamily: Geist Mono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  copy-24:
    fontFamily: Geist Sans
    fontSize: 24px
    fontWeight: 400
    lineHeight: 36px
  copy-20:
    fontFamily: Geist Sans
    fontSize: 20px
    fontWeight: 400
    lineHeight: 36px
  copy-18:
    fontFamily: Geist Sans
    fontSize: 18px
    fontWeight: 400
    lineHeight: 28px
  copy-16:
    fontFamily: Geist Sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  copy-14:
    fontFamily: Geist Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  copy-14-mono:
    fontFamily: Geist Mono
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  copy-13:
    fontFamily: Geist Sans
    fontSize: 13px
    fontWeight: 400
    lineHeight: 18px
  copy-13-mono:
    fontFamily: Geist Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 18px
spacing:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  6: 24px
  8: 32px
  10: 40px
  16: 64px
  24: 96px
  base: 4px
rounded:
  sm: 6px
  md: 12px
  lg: 16px
  full: 9999px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background-100}"
    typography: "{typography.button-14}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: 40px
  button-secondary:
    backgroundColor: "{colors.background-100}"
    textColor: "{colors.primary}"
    typography: "{typography.button-14}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: 40px
  button-tertiary:
    textColor: "{colors.primary}"
    typography: "{typography.button-14}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: 40px
  button-error:
    backgroundColor: "{colors.red-800}"
    textColor: "#ffffff"
    typography: "{typography.button-14}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: 40px
  button-small:
    typography: "{typography.button-14}"
    rounded: "{rounded.sm}"
    padding: "0 6px"
    height: 32px
  button-large:
    typography: "{typography.button-16}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: 48px
  input:
    backgroundColor: "{colors.background-100}"
    textColor: "{colors.primary}"
    typography: "{typography.label-14}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: 40px
  input-small:
    typography: "{typography.label-14}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: 32px
  input-large:
    typography: "{typography.label-16}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: 48px
---

# Geist

## Overview

Geist is Vercel’s design system for building consistent, developer-focused interfaces. The aesthetic is minimal and high-contrast: plenty of whitespace, restrained color, and content set on near-neutral surfaces. Prioritize readability and accessibility, and use color to signal state or hierarchy rather than decoration.

This is the Light theme. The Dark theme uses the same token names with different values and lives at `/design.dark.md`. Colors are sRGB hex with Display P3 equivalents.

## Colors

Each non-background scale runs 10 steps (`100`–`1000`), and the step encodes intent, not just lightness:

- `100` default background
- `200` hover background
- `300` active background
- `400` default border
- `500` hover border
- `600` active border
- `700` solid fill, high contrast
- `800` solid fill, hover
- `900` secondary text and icons
- `1000` primary text and icons

`background-100` is the primary page and card surface; `background-200` is a secondary surface for subtle separation. The `gray-alpha-*` tokens are translucent, so they layer over any background; use them for borders, dividers, overlays, and hover states. Solid `gray-*` holds its contrast on any surface, so use it for text and opaque fills. Accent scales carry meaning: `blue` for success, links, and focus; `red` for errors; `amber` for warnings; plus `green`, `teal`, `purple`, and `pink`. Use the hex tokens everywhere; each accent scale also ships a `*-p3` wide-gamut value in `oklch()` for Display P3 screens. The Dark theme redefines the same names at `/design.dark.md`.

## Typography

Geist Sans sets UI and prose; Geist Mono sets code, data, and tabular figures. Both are open-source. The `typography` tokens above carry concrete `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, and `letterSpacing`:

- Headings, `heading-72` through `heading-14`, title pages and sections; `letterSpacing` tightens as the size grows.
- Labels, `label-20` through `label-12`, carry single-line, scannable text: navigation, form labels, table headers, metadata.
- Copy, `copy-24` through `copy-13`, set multi-line body text with a taller `lineHeight`.
- Buttons, `button-16` through `button-12`, are medium-weight labels for buttons and compact controls.

`copy-14` and `label-14` cover most text. The `-mono` tokens pair Geist Mono with the same metrics; prefer tabular figures when numbers need to align.

## Layout

Spacing follows a 4px scale: 4, 8, 12, 16, 24, 32, 40, 64, 96px. Keep a three-step rhythm: 8px inside a group, 16px between groups, 32–40px between sections. Cards use 24px padding, 16px when compact and 32px for hero areas. Center content in a 1200px column with side padding that grows at wider breakpoints, and make every layout work on mobile and desktop. Breakpoints are `sm` 401px, `md` 601px, `lg` 961px, `xl` 1200px, and `2xl` 1400px.

## Elevation & Depth

Hierarchy comes from tonal surfaces and borders first, so shadows stay subtle. Apply these `box-shadow` values for the light theme:

- Raised cards: `0 2px 2px rgba(0, 0, 0, 0.04)`
- Popovers and menus: `0 1px 1px rgba(0, 0, 0, 0.02), 0 4px 8px -4px rgba(0, 0, 0, 0.04), 0 16px 24px -8px rgba(0, 0, 0, 0.06)`
- Modals and dialogs: `0 1px 1px rgba(0, 0, 0, 0.02), 0 8px 16px -4px rgba(0, 0, 0, 0.04), 0 24px 32px -8px rgba(0, 0, 0, 0.06)`

Tooltips take the lightest of these. Pair each elevation with the matching radius below.

## Motion

Use motion only when it clarifies a change, never for decoration. Most interactions should feel instant: a duration of `0ms` is often the snappiest and best choice, and the call is context-dependent. When motion genuinely helps, such as revealing or moving an element, keep it short and physical with the easing `cubic-bezier(0.175, 0.885, 0.32, 1.1)`: roughly 150ms for state changes, 200ms for popovers and tooltips, and 300ms for overlays and modals. Avoid long, looping, or attention-grabbing animation, and honor `prefers-reduced-motion` by dropping nonessential motion.

## Shapes

Radii stay tight: 6px for everyday surfaces and controls, 12px for menus and modals, 16px for fullscreen surfaces. Reserve 9999px for pills, avatars, and circular controls. Keep one radius family per view rather than mixing rounded and sharp corners.

## Components

The `components` tokens above give ready-to-use values per element (`backgroundColor`, `textColor`, `rounded`, `height`) drawn from this theme:

- Primary button: solid `gray-1000` fill with a `background-100` label, for the single most important action on a view.
- Secondary button: `background-100` fill with a translucent `gray-alpha-400` border.
- Tertiary button: transparent fill with `gray-1000` text for low-emphasis actions; it tints with `gray-alpha` on hover.
- Error button: solid `red-800` fill with white text, for destructive actions.
- Input: `background-100` fill, translucent border, 6px radius.

The variant tokens are the default medium (40px) size. Use the `button-small`/`input-small` (32px) and `button-large`/`input-large` (48px) tokens for the other sizes; large buttons step up to `button-16`. Hover and active states step up the scale: a `100` fill becomes `200` on hover and `300` on active, and borders move from `400` to `500` to `600`. Disabled uses a `gray-100` fill, `gray-700` text, and a not-allowed cursor. Focus shows a two-layer ring (`box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #006bff`): a 2px gap in the surface color, then a 2px `blue-700` ring.

## Voice & Content

Copy is part of the design; keep it precise and free of filler.

- Use Title Case for labels, buttons, titles, and tabs; sentence case for body, helper text, and toasts.
- Name actions with a verb and a noun (`Deploy Project`, `Delete Member`), never `Confirm`, `OK`, or a bare verb.
- Write errors as what happened plus what to do next: `Build failed. Bundle exceeds 50 MB. Reduce it or raise the limit.`
- Toasts name the specific thing that changed, drop the trailing period, and never say `successfully`: `Project deleted`, not `Successfully deleted the project.`
- Empty states point to the first action: `No deployments yet. Push to your Git repository to create one.`
- Use the present participle with an ellipsis for in-progress states: `Deploying…`, `Saving…`.
- Use numerals (`3 projects`), curly quotes, and the ellipsis character; skip `please` and marketing superlatives.

## Do's and Don'ts

- Use the gray scale to rank information: `1000` for primary text, `900` for secondary, `700` for disabled.
- Keep solid accent color for state and the single most important action on a view.
- Hold WCAG AA contrast (4.5:1 for body text).
- Show the focus ring on every interactive element at `:focus-visible`, and never remove an outline without a visible replacement.
- Apply the typography tokens instead of setting font size, line height, or weight by hand.
- Don’t signal state with color alone; pair it with an icon or text label.
- Don’t use `background-200` as a general fill; it is for subtle separation only.
- Don’t mix rounded and sharp corners, or more than two font weights, in one view.
- Don’t swap `gray-*` for `background-*`; they are separate scales.

---

# Appendix: Dark theme

Official dark theme (from https://vercel.com/design.dark.md). Same token names,
typography, spacing, radii, motion, voice, and rules as the Light theme above.
Only three things change:

1. **Colors** — every color token is redefined (full set below).
2. **Raised-card shadow** — `0 1px 2px rgba(0, 0, 0, 0.16)` (popover/modal shadows unchanged).
3. **Focus ring** — `box-shadow: 0 0 0 2px #000000, 0 0 0 4px #47a8ff` (2px gap in surface color, then 2px `blue-900`).

```yaml
colors:
  primary: "#ededed"
  secondary: "#a0a0a0"
  tertiary: "#006efe"
  neutral: "#1a1a1a"
  background-100: "#000000"
  background-200: "#000000"
  gray-100: "#1a1a1a"
  gray-200: "#1f1f1f"
  gray-300: "#292929"
  gray-400: "#2e2e2e"
  gray-500: "#454545"
  gray-600: "#878787"
  gray-700: "#8f8f8f"
  gray-800: "#7d7d7d"
  gray-900: "#a0a0a0"
  gray-1000: "#ededed"
  gray-alpha-100: "#ffffff12"
  gray-alpha-200: "#ffffff17"
  gray-alpha-300: "#ffffff21"
  gray-alpha-400: "#ffffff24"
  gray-alpha-500: "#ffffff3d"
  gray-alpha-600: "#ffffff82"
  gray-alpha-700: "#ffffff8a"
  gray-alpha-800: "#ffffff78"
  gray-alpha-900: "#ffffff9c"
  gray-alpha-1000: "#ffffffeb"
  blue-100: "#06193a"
  blue-200: "#022248"
  blue-300: "#002f62"
  blue-400: "#003674"
  blue-500: "#00418b"
  blue-600: "#0090ff"
  blue-700: "#006efe"
  blue-800: "#005be7"
  blue-900: "#47a8ff"
  blue-1000: "#eaf6ff"
  red-100: "#330a11"
  red-200: "#440d13"
  red-300: "#5d0e17"
  red-400: "#6f101b"
  red-500: "#88151f"
  red-600: "#f32e40"
  red-700: "#f13242"
  red-800: "#e2162a"
  red-900: "#ff565f"
  red-1000: "#ffe9ed"
  amber-100: "#2a1700"
  amber-200: "#361900"
  amber-300: "#502800"
  amber-400: "#5b3000"
  amber-500: "#703e00"
  amber-600: "#ed9a00"
  amber-700: "#ffae00"
  amber-800: "#ff9300"
  amber-900: "#ff9300"
  amber-1000: "#fff3d5"
  green-100: "#002608"
  green-200: "#00320b"
  green-300: "#003a0e"
  green-400: "#004615"
  green-500: "#006717"
  green-600: "#00952d"
  green-700: "#00ac3a"
  green-800: "#009432"
  green-900: "#00ca50"
  green-1000: "#d8ffe4"
  teal-100: "#00231b"
  teal-200: "#002b22"
  teal-300: "#003d34"
  teal-400: "#004035"
  teal-500: "#006354"
  teal-600: "#009e86"
  teal-700: "#00aa95"
  teal-800: "#00927f"
  teal-900: "#00cfb7"
  teal-1000: "#cbfff5"
  purple-100: "#290c33"
  purple-200: "#341142"
  purple-300: "#47185e"
  purple-400: "#541a76"
  purple-500: "#642290"
  purple-600: "#9440d5"
  purple-700: "#9440d5"
  purple-800: "#7d2bba"
  purple-900: "#c472fb"
  purple-1000: "#fbecff"
  pink-100: "#310d1e"
  pink-200: "#420c25"
  pink-300: "#571032"
  pink-400: "#5d0c34"
  pink-500: "#76063f"
  pink-600: "#ba0056"
  pink-700: "#f12b82"
  pink-800: "#e7006d"
  pink-900: "#ff4d8d"
  pink-1000: "#ffe9f4"
  # Wide-gamut accent variants in oklch for P3 displays (sRGB hex above is the fallback)
  blue-100-p3: "oklch(22.17% 0.069 259.89)"
  blue-200-p3: "oklch(25.45% 0.0811 255.8)"
  blue-300-p3: "oklch(30.86% 0.1022 255.21)"
  blue-400-p3: "oklch(34.1% 0.121 254.74)"
  blue-500-p3: "oklch(38.5% 0.1403 254.4)"
  blue-600-p3: "oklch(64.94% 0.1982 251.8131841760864)"
  blue-700-p3: "oklch(57.61% 0.2321 258.23)"
  blue-800-p3: "oklch(51.51% 0.2307 257.85)"
  blue-900-p3: "oklch(71.7% 0.1648 250.79360374054167)"
  blue-1000-p3: "oklch(96.75% 0.0179 242.4234217368056)"
  red-100-p3: "oklch(22.1% 0.0657 15.11)"
  red-200-p3: "oklch(25.93% 0.0834 19.02)"
  red-300-p3: "oklch(31.47% 0.1105 20.96)"
  red-400-p3: "oklch(35.27% 0.1273 21.23)"
  red-500-p3: "oklch(40.68% 0.1479 23.16)"
  red-600-p3: "oklch(62.56% 0.2277 23.03)"
  red-700-p3: "oklch(62.56% 0.2234 23.03)"
  red-800-p3: "oklch(58.01% 0.227 25.12)"
  red-900-p3: "oklch(69.96% 0.2136 22.03)"
  red-1000-p3: "oklch(95.6% 0.0293 6.61)"
  amber-100-p3: "oklch(22.46% 0.0538 76.04)"
  amber-200-p3: "oklch(24.95% 0.0642 64.78)"
  amber-300-p3: "oklch(32.34% 0.0837 63.83)"
  amber-400-p3: "oklch(35.53% 0.0903 66.29707162673735)"
  amber-500-p3: "oklch(41.55% 0.1044 67.98)"
  amber-600-p3: "oklch(75.04% 0.1737 74.49)"
  amber-700-p3: "oklch(81.87% 0.1969 76.46)"
  amber-800-p3: "oklch(77.21% 0.1991 64.28)"
  amber-900-p3: "oklch(77.21% 0.1991 64.28)"
  amber-1000-p3: "oklch(96.7% 0.0418 84.59)"
  green-100-p3: "oklch(23.09% 0.0716 149.68)"
  green-200-p3: "oklch(27.12% 0.0895 150.09)"
  green-300-p3: "oklch(29.84% 0.096 149.25)"
  green-400-p3: "oklch(34.39% 0.1039 147.78)"
  green-500-p3: "oklch(44.19% 0.1484 147.2)"
  green-600-p3: "oklch(58.11% 0.1815 146.55)"
  green-700-p3: "oklch(64.58% 0.199 147.27)"
  green-800-p3: "oklch(57.81% 0.1776 147.5)"
  green-900-p3: "oklch(73.1% 0.2158 148.29)"
  green-1000-p3: "oklch(96.76% 0.056 154.18)"
  teal-100-p3: "oklch(22.1% 0.0544 178.74)"
  teal-200-p3: "oklch(25.06% 0.062 178.76)"
  teal-300-p3: "oklch(31.5% 0.0767 180.99)"
  teal-400-p3: "oklch(32.43% 0.0763 180.13)"
  teal-500-p3: "oklch(43.35% 0.1055 180.97)"
  teal-600-p3: "oklch(60.71% 0.1485 180.24)"
  teal-700-p3: "oklch(64.92% 0.1403 181.95)"
  teal-800-p3: "oklch(57.53% 0.1392 181.66)"
  teal-900-p3: "oklch(74.56% 0.1765 182.8)"
  teal-1000-p3: "oklch(96.46% 0.056 180.29)"
  purple-100-p3: "oklch(22.34% 0.0779 316.87)"
  purple-200-p3: "oklch(25.91% 0.0921 314.41)"
  purple-300-p3: "oklch(31.98% 0.1219 312.41)"
  purple-400-p3: "oklch(35.93% 0.1504 309.78)"
  purple-500-p3: "oklch(40.99% 0.1721 307.92)"
  purple-600-p3: "oklch(55.5% 0.2191 306.12)"
  purple-700-p3: "oklch(55.5% 0.2186 306.12)"
  purple-800-p3: "oklch(48.58% 0.2102 305.73)"
  purple-900-p3: "oklch(69.87% 0.2037 309.51)"
  purple-1000-p3: "oklch(96.1% 0.0304 316.46)"
  pink-100-p3: "oklch(22.67% 0.0628 354.73)"
  pink-200-p3: "oklch(26.2% 0.0859 356.68)"
  pink-300-p3: "oklch(31.15% 0.1067 355.93)"
  pink-400-p3: "oklch(32.13% 0.1174 356.71)"
  pink-500-p3: "oklch(37.01% 0.1453 358.39)"
  pink-600-p3: "oklch(50.33% 0.2089 4.33)"
  pink-700-p3: "oklch(63.52% 0.2346 1.01)"
  pink-800-p3: "oklch(59.51% 0.2429 4.21)"
  pink-900-p3: "oklch(69.36% 0.2223 3.91)"
  pink-1000-p3: "oklch(95.74% 0.0326 350.08)"
```

---

_Source: https://vercel.com/design.md and https://vercel.com/design.dark.md (official, fetched 2026-07-21). This replaces the earlier shadcn.io/design/vercel "inspired" spec; marketing-surface effects (mesh gradient, Develop/Preview/Ship pairs, pill CTAs) are not part of this app spec — recipes for those live in `src/app/globals.css` utilities and are reserved for hero/marketing surfaces only._

---

# Appendix: Geist-align checklist for new shadcn imports

`npx shadcn add <component>` ships generic geometry. Our tokens in
`src/app/globals.css` fix **colors** automatically (semantic tokens resolve to
official Geist values), but each newly imported file must be hand-aligned once,
immediately after import:

1. **Radius** — controls (buttons, inputs, triggers, toggles) `rounded-sm`
   (6px); menus/popovers/dialogs `rounded-lg` (12px); fullscreen surfaces
   `rounded-xl` (16px); pills/avatars `rounded-full`. Remove any
   `rounded-md`/`rounded-[min(...)]` size overrides.
2. **Heights** — controls 40px default (`h-10`), 32px small (`h-8`), 48px
   large (`h-12`). No `h-9` — EXCEPT chrome (sidebar rows, navbar controls),
   which is hand-sized at 36px to match live vercel.com.
3. **Type** — labels/controls `text-sm` (14px) at `font-medium`; never
   `text-base` on a default control; weight ceiling `font-semibold` (600).
4. **Shadow tier** — cards `shadow-ds-2`, menus/popovers `shadow-ds-4`,
   modals/overlay panels `shadow-ds-5`. Never ds-5 on a menu.
5. **Motion** — 150ms state changes, `duration-200` popovers/menus,
   `duration-300` overlays/modals; transitions use `ease-geist`.
6. **Focus** — two-layer ring: `focus-visible:ring-2 focus-visible:ring-ring
   focus-visible:ring-offset-2 focus-visible:ring-offset-background`; never a
   single `ring-3 ring-ring/50`, never remove an outline without replacement.
7. **Destructive** — solid fill + white text (`bg-destructive text-white
   hover:bg-error-deep dark:bg-error-deep dark:hover:bg-destructive`), not a
   soft tint.
8. **Colors** — semantic tokens only; no palette classes, no hexes, no
   `dark:bg-black`/`text-white` (except on solid destructive/brand fills).
9. **Base UI, not Radix** — this repo's registry style is `base-nova`:
   compose with `render={<El />}`, never `asChild`.

Fastest path: import the component, then ask Claude to "geist-align it per
DESIGN-VERCEL.md" — this checklist is the contract.
