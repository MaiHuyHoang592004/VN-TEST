# ALIGNMENT AUDIT — GoodWoodPrint Fulfillment Design System

**Pass type:** alignment, not rebuild. Visual direction preserved. Approved reference imagery untouched.
**Date of pass:** 2026-08-15

## Audit basis — and one blocking gap

| Priority | Source | Status |
|---|---|---|
| 1 · Visual composition & art direction truth | `assets/reference/*.png` (3 approved boards) | ✅ Present, re-read for this pass |
| 2 · Canonical design kernel (exact constraints + business boundaries) | `DESIGN.md`, `tokens.json`, `COMPONENTS.md`, `PATTERNS.md`, `SCREENS.md`, `MARKETING.md`, `CATALOG.md`, `DOMAIN_BINDINGS.md`, `DESIGN_QA.md` | ❌ **Do not exist in `GWP-main`** (re-verified this pass) |
| 2b · Canonical values actually on record | The brief text | ✅ 7 colours + 3 typeface names only |
| 3 · Existing Claude Design components | `components/**` | ✅ 31 exports audited |
| — · Backend domain truth | `GWP-main/fulfillment-system-be-prod/src/**` | ✅ Re-verified this pass |

**Consequence:** §5 (typography drift) and §6 (token drift) cannot be a two-column comparison, because there is no second column. For every value except the 7 colours and 3 typeface names, **there is no canonical value on record to have drifted from.** Those values are reported as `NO KERNEL VALUE ON RECORD` and left untouched.

---

# BLOCKER

### B1 · Canonical kernel absent — token and type audit cannot complete
- **Files:** all of `tokens/`
- **Current:** every numeric token (ramps, scales, radii, shadows, motion, dimensions) was derived by measuring the approved reference images.
- **Expected:** each value validated against `tokens.json`.
- **Fix:** supply `tokens.json`. Until then the derived values stand and are labelled as derived in the token files (applied this pass, §T1).
- **Applied:** ⚠️ Cannot fix. Labelling applied; reconciliation blocked.

---

# DOMAIN LEAK

### D1 · ProductCard renders fabricated ratings and review counts
- **File:** `components/catalog/ProductCard.jsx`, `.d.ts`, `.prompt.md`, `catalog.card.html`
- **Current:** `rating` / `reviews` props exist and every example passes real-looking values (`rating={4.8} reviews="4.8"`). The showcase card and the prompt example both render five-star rows. **No reviews or ratings entity was found anywhere in the backend.**
- **Expected:** ratings are DOMAIN-BOUND and off unless the product domain verifies reviews exist. No fabricated ratings in any example.
- **Fix:** keep props optional and unrendered by default; strip all rating values from the showcase card and prompt example; mark `rating`, `reviews` and `price` DOMAIN-BOUND in the `.d.ts` with the verification requirement stated.
- **Applied:** ✅

### D2 · Domain-bound surfaces not labelled as such
- **Files:** `WalletSummary.d.ts`, `ProductCell.d.ts`, `DataTable.prompt.md`, `StatusBadge.d.ts`
- **Current:** `StatusBadge` correctly cites the backend enum. Wallet balance types, SKU/product-code formats, BOM structure and personalization were described in prose but not marked as boundaries.
- **Expected:** every unverified business semantic explicitly marked DOMAIN-BOUND with its verification state.
- **Fix:** add a DOMAIN-BOUND block to each affected `.d.ts` naming what is verified and what is not.
- **Applied:** ✅

### D3 · Verified-domain provenance not cited at point of use
- **File:** `components/core/StatusBadge.jsx`
- **Current:** the `STATUS_TONES` map is correct but the file cites the enum loosely.
- **Expected:** exact source path recorded so a future editor can re-verify.
- **Fix:** cite `fulfillment-system-be-prod/src/constants/common.ts` (`ORDER_STATUS`, `USER_ROLE`) and `src/ticket/ticket.enum.ts` (`TicketStatus`, `TicketPriority`) in the file header.
- **Applied:** ✅

### D4 · Roles, pricing, personalization, production/shipping lifecycles
- **Verified from backend:** order/warehouse statuses, ticket statuses, ticket priorities, the 7 roles, order field names.
- **NOT verified — remain DOMAIN-BOUND, no component asserts behaviour for them:** production lifecycle transitions, shipping lifecycle, tracking-status vocabulary (the field exists; its value set does not appear as an enum), SKU construction rules, BOM hierarchy, inventory math, wallet/accounting semantics, permission logic, personalization flow, pricing rules, reviews/ratings.
- **Applied:** ✅ documented, no behaviour asserted.

---

# VISUAL DRIFT

### V1 · TopNav is a generic full-width SaaS header
- **File:** `components/navigation/TopNav.jsx`
- **Current:** full-bleed cream bar, edge-to-edge, `border-bottom` hairline, 24px horizontal padding, square corners.
- **Expected (canonical direction + approved operational board):** a **cream floating navigation surface** with **sky visible around it**, **rounded shell**, **generous horizontal spacing**, **quiet shadow**, navy passive items, pale-sky active state, Action Blue reserved for an emphasized CTA.
- **Fix:** `variant="floating"` becomes the default — sky gutter around a rounded cream shell (`--radius-xl`, `--shadow-sm`, no bottom border, 32px inner padding, `--content-max` centred). Full-bleed retained as `variant="bar"` for surfaces that genuinely need it. New `cta` slot so the emphasized action has a home in the nav.
- **Applied:** ✅

### V2 · MetricCard defaults to a white bordered KPI card
- **File:** `components/data/MetricCard.jsx`
- **Current:** `variant="card"` is the default — white fill, hairline border, `--shadow-xs`, tinted icon chip. This is the generic-SaaS KPI treatment.
- **Expected:** the approved operational board's primary KPI treatment is a **semantic pastel wash surface** — no border, no shadow, label and value in the tone's own ink. White is secondary.
- **Fix:** `variant="wash"` becomes the default and gains delta support; `variant="card"` remains as the optional secondary; `"tile"` kept as an alias so existing usage does not break.
- **Applied:** ✅

### V3 · Operational PageHero owns CTA actions
- **File:** `components/navigation/PageHero.jsx`
- **Current:** `actions` prop renders buttons in the hero; the showcase and prompt both put "New Order" there.
- **Expected:** operational PageHero must not own CTAs. They belong in TopNav, the filter bar, or the relevant content region. MarketingHero keeps its CTAs; CatalogHero follows catalog rules.
- **Fix:** remove `actions` from PageHero entirely. Route operational CTAs to `TopNav.cta`, `SearchShell.action` or `TabBar.right`.
- **Applied:** ✅

### V4 · No home for the operational CTA once removed from the hero
- **File:** `components/catalog/SearchShell.jsx`
- **Current:** `left` / `sort` / `resultCount` / `view` only. `TabBar.right` was the sole CTA slot.
- **Expected:** the filter bar is a canonical CTA location.
- **Fix:** add an `action` slot pinned to the right of the shell.
- **Applied:** ✅

### V5 · Reference imagery
- **Current:** three approved boards in `assets/reference/`.
- **Expected:** preserved.
- **Applied:** ✅ untouched.

---

# TOKEN DRIFT

### T1 · Canonical and derived tokens are not distinguished
- **File:** `tokens/colors.css`
- **Current:** the 7 canonical values and ~60 derived tints sit in one block. A future editor could redefine a canonical value while "adjusting a ramp".
- **Expected:** canonical tokens explicitly separated from derived, with the rule that a derived token may never redefine a canonical brand value.
- **Fix:** split into a `CANONICAL` block (locked, 7 values) and a `DERIVED` block, with `--gwp-bright-sky` etc. as the immutable anchors and `--sky-300: var(--gwp-bright-sky)` proving the ramp resolves to the canonical value rather than restating a hex. Same treatment for cream/navy/action anchors.
- **Applied:** ✅

### T2 · Colour duties preserved through the ramps — verified
- Sky ramp resolves to `#ABDAEF` at 300, cream to `#FFFDF0` at 100, navy to `#0F3A5F` at 700, action to `#0078C1` at 500. No derived step shadows a canonical duty. Orange/yellow ramps exist only to supply status backgrounds; the 500 steps are the canonical accents.
- **Applied:** ✅ no change needed.

### T3 · Every other token family — no kernel value on record
| Family | Generated | Canonical | Recommendation |
|---|---|---|---|
| Spacing (4px base, `--space-1…32`) | 4→128px, 13 steps | NO KERNEL VALUE ON RECORD | **Hold.** Derived from reference measurement. |
| Radius | 8/10/14/18/24/32/44/pill | NO KERNEL VALUE ON RECORD | **Hold.** |
| Shadow | 5 steps, `rgba(15,58,95,·)` | NO KERNEL VALUE ON RECORD | **Hold.** |
| Motion | 140/220/340/520ms, `cubic-bezier(.2,.8,.2,1)` | NO KERNEL VALUE ON RECORD | **Hold.** |
| Dimensions (nav 64, row 56/48, controls 32/40/48) | as listed | NO KERNEL VALUE ON RECORD | **Hold.** |
| Status tones (7) | derived from brand hues | Backend supplies `theme`/`color` pairs per status in `metadata.ts` | **Reconcile — see T4.** |
- **Applied:** ⚠️ Held pending `tokens.json`. No values changed.

### T4 · Backend status colours differ from the design-system status tones
- **File:** `tokens/colors.css` status block vs `fulfillment-system-be-prod/src/metadata/metadata.ts` (`FULFILLED_STATUS`)
- **Current:** backend ships literal per-status colours — e.g. `In Production` `theme:#FFF2CC` `color:#947D4E`, `Design problems` `theme:#F0E6FF` `color:#5C3081`, `Fulfilled` `theme:#E8F5D9` `color:#719B71`. The design system instead maps every status onto 7 brand-derived semantic tones. `Design problems` is purple in the backend and orange here.
- **Expected:** one source of truth for status colour.
- **Fix:** **not applied.** The backend values are the pre-rebrand Metronic palette (muted olive/mauve/purple), which contradicts the approved GWP direction; overwriting the design tones with them would be visual regression. Overwriting the backend from here is out of scope. **Needs an explicit decision:** either the backend `FULFILLED_STATUS` themes are updated to the GWP tones, or the frontend stops reading them and uses `StatusBadge`.
- **Applied:** ❌ Reported only — resolving this changes product behaviour.

---

# TYPOGRAPHY DRIFT

Per instruction, **no typography value was changed.** The kernel names three families and nothing numeric.

| Token | Generated value | Canonical value | Recommendation | Reason |
|---|---|---|---|---|
| `--font-display` | Baloo 2 | **Baloo 2** | **Keep** | Exact match to kernel. |
| `--font-body` | Nunito Sans | **Nunito Sans** | **Keep** | Exact match to kernel. |
| `--font-mono` | IBM Plex Mono | **IBM Plex Mono** | **Keep** | Exact match to kernel. |
| `--fs-display-2xl` | 64px | NO KERNEL VALUE | Hold | Measured from approved marketing board. |
| `--fs-display-xl` | 56px | NO KERNEL VALUE | Hold | Marketing headline in approved board. |
| `--fs-display-lg` | 44px | NO KERNEL VALUE | Hold | Operational page title ("Dashboard", "Orders"). |
| `--fs-display-md` | 32px | NO KERNEL VALUE | Hold | KPI numbers + section titles. |
| `--fs-display-sm` | 24px | NO KERNEL VALUE | Hold | Card titles. |
| `--fs-lead` | 18px | NO KERNEL VALUE | Hold | Hero subcopy. |
| `--fs-body-lg` | 16px | NO KERNEL VALUE | Hold | Long-form body. |
| `--fs-body` | 14px | NO KERNEL VALUE | Hold | UI default across approved screens. |
| `--fs-body-sm` | 13px | NO KERNEL VALUE | Hold | Table cells. |
| `--fs-meta` | 12px | NO KERNEL VALUE | Hold | Labels. |
| `--fs-micro` | 11px | NO KERNEL VALUE | Hold | Uppercase table headers. |
| Display weights | 700 / 800 | NO KERNEL VALUE | Hold | Approved board reads as heavy Baloo. |
| Body weights | 400 / 600 / 700 | NO KERNEL VALUE | Hold | — |
| `--lh-display` | 1.06 | NO KERNEL VALUE | Hold | Tight three-line headline stack in approved board. |
| `--lh-body` | 1.55 | NO KERNEL VALUE | Hold | — |
| `--ls-display` / `-tight` | −0.015em / −0.02em | NO KERNEL VALUE | Hold | — |
| `--ls-caps` | 0.08em | NO KERNEL VALUE | Hold | Uppercase table headers. |
| **Vietnamese coverage** | Baloo 2 excluded for Vietnamese strings | NOT ADDRESSED BY KERNEL | **Decision needed** | Baloo 2's Vietnamese diacritic coverage is incomplete; warehouse routes are Vietnamese. |

**Nothing to overwrite.** If `tokens.json` disagrees with any row above, send it and each row becomes a real two-column reconciliation.

---

# GENERIC SAAS DRIFT

| Check | Finding | Action |
|---|---|---|
| Full-width generic header | **Found** — TopNav | Fixed, V1 |
| White bordered KPI cards | **Found** — MetricCard default | Fixed, V2 |
| Excessive boxed UI | Not found. `Surface` caps nesting at three levels by construction. | None |
| Equal card grids | Not found in components. Composition card explicitly forbids it; `MetricCard` prompt caps at one KPI row per screen. | None |
| Gray admin styling | Not found. No neutral grey exists in the token set — every neutral is a navy or cream tint. Product thumbnails sit in cream wells. | None |
| Unnecessary borders | `DataTable` is horizontal rules only, no vertical grid, no grey header fill. `ProductCard` / `FeatureCard` carry one 8% hairline, which matches the approved boards. | None |
| Too many shadows | 5 steps, none stacked, all blue-tinted. Wash tiles carry none. | None |
| Coloured left-border accent | One instance, `SupportPanel` selected row — a selection state, matching the approved Tickets screen. | Allowed, documented |

---

# OPTIONAL IMPROVEMENT — not applied

| # | Item | Why held |
|---|---|---|
| O1 | ✅ **APPLIED (2026-08-20)** — `StatusBadge`'s status→tone map extracted to `components/core/status-tones.js` (the shared single source of truth) and mirrored language-neutrally in `tokens/status-tones.json` so the frontend/backend read one map | T4 is resolved, so the blocker is gone |
| O2 | `Breadcrumb` component (CatalogHero currently takes a node) | Not in any source inventory; would be an invention |
| O3 | `FilterBar` as a named component distinct from `SearchShell` | `SearchShell` now covers the role; a second component would duplicate it |
| O4 | Vietnamese type specimen card for warehouse routes | Needs the Baloo 2 decision |
| O5 | Replace Lucide with the real GWP icon set | Needs a redistributable set from the team |
| O6 | Workshop line-art and product photography assets | Not supplied |

---

# PASS 2 — COLOUR DUTY & COMPOSITION CORRECTION

Directive: *"Navy should not dominate the sky hero. GoodWoodPrint should feel light first, data second."*

| # | Change | Files | Applied |
|---|---|---|---|
| C1 | Display ink now follows the surface. New tokens `--display-on-sky` (cream), `--display-on-sky-bright` (white), `--display-on-pale-sky`, `--display-on-cream`, `--display-on-white`, `--display-kpi`, `--display-accent`. | `tokens/colors.css` | ✅ |
| C2 | `PageHero` title renders cream on saturated sky, navy on pale sky/cream. Eyebrow and subtitle stay navy. New `tone="deep"`. | `PageHero.jsx/.d.ts/.prompt.md` | ✅ |
| C3 | `MarketingHero` headline lines cream, accent line white by default; new `accentTone="action"` for pale-sky/cream accents. Proof checks moved to action-700 for contrast. | `MarketingHero.jsx/.d.ts/.prompt.md` | ✅ |
| C4 | `CatalogHero` documented as the pale-sky exception — sky-200 field, navy title, because the product grid is the focal point. | `CatalogHero.jsx` | ✅ |
| C5 | Sky reframed as the page, not a surface token. Added `--surface-hero-deep`. Rhythm restated as sky → cream floating → white nested → back to sky. | `tokens/surfaces.css` | ✅ |
| C6 | Colour percentages (~40/30/22/5/3%) **removed**. Duties restated as relationships. | `tokens/colors.css`, card 03, readme | ✅ |
| C7 | Cards rebuilt so sky is the outer field rather than a rectangle inside a cream card: colour duties, surface stack, display type, type hierarchy, sky/cream rhythm, operational UI, marketing UI, catalog UI, GWP-vs-not. | `guidelines/*` | ✅ |
| C8 | Hero example replaced per directive §4: open sky canvas, floating cream nav, huge cream title, tiny navy eyebrow, navy subtitle, pastel KPI row. | card 10, card 22 | ✅ |
| C9 | `#ABDAEF` and all six canonical hexes **unchanged**, as instructed. Component architecture unchanged. Domain rules unchanged. | — | ✅ |

### C11 · Status label contrast — FIXED

Two of the seven status tone pairs failed WCAG AA for small text. `StatusBadge` renders its label at 12px (md) / 11px (sm) bold — bold only counts as large text at ≥18.66px, so the 4.5:1 threshold applied and was never audited, because card 26 checked hero/body/link/button pairs but not the status pairs the system's own "colour plus label" rule depends on.

| Tone | Before | After | Fix |
|---|---|---|---|
| `pending` | #8A7038 on #FBF6E3 = **4.35 FAIL** | #806634 = **5.0 pass** | `--status-pending-fg` darkened; dot moved to #A8863F |
| `attention` | #C4491A on #FFEEE4 = **4.31 FAIL** | #B84318 = **4.8 pass** | `--orange-600` darkened, which fixes the token everywhere it is consumed |
| success / progress / info / critical / neutral | 4.8 / 5.0 / 5.6 / 5.6 / 6.6 | unchanged | already passing |

Fixed in the token layer, not per card, because `StatusBadge`, `MetricCard` wash tiles and several guideline cards all consume these pairs. Affected badges were every `Pending` / `Production Ready` and every `Design problems` / `Wrong Label` / `Low Stock` / `Return` / `open`. A contrast contract is now stated in `tokens/colors.css` with the measured ratio beside each pair, and all seven pairs are shown in card 26.

### C12 · Specimen/component drift on the "All Orders" tile — FIXED

Cards 10 and 22 hand-drew the "All Orders" KPI tile with the `pending` pairing, but `MetricCard`'s default tone is `neutral` (navy-600 on cream-200, 7.4:1). The specimen therefore showed a colour the component would not render. Both cards moved to the neutral pairing — which resolves the drift and the contrast in one move.

### C13 · Corrected figure

Card 26 stated "Action Blue on sky · 2.5:1"; measured is **3.1:1**. Still failing for small text, but it clears 3:1 for large type and graphical objects, so the card and readme now say so. "Cream on deep sky" measures 3.6:1, not 3.5:1.

### C14 · Low-contrast label ink, system-wide — FIXED

**Root cause:** `--navy-300` (2.0–2.2:1) and `--navy-400` (3.0–3.4:1) were used as small-text ink on light grounds across 50 files, and small text was additionally de-emphasised with `opacity`. `--navy-500` is the lightest navy that clears 4.5:1 on every light ground in the system (cream-100 5.3 · cream-200 5.0 · white 5.5 · sky-50 5.2 · sky-100 4.8).

Fixed as a rule in the token layer, then swept, rather than card by card:

| Change | Effect |
|---|---|
| **Text ink floor** stated in `tokens/colors.css`: on light grounds text is never lighter than navy-500 | `--text-muted`, `--text-label`, `--text-subtle` all → navy-500 |
| `--navy-400` / `--navy-300` reclassified as **non-text** (icons, borders, dots, empty stars, disabled); new `--text-nontext` names the legitimate use | icon at 3.4:1 clears the 3:1 object threshold |
| Swept all 25 components + 37 cards: every `color:` use of navy-300/400 → navy-500; `stroke=` / `fill=` left alone | 50 files touched |
| **All `opacity` removed from small text** | a 4.8:1 badge label at `opacity:.72` was landing at 2.9:1 |

The worst instance was self-defeating: card 29's ratio annotations — the evidence that all seven status pairs clear 4.5:1 — were themselves at 2.9–3.6:1 because of `opacity:.72`. They now render in the full `-fg` colour, differentiated by size and tracking.

### C15 · Logo colour system — navy demoted, light sky promoted — APPLIED

Directive: *"logo nên ưu tiên xanh nhạt / sky blue, không nên để navy làm bản mặc định… logo là brand light, không phải information ink."*

| Ground | Was | Now |
|---|---|---|
| Cream / white / floating nav | navy-700 | **sky-500** `--logo-on-light` (2.5:1) |
| Same, small or dense | — | **sky-600** `--logo-on-light-strong` (3.7:1) |
| Bright sky | navy-700 | **cream-100** `--logo-on-sky` |
| Favicon, watermark, tech stamp | (was the default) | navy-700 `--logo-technical` — **rare utility only** |

`GwpMark` default `tone` changed `"navy"` → `"sky"`; new tones `sky-strong` and `white`; the stacked lockup's third line now takes a deeper step of the *same sky family* rather than borrowing Action Blue, keeping logo and interaction colours distinct. Updated: brand overview card, colour duties card (new LOGO row), logo card 28 (rebuilt around the four grounds), and the hand-drawn mini-navs in cards 10, 22, 23, 24. Component nav examples pick the new default up automatically.

Logotypes are exempt from WCAG 1.4.3, so sky-500 at 2.5:1 is permissible and was chosen for lightness; `sky-strong` is the documented step-up.

### C16 · Temperature rebalance — cream narrowed, cool neutral introduced — APPLIED

Directive: *"A clear blue morning with warm craft details, not a warm cream interface with some blue."* Bright Sky, Navy, Action and the logo-cream-on-sky rule unchanged.

| Change | Where |
|---|---|
| New operational neutral `--neutral-50:#FBFCFA` (+ `--neutral-100`), exposed as `--surface-shell` — the default for card shells, filter surfaces, utility panels, documentation grounds | `tokens/colors.css`, `tokens/surfaces.css` |
| Cream duty narrowed to brand: logo on sky, nav shell, marketing moments, blue/cream rhythm, product wells | surfaces token comments, card 03, readme |
| KPI wash palette `--wash-sky/-warm/-blue/-green/-coral` (#E4F2FB / #FFF7DF / #EAF4FB / #E6F5EC / #FCE9E3); row reads BLUE / LIGHT WARM / BLUE / GREEN / CORAL | `MetricCard` TONES, `WalletSummary`, cards 10 + 22 |
| Cooled: Drawer body, TicketConversation ground, DataTable zebra → neutral shell; 24 documentation card grounds moved off cream | components + guidelines sweep |
| Kept warm deliberately: nav shell, Button `cream`, product wells (ProductCell/ProductCard), marketing surfaces, the rhythm card | — |
| StatusBadge tones untouched — badges are small doses, not fields; their verified contrast pairs stand | — |

Temperature target: cool ~70% / warm ~30%, qualitative. Note: two earlier rendered-HTML tile patches (C12 for card 22, and the first attempt at this change) had silently no-opped because they targeted source-template text; the tiles are now patched in their rendered form and grep-verified clean.

### C17 · Button language matched to the approved reference — APPLIED

Buttons are now soft borderless PILLS by default (`shape="pill"`), carried by fill + one quiet shadow: `primary` Action Blue/white (4.6:1), `secondary` white pill with Action Blue label (5.6:1), new `soft` pale-sky pill with navy ink (6.7:1). The reference's soft-blue pill carries light text at ~2.6:1, which fails 4.5:1 for button labels — `soft` therefore uses navy ink, and Action Blue remains the only filled pill with white text. `shape="rounded"` retained for dense operational toolbars. Padding widened one step for pill geometry.

### C18 · `ghost` on dark grounds — FIXED

A cream-labelled `ghost` button on the deep-sky Balance block went to **1.1:1 on hover**: `HOVERS.ghost` swaps in `--sky-100`, while the screen's `style={{color:"var(--cream-100)"}}` survived because `style` spreads last. The rest state was already failing too — cream on sky-600 is **3.65:1**, large-text only, below the 4.5:1 a 13px label needs.

Fixed in the component, not the screen: new `inverse` variant (cream label, hairline cream border, hover → cream scrim at 0.18 alpha) for **navy-class grounds only**, where cream clears ~9.5:1. Its `.d.ts` and prompt now state that `ghost` is light-grounds-only and that `--surface-hero-deep` takes `cream` (11.5:1) or `secondary` (5.6:1) — the dashboard's two actions moved to exactly those, and the colour override was removed.

### C19 · `--surface-hero-deep` is a mid-luminance dead zone — FIXED

Measured against #3C8CB8: navy-900 **4.10** · white 3.73 · cream 3.65 · navy-800 3.63 · navy-700 3.15. **No ink in the palette clears 4.5:1**, so the token can host large display type and nothing else. The Balance block had a 12px label, a 13px line and 13px money on it, all reduced with `rgba(...,0.82)` → **2.98:1** — breaking two rules authored in §C14 and the readme's cream-on-sky scope. Removing the alpha only reaches 3.65:1, so the placement had to change, not the opacity.

Fixed by encoding the constraint: `tokens/surfaces.css` now states the token is display-only and that small text must sit on a nested light chip; the Balance block's label moved to a cream pill (11.5:1) and its pending money to a white pill (navy-900, ~13:1); and `PageHero tone="deep"` now automatically renders its eyebrow and subtitle on chips, so the same trap cannot recur in any consuming screen. Also fixed: the hero art placeholder label (cream@0.9 on sky-300 = 1.41:1 → navy-700, 7.82:1) and `IconButton`'s notification pip (white on orange-500 = 2.50:1 → navy-900, 6.12:1, system-wide).

### C10 · Contrast cost of C2/C3 — NEEDS A DECISION

Measured: cream `#FFFDF0` on sky `#ABDAEF` = **1.4:1**. White on sky = 1.5:1. Both fail WCAG, including the 3:1 large-text threshold. Action Blue on sky = 2.5:1, also failing (hence C3's white default).

Implemented as a **declared exception scoped to display type only** — never labels, controls, body copy or data. Page identity stays accessible via the active nav pill (navy on cream, 11.5:1) and the document title. Navy functional text on sky is unchanged at 7.8:1 (AAA).

Three ways to close it, in order of how little they cost the art direction:

1. **`tone="deep"` for hero blocks** — sky-600 `#3C8CB8` lifts cream to **3.5:1**, AA large. Already implemented and available; would need to become the default. Costs: heroes get noticeably deeper blue.
2. **Accept the exception as-is** — brand-artwork licence, documented, non-conformant. Costs: an accessibility finding on every hero.
3. **Darken the canonical Bright Sky** so cream clears 3:1 on the primary field. Explicitly out of scope this pass ("do not change the canonical Bright Sky hex yet") but the only route that keeps one sky value *and* conforms.

**Recommendation: (1).** It keeps cream hero type, keeps sky dominant, and conforms — at the price of a deeper hero blue than `#ABDAEF`.

---

# DECISIONS REQUIRED (historical — see § RESOLUTIONS below for final calls)

> ⚠️ **CLOSED — do not action this list.** All six items were resolved on 2026-08-17; the final calls are in **§ RESOLUTIONS** immediately below. This block is retained only as a record of what was once open.

1. **`tokens.json`** — send it, or confirm the derived values are canonical from now on. (Blocks B1, T3.)
2. **T4 status colours** — do the backend `FULFILLED_STATUS` themes move to the GWP tones, or does the frontend stop reading them?
3. **Baloo 2 + Vietnamese** — accept Nunito Sans bold for Vietnamese operational strings, or license a display face with full Vietnamese coverage?
4. **Reviews/ratings** — does a reviews entity exist? Until confirmed, `ProductCard` ratings stay off.
5. **Brand spelling** — "GoodWoodPrint" or "GoodWoodPrintz"?
6. **C10 above — cream-on-sky contrast.** Deep-sky hero fields (recommended), accept the documented exception, or revisit the canonical sky hex?

---

# RESOLUTIONS — this pass (2026-08-17)

Closed for implementation purposes. Claude Code (or any implementer) builds against these — they are no longer open questions:

1. **`tokens.json` — RESOLVED.** No external kernel ever arrived. `tokens.json` at the project root is now the canonical, machine-readable export of every token in `tokens/*.css`, auto-extracted from source (231 tokens). The derived values are canonical from this pass forward. B1 and T3 are closed; if a real kernel arrives later, reconcile `tokens.json` against it, not the reverse.
2. **T4 status colours — RESOLVED.** The design system's seven semantic tones (`StatusBadge` / `STATUS_TONES`) are canonical for all UI. The frontend maps `warehouse_status` / ticket-status strings to `STATUS_TONES` and must not read `metadata.ts`'s `FULFILLED_STATUS` theme/color literals for chrome — those are pre-rebrand Metronic values. (Whether the backend team also updates or deprecates `metadata.ts` itself is a separate backend decision, out of scope here.)
3. **Baloo 2 + Vietnamese — RESOLVED.** Nunito Sans 700 is the Vietnamese display substitute everywhere a Vietnamese string would otherwise sit in a Baloo 2 slot (page titles, KPI numbers, card titles). Baloo 2 stays reserved for English/Latin display moments. No new face is being licensed.
4. **Reviews/ratings — RESOLVED.** No reviews entity exists in the backend. `ProductCard.rating` / `.reviews` stay off by default, DOMAIN-BOUND, until a reviews entity ships. Never pass placeholder values in any new screen.
5. **Brand spelling — RESOLVED.** "GoodWoodPrint" (no trailing z) is canonical — matches the supplied logo and the brief. "GoodWoodPrintz" on the reference board is the exception, not the rule.
6. **C10, cream-on-sky contrast — RESOLVED.** A deep-sky field (`PageHero tone="deep"` or equivalent) is **required**, not optional, for any hero carrying cream display type where that headline is the only place its information appears. The plain Bright Sky exception (1.4:1, non-conformant) is sanctioned only for purely decorative brand moments whose information is available elsewhere on the page in a conformant pairing (active nav pill, document title). The canonical Bright Sky hex is not being changed.
