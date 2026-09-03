# GOODWOODPRINT FULFILLMENT — Team Design System

The shared design system for every GoodWoodPrint digital surface: the **Seller Fulfillment App**, **marketing / landing pages**, the **Product Catalog**, **Product Detail**, and future GWP digital products.

One system, three surface classes — Operational, Marketing, Catalog. Not three styles.

> **Success criterion:** hide the logo and the system should still read as GoodWoodPrint — bright sky field, warm cream counter-surface, navy operational type, tree-ring watermark, and a Craft Cut where sky meets cream.

---

## 1 · Company & product context

GoodWoodPrint is a **print-on-demand fulfillment business for personalized products** — wood and acrylic ornaments, ceramic ornaments, mugs, tumblers, phone cases, canvas prints, tote bags, doormats, photo plaques, keychains, night lights. Sellers on Shopify, Etsy and TikTok Shop send orders in; GWP prints, packs, QCs and ships them.

The proposition, in the brand's own words: **"Good wood. Great products. Made personal."** — *the all-in-one fulfillment platform for personalized products. Create, sell, and deliver with ease.*

### The digital surfaces

| Surface | Audience | Modules |
|---|---|---|
| **Seller Fulfillment App** (operational) | Sellers + internal ops | Dashboard · Orders · Products / SKU / BOM · Inventory · Tickets · Wallet · Tracking · Reports & Analytics · Settings |
| **Marketing site** | Prospective sellers | Landing, How It Works, For Sellers, Resources, Pricing, About |
| **Product Catalog / Detail** | Buyers & sellers browsing | Category browse, faceted filter, product grid, product detail |

Internally the platform also serves warehouse and production roles — order intake, label extraction, fulfillment scanning, QC packing, production pipeline, material inventory and BOM management, vendor and expense tracking, customer notifications, API keys and marketplace integrations.

### Real domain vocabulary (authoritative — read from the backend, never invent)

**Order / warehouse statuses** (`ORDER_STATUS`, `src/constants/common.ts`):
`Pending` · `Validating` · `Mockup Generating` · `Processing` · `Production Ready` · `In Production` · `Produced` · `Filled` · `Fulfilled` · `Completed` · `Cancel` · `Refund` · `Return` · `Wrong Label` · `Design problems` · `Asset processing failed` · `Out Of Stock`

**Ticket statuses** (`TicketStatus`): `open` · `in_progress` · `closed`.
**Ticket priorities**: `low` · `medium` · `high` (+ `critical` in metadata).

**Roles** (`USER_ROLE`): `admin` · `customer` (the seller) · `warehouse` · `warehouse_external` · `warehouse_admin` · `supporter` · `designer`. Column sets, row actions and form fields differ per role — the design system provides the containers; role logic is the app's.

**Order fields** that matter visually: `order_id`, `order_sku`, `tracking_number`, `warehouse_status`, `tracking_status`, `product` / `variant`, `quantity`, `marketplace`, `base_cost`, `shipping_cost`, `shipping_type`, `design`, `mockup`, `label_url`, `note` / `warehouse_note`, `basket_position`, `barcode`.

**Business boundary:** design the visual container, not the business behaviour. Do not invent order states, production or shipping lifecycles, SKU rules, BOM hierarchy, inventory math, wallet/accounting semantics, roles, permissions, personalization flows or pricing rules. When business truth is unknown, ship the empty container.

---

## 2 · Sources this system was built from

| Source | Path / link | What was taken |
|---|---|---|
| **Approved GWP reference images** (primary visual truth) | `assets/reference/*.png` | Visual taste, composition, proportion, colour rhythm, whitespace, hierarchy, photography placement |
| **Supplied brand mark** | `assets/logo/gwp-logo-cream-on-sky.png` | The GWP wordmark, cream on sky, with heart + tree-ring detail |
| **Frontend codebase** | `GWP-main/fulfillment-fe-new-prod/` (React 18 + Vite + Tailwind, Metronic "demo1" template) | Module inventory, page structure, nav labels, table column sets, form field sets, role-based views |
| **Backend codebase** | `GWP-main/fulfillment-system-be-prod/` (NestJS + Prisma) | Order status enum, ticket enums, roles, metadata status themes, order/ticket field names |

### What was **not** available

- **`DESIGN.md`, `tokens.json`, `COMPONENTS.md`, `PATTERNS.md`, `SCREENS.md`, `MARKETING.md`, `CATALOG.md`, `DOMAIN_BINDINGS.md`, `DESIGN_QA.md` do not exist anywhere in `GWP-main`.** The brief lists them as sources of truth; they were not in the attached codebase. Where the brief itself stated a value (the seven canonical colours, the three typefaces) that value is canonical here. Everything else numeric — ramps, scales, radii, shadows, motion — was derived by measuring the approved reference images. **If the real `tokens.json` exists, hand it over and the token files will be reconciled to it exactly.**
- The only token file in the repo, `fulfillment-fe-new-prod/tokens.css`, is an unrelated **graphite / "austere operations console"** theme (Space Grotesk, oklch greys, no shadows). It contradicts the approved GWP direction on every axis and was **deliberately not used**.
- **No vector logo.** Only the raster PNG above. Product UI therefore uses type-set lockups (`GwpMark`); the PNG serves favicons, packaging and email until an SVG arrives.
- **No brand illustration assets.** The reference images show a consistent workshop line-art family, but no source files were provided. `guidelines/19-illustration.card.html` documents the style and slots for it; nothing was drawn or generated.
- **No product photography assets.** `guidelines/20-photography.card.html` documents the art direction; components take an `image` / `media` node so real photography drops straight in.
- **Naming inconsistency:** the reference board reads **"GoodWoodPrintz"** in places and **"GoodWoodPrint"** in the logo and brief. This system uses **GoodWoodPrint**. Confirm the canonical spelling.
- **Bilingual internal ops:** several warehouse routes are Vietnamese (`Kiểm tra đơn`, `QC đóng gói`). Internal ops screens will need a bilingual type audit — Nunito Sans and IBM Plex Mono both cover Vietnamese diacritics; Baloo 2 does not fully, so **avoid Baloo 2 for Vietnamese strings** and use Nunito Sans bold instead.

---

## 3 · CONTENT FUNDAMENTALS

**The voice is a warm, competent craftsperson who also runs a tight warehouse.** Confident and plain, never corporate, never cute.

**Person.** Marketing speaks to **you** ("Built for sellers", "Everything you need to build your brand"). The app speaks to the seller by name and about **your** things ("Welcome back, Jane!", "Here's what's happening with your store today", "your fulfillment operations"). GWP refers to itself as **we** only when accountable — "We fulfill", "We print, pack, and ship", "We're very sorry about that."

**Casing.** Sentence case everywhere in prose and buttons. Title Case for nav items, page titles, module names and table headers (`Order ID`, `Production Status`, `Tracking Number`). ALL CAPS only for 11px table headers and eyebrow labels, always with `--ls-caps` tracking. Never all-caps a sentence.

**Punctuation.** Marketing headlines are **short declarative sentences with full stops** and authored line breaks — that is the signature move:

> Good wood.
> Great products.
> **Made personal.**

Three beats: product, quality, emotion. The final beat is the Action Blue line. Same structure elsewhere: "Built for sellers. Designed for growth."

**Length.** Page subtitles are one clause, ≤ 60 characters: *"Track every order from checkout to delivery"*, *"Catalog, SKU and BOM management"*, *"Customer support and order issues"*, *"Balance, payouts and transaction history"*, *"Explore our wide range of customizable products"*. Feature-card body is two sentences maximum. Empty-state body is one sentence that says what to do next.

**Numbers.** Always formatted, never raw: `1,248` · `$2,485.50` · `18.2%` · `36.5%`. Deltas always carry their comparison: `↑ 18.2% vs last 7 days`. Counts sit next to their label in mono: `Ornaments 128`.

**Labels.** Name the dimension, not the action: `All Stores`, `All Statuses`, `Date Range`, `Best Selling`. Search placeholders say what is searchable: *"Search anything…"*, *"Search orders, customers…"*, *"Search products…"* — never bare "Search".

**Status language is fixed** by the backend enum. Write `In Production`, not "Producing". Write `Design problems`, not "Design issue".

**Support tone** is warm and accountable, and owns the problem before explaining it: *"We're very sorry about that. Let us check this for you."* → *"Thank you! We will ship the missing item today."*

**Empty states** are warm and specific — *"No orders yet"* with *"Orders you create or import will show up here, with production and shipping status."* Never "No data" or "Nothing to see here".

**Emoji: no.** The reference board shows a single waving-hand in one dashboard greeting; treat that as the one sanctioned exception (an optional flourish in a personal greeting) and use **no emoji anywhere else** — never as icons, bullets, status or decoration.

**Never** write: "Seamlessly", "Effortlessly", "Revolutionize", "Unlock", "Supercharge", "Leverage", "Robust", "Best-in-class", "Game-changing". No exclamation marks outside a greeting.

---

## 4 · VISUAL FOUNDATIONS

### Colour

**Two tiers, enforced structurally.** `tokens/colors.css` holds a locked CANONICAL block — the seven brand hexes, the only literal brand values in the system — and a DERIVED block whose every ramp resolves back to its canonical anchor via `var()` (`--sky-300: var(--gwp-bright-sky)`, `--navy-700: var(--gwp-information-navy)`, and so on). A ramp edit therefore cannot silently redefine a brand value, and a derived token may never take over a canonical colour duty.

Seven canonical values the brand owns — `#ABDAEF` Bright Sky, `#FFFDF0` Warm Cream, `#0F3A5F` Information Navy, `#0078C1` Action Blue, `#FF8041` Orange Accent, `#FFE471` Yellow Accent, `#FFFFFF` White. Every other value in the system is a tint or shade of one of those hues (`tokens/colors.css`), so nothing ever drifts off-brand.

**Duties are relationships, not area quotas.** There are no percentage targets — composition decides how much of each colour you actually see.

| Colour | Duty |
|---|---|
| **Sky** | Dominant open brand canvas. **The page itself** — never a rectangular panel trapped inside a cream card. |
| **Cream** | **Brand warmth, in doses.** The logo on sky, the floating nav shell, marketing brand moments, the blue/cream rhythm, product wells. NOT the default fill for operational cards, panels, forms or documentation grounds. |
| **Soft Neutral** `--surface-shell` #FBFCFA | **The default operational surface.** Card shells, filter surfaces, utility panels, documentation grounds — near-white, clean, faintly warm, never visibly yellow. |
| **White** | Nested clean data / product surface. Tables, cards, panels, photography wells. |
| **Navy** | Informational ink only. Body, labels, controls, tables, KPI numbers. Never a large background — and never the hero display mass. |
| **Action Blue** | Emphasized interaction only. One primary per region; one accent word where it clears contrast. |
| **Orange / Yellow** | Tiny accents. One bestseller badge, one notification pip, one marketing highlight. |

**Never make the system predominantly white.** A white page with blue buttons is the generic-SaaS failure mode this palette exists to prevent.

**Cool leads the temperature.** From a distance an operational screen reads COOL SKY BLUE first (~70%), with warm craft details (~30%) supporting it — a clear blue morning with warm craft details, never a warm cream interface with some blue. Qualitative balance, not a pixel quota. GWP is never beige, vintage, yellow or overly creamy.

**Sky is the visual hero.** The viewer should *feel* the blue before noticing the cards. Sky appears as large uninterrupted page areas, hero canvas, brand blocks and breathing space around content — it is the dominant first impression, not a background token. The specific failure this replaces: a cream card containing a blue rectangle containing white cards. That traps sky inside a container and the brand colour reads dull and administrative.

**Status colour** is a seven-tone semantic layer (`success`, `progress`, `info`, `pending`, `attention`, `critical`, `neutral`) with the entire real backend vocabulary mapped onto it in `StatusBadge`. Colour is never the only signal — the label always reads, and every tone pair is contrast-verified at 4.5:1 for its 11–12px bold label.

### Surface hierarchy

**Sky is the page; cream floats on it; white nests inside cream.** The rhythm alternates confidently across large areas:

```
BRIGHT SKY PAGE FIELD
  ↓  soft neutral shell   (brand cream for deliberate rhythm moments)
      ↓  white nested data
  ↓  return to sky
```

A fourth nesting level does not exist — card-inside-card-inside-card is explicitly out. `--surface-inset` (palest sky) exists only for input wells. `--surface-hero-deep` (sky-600) exists for hero blocks that need cream type to clear contrast. The `Surface` component enforces the hierarchy; use it rather than hand-rolling white boxes.

### Typography

**Display ink follows the surface — there is no universal display colour.** This is the single most important typographic rule in the system:

| Context | Ink |
|---|---|
| Display on saturated sky (sky-300+) | **Cream** `--display-on-sky` |
| Marketing accent line on sky | **White** `--display-on-sky-bright` |
| Display on pale sky (50/100/200) | Navy `--display-on-pale-sky` |
| Display on cream | Navy `--display-on-cream` |
| Display on white | Navy `--display-on-white` |
| KPI number | Navy `--display-kpi` |
| Data / table heading | Navy |
| Marketing accent word on cream or pale sky | Action Blue `--display-accent`, selectively |

**Never teach "display = navy."** A navy hero headline on sky — "Orders", "Dashboard", "Welcome back, Jane." — is the single fastest way to make GWP look like a generic SaaS admin. On sky the hero is cream; navy carries the eyebrow, the subtitle, the labels, the data and the controls. GoodWoodPrint should feel **light first, data second**.

- **Display — Baloo 2** (700 / 800). Brand moments, marketing headlines, operational page titles, KPI numbers, card titles. It creates personality; it does not run the UI. Tracking `-0.015em` to `-0.02em`, line-height 1.06 at display sizes.
- **Body/UI — Nunito Sans** (400 / 600 / 700). Navigation, controls, tables, body copy, everything operational. 14px is the UI default, 13px in dense rows, 12px labels, 11px uppercase table headers.
- **Technical — IBM Plex Mono** (400 / 500 / 600). Order IDs, SKUs, variant keys, tracking numbers, barcodes, transaction amounts, ticket references, filter counts. If a human wrote it, it is not mono.

Marketing display runs 56–64px; operational page titles 44px; section titles and KPI numbers 32px. **Do not make the product feel childish** — Baloo 2 is rounded and friendly, so it must be rationed. A screen where every label is in the display face has lost the plot.

Baloo 2, Nunito Sans and IBM Plex Mono are all **Google Fonts**, loaded via the Google CSS API in `tokens/fonts.css`. No font binaries were provided; if the team licenses different faces, swap that one file.

### Spacing & layout

4px base scale (`--space-1` … `--space-32`). Content max 1280px (marketing 1200px), gutters 32px desktop / 16px mobile, nav height 64px, table rows 56px (48px dense), controls 32 / 40 / 48px, touch minimum 44px. Section gaps are 48px operational and 96px marketing — **the whitespace is the premium signal**, so reach for the larger steps at every section boundary and the smaller ones only inside data.

### Backgrounds

Flat colour fields, with **one sanctioned exception — the sky → white dissolve field**, kept as an available option with **no using screen today** — the whole admin surface is now a white ground (see `admin-app/`). A flat sky field plus white cards plus hard 1px box edges reads as stacked rectangles; one soft vertical dissolve from Bright Sky at the top edge to white further down turns the page back into a single continuous field that content sits *on*. `--field-admin` fills the shell column, `--field-rail` the nav rail, `--field-sheet` the panels, and delineation switches to a 1px border plus a **fading seam** (`--seam-v` / `--seam-h`) instead of a filled box. Rules: vertical only, top → bottom, sky → white, one per screen; never diagonal, radial, multi-hue, or under a photograph. Stops are absolute px, not %, so the dissolve reads identically on an 800px screen and a 4000px scroll. **The admin dashboard, order and product screens deliberately do NOT use it** — they are pure white grounds with one sky element each; the dissolve stays available, it is not the default.

**No image backgrounds, no photo heroes with text over them, no textures, no noise, no glass.** Depth otherwise comes from three things only: a change of surface colour, a **Craft Cut** boundary, and the **Wood Rings** watermark. Photography sits *in* the composition as an object, never *behind* the type.

The second sanctioned gradient is the **brand gradient**: `--field-hero-sky` (sky → a faint cyan lean) and `--field-cta-blue`. It exists so one large pale-blue block does not read as flat card stock — **if you can name the second colour at a glance it is too strong.** One surface per screen: the dashboard hero, or the single primary CTA. Never on cards, tiles, tables, badges, nav, status, or two surfaces at once.

### The brand mark is brand light, not information ink

| Ground | Mark |
|---|---|
| Cream, white, the floating nav shell | **Light sky** `--logo-on-light` (sky-500) — the default |
| Same, at small sizes or inside dense data | `--logo-on-light-strong` (sky-600) |
| Bright sky field | **Cream** `--logo-on-sky`, or white `--logo-on-sky-bright` |
| Favicon, watermark, technical stamp, very-high-contrast data zone | Navy `--logo-technical` — **rare, utility only** |

**Navy is no longer the default logo colour.** A navy mark reads heavy, corporate and less airy, and pulls the brand toward SaaS/admin — the exact drift the palette exists to prevent. The three-way split is: **logo = brand light · navy = information · Action Blue = interaction.** The logo sky is deliberately one step stronger than the page sky, so the mark separates from a cream ground while still feeling light (sky-500 is 2.5:1 on cream, sky-600 is 3.7:1; logotypes are exempt from WCAG 1.4.3).

Per surface: the floating cream nav takes a light-sky mark with navy nav text, a pale-sky active chip and an Action Blue CTA. A sky hero block takes the cream mark alongside the cream hero title and navy subtitle. Catalog and Product Detail keep the light-sky mark on their light surfaces.

### Signature motifs

1. **Wood Rings** — cropped concentric tree-ring geometry, drawn with `repeating-radial-gradient` so it tints and scales freely. Hero corners, brand moments, empty states, loaders, subtle watermarks. Cream on sky, navy on cream, sky on white. One cluster per composition. **Never behind dense operational data.**
2. **Craft Cut** — the smooth organic router/CNC boundary where one colour field is cut into the next. 48–72px operational, 96–160px marketing, 44px catalog. Two per screen maximum, sweeping opposite directions. It must always separate two *different* colours — a floating curve over one flat field is a blob, and blobs are out.
3. **Workshop line art** — navy or action-blue single-weight stroke, rounded caps and joins, minimal flat fill, calm competent people mid-task. Makers, packing, printing, QC, shipping, support, workshop equipment, sellers. This is the imagery language for **operational** heroes and empty states.
4. **Product photography** — real personalized products, sky or cream set, bright studio key with one soft directional shadow, warm-neutral grade, product filling 60–75% of frame. This is the imagery language for **marketing** and **catalog**. Never generic SaaS stock.
5. **GWP monogram** — a recurring signature, not a decoration. Favicon, loader, and occasionally on a box, mug, apron or screen inside an illustration. Once per illustration; never sprinkled through the UI.

### Corner radii

Everything is rounded and soft; nothing is sharp and nothing is fully square. 8 / 10 / 14 / 18 / 24 / 32 / 44 and pill. Controls are 10px; cards, surfaces and heroes are a uniform 14px round; the fuller 18/24/32/44 steps remain for chat-bubble tails, icon chips and decorative accents. Badges, chips, nav pills and marketing CTAs are always pill.

### Cards

White fill, 14px radius, `--shadow-xs` at rest, a **1px hairline border at 8% navy** — and that is all. No coloured left borders, no header bars, no inner cards. Hover on a clickable card: lift `-2px` + `--shadow-md`, 220ms. Flat tinted tiles (metric tiles, wallet figures) carry **no** shadow and no border. On the admin dissolve field the card becomes `Surface level="sheet" outline` — same 14px radius, a white → palest-sky fill and a 1px `--border-soft` edge, because a pure-white card with an 8% hairline disappears where the field itself has gone white.

### Shadows

Blue-tinted (`rgba(15,58,95,…)`), wide and faint — they read as daylight, not elevation drama. Five steps: `xs` cards at rest, `sm` surfaces, `md` hover, `lg` popovers/menus, `drawer` for side panels. **Never stack shadows, never go above `lg`, never use a dark or neutral-grey shadow.** No inner shadows except `--shadow-pressed` on pressed controls. No "protection gradients" — text always sits on a solid field, so it never needs one.

### Borders

Hairline and sparing: `--border-hairline` (8% navy) inside data, `--border-soft` (12%) on controls, `--border-strong` (20%) on hover. Tables have **horizontal row rules only — no vertical grid and no grey header fill.** A change of surface does most of the separating; if you're reaching for a border, ask whether a surface step would do it better. On the admin dissolve field, a rule that would run the full width or height of the shell — the rail's right edge, the rail's group dividers, the brand and footer rules — **fades out** (`--seam-v` / `--seam-h`) rather than closing a box. The least-framed step is `DataTable surface="field"`: no card at all, the table's own row rules on the field, with a sticky white header row pinned at the condensed `AdminBar` height.

### Transparency & blur

Used only for the modal/drawer scrim (`--overlay-scrim`, 34% navy) and for ring/shadow alpha. **No glassmorphism, no backdrop blur, no translucent panels, no frosted nav.** Surfaces are opaque.

### Animation

Calm and physical — things settle, they do not bounce. `--ease-out` `cubic-bezier(.2,.8,.2,1)` for essentially everything. Durations: 140ms hover/focus/colour, 220ms card lift and fades, 340ms drawers and page-level, 520ms brand moments. `--ease-craft` is the one slightly overshooting curve and is **reserved for brand moments** — never on a control. Named keyframes live in `tokens/animations.css` (`gwp-spin`, `gwp-pulse`, `gwp-shimmer`, `gwp-fade`, `gwp-slide-*`, `gwp-rise`, `gwp-ring`); don't author one-off keyframes in a page. `prefers-reduced-motion` disables all of it.

### Hover, press & focus states

- **Buttons are soft borderless pills by default** — fill plus one quiet `--shadow-sm`, no visible border (`shape="rounded"` survives only for dense operational toolbars). `primary` = Action Blue fill/white label; `secondary` = white pill with Action Blue label; `soft` = pale-sky pill with navy ink (the reference's soft-blue pill, inked navy because white on soft sky fails 4.5:1).
- **Hover** darkens, it never lightens: primary → `--action-600`; secondary → pale sky fill; ghost → `--sky-100`; table row → `--sky-50`; nav pill → `--cream-200`; card → lift + `--shadow-md`.
- **Press** scales to `0.98` and darkens one further step (`--action-700`). **Never change hue on press.**
- **Focus** is a 3px Action Blue ring at 2px offset — `--shadow-focus` on fields, `outline` on everything else. It is never removed, on any surface.
- **Selected** is a fill, not an underline: filled sky pill in nav, filled Action Blue in filter chips and pagination. The one sanctioned left-accent pattern in the entire system is `SupportPanel`'s 3px blue selected edge — and it is a *selection state*, never decoration.

### Navigation, CTAs and KPIs — the three canonical calls

These three are where a GWP screen most easily drifts into generic SaaS, so the components enforce them rather than documenting them:

- **Navigation is a floating cream shell**, not a full-bleed header. Sky stays visible around a rounded (`--radius-md`) cream surface with one quiet `--shadow-sm`, 32px inner padding, centred at `--content-max`. `TopNav variant="bar"` is the full-bleed fallback and is explicitly non-canonical — except on the **admin** surface, where `variant="bar" surface="white"` is the intended shell: white ground, sky logo, pale-sky active pill, sky-50 hover, one bright CTA. Cream stays the seller and marketing shell.
- **The operational page hero owns no CTA.** `PageHero` has no `actions` prop. Operational actions live in `TopNav.cta`, `SearchShell.action` or `TabBar.right`. `MarketingHero` keeps its CTAs; `CatalogHero` follows catalog rules.
- **The operational hero title is cream, not navy.** `PageHero` derives its display ink from `tone`: saturated sky → cream, pale sky and cream → navy. Operational screens must stay bright, airy and brand-forward; data zones may quiet down, but the page atmosphere does not darken just because the page contains a table.
- **The KPI row is cool-led:** BLUE / LIGHT WARM / BLUE / GREEN / CORAL (`--wash-sky`, `--wash-warm`, `--wash-blue`, `--wash-green`, `--wash-coral`) — never a run of yellow-family tints in neighbouring tiles. Pending is the single warm note.
- **The canonical KPI treatment is a semantic wash surface** — a pastel field in the tone's own hue, no border, no shadow, label and value in the tone's ink (`MetricCard variant="wash"`, the default). The white bordered card with an icon chip is `variant="card"`: secondary, opt-in, at most one introductory row per screen. On the admin dashboard the row is neither: white card, no border, `--shadow-xs`, a pale-sky icon blob, the number in navy display and a bright-blue sparkline bled to the card's edge — **four identical blue tiles is the failure mode**, since a wash row repeated across every module stops meaning anything.

### Imagery colour vibe

Warm-neutral, bright, no grain, no filters, no black-and-white. Sky or cream environments. Line art is navy or action blue on flat sky/cream. Product thumbnails in tables and cards sit in **cream** wells — never grey. This single detail is most of what keeps GWP tables from looking like every other admin.

### Layout rules

Top nav is `sticky` at `z-index: 20` — **never a sidebar, never dark.** Drawers are `fixed` at `z-index: 60` with a scrim, sliding from the right. Nothing else is fixed: no floating action buttons, no sticky footers, no pinned toolbars. Screens are compositions with **one focal point**, not uniform grids: prefer a wide focal block beside a narrow rail, one KPI row per screen at most, occasional overlap between branded and operational regions, and deliberately uneven negative space.

---

## 5 · ICONOGRAPHY

**System: [Lucide](https://lucide.dev) at 2px stroke, rounded caps and joins, loaded from CDN** (`https://unpkg.com/lucide@0.462.0/dist/umd/lucide.js`).

**⚠️ Substitution flagged.** The production frontend uses **KeenIcons** — the icon font that ships with the Metronic admin template (`src/components/keenicons/`, with `outline`, `solid`, `duotone` and `filled` families). It is commercially licensed to the Metronic template and was therefore **not copied into this design system**. Lucide is the closest freely-redistributable match to the approved reference art: same single-weight outline construction, same rounded terminals, same ~24px optical grid. **If GWP owns a KeenIcons licence for redistribution, or has its own icon set, send it and this will be swapped.**

**Sizes.** 16px inline in buttons, chips and table cells · 18–20px in icon buttons, nav actions and metric-card chips · 22–24px in marketing feature cards. Stroke weight stays 2px at every size — never scale the weight.

**Colour.** `--icon-default` (navy-600) at rest, `--icon-muted` (navy-400) for secondary/decorative, `--icon-action` (Action Blue) inside tinted chips and active states, `currentColor` inside buttons so the icon follows the label.

**Icon chips.** The recurring pattern is a tinted rounded square holding a stroke icon — 38px / 10px radius in metric cards, 48px / 14px radius in feature cards. Background is the 100-step of the tone, icon is the 500/600-step.

**The working set**, mapped from real module names: `LayoutDashboard` (Dashboard) · `Package` (Orders / products) · `Boxes` (Products, SKU, BOM) · `Warehouse` (Inventory) · `Ticket` (Tickets) · `Wallet` (Wallet) · `Truck` (Tracking / shipping) · `BarChart3` (Reports & Analytics) · `Settings` (Settings) · `Search` · `Bell` · `Plus` · `SlidersHorizontal` (Filters) · `Calendar` (Date Range) · `Printer` (Labels) · `Upload` / `Download` (Import / Export) · `Tag` (Pricing / SKU) · `Globe` (Global fulfillment) · `Award` (Quality) · `Clock` (Delayed) · `MessageCircle` (Support) · `CheckCircle2` · `AlertTriangle` · `ScanLine` (Fulfillment Scan) · `MoreHorizontal` (Row actions) · `ChevronDown`.

**Never:** emoji as icons. Filled and outline mixed in one view. Duotone. Unicode arrows or symbols standing in for glyphs. Hand-rolled one-off SVGs — the only inline SVGs in this system are the small primitives baked into components (chevron, magnifier, check, star, close, delta arrow), which exist so a consumer can use the components without loading an icon library at all.

---

## 6 · Index

### Root

| File | What it is |
|---|---|
| `styles.css` | **The global entry point.** `@import` list only — link this one file. |
| `thumbnail.html` | Homepage tile for the design system. |
| `readme.md` | This document. |
| `SKILL.md` | Agent Skills front-matter so this folder works as a Claude Code skill. |
| `guidelines/ALIGNMENT_AUDIT.md` | **Alignment-pass audit** — blockers, visual/token/domain drift, the typography drift table, and the 5 open decisions. |

### `tokens/`

`fonts.css` (Google Fonts) · `colors.css` (canonical values, ramps, semantic aliases, status tones) · `typography.css` (families, weights, display + text scales, line-heights, tracking) · `spacing.css` (4px scale, gaps, padding, layout dimensions) · `geometry.css` (radii, borders, shadows, motif geometry) · `motion.css` (easings, durations, transitions) · `surfaces.css` (the sky → cream → white aliases) · `animations.css` (the named keyframes) · `base.css` (element defaults, link colours, focus ring). `status-tones.json` (at the project root, not in `tokens/`) mirrors the status→tone map for cross-stack use.

### `assets/`

`logo/gwp-logo-cream-on-sky.png` — the supplied brand mark (raster; a vector **wordmark** is still awaited from the team).
`logo-monogram.svg` — the **Wood Rings monogram**, drawn with concentric circles only (no fabricated wordmark). Vector favicon / loader / technical-stamp mark, in navy per the logo colour rules. NOT a substitute for the wordmark.
`reference/` — the three approved reference boards (system overview, operational screens, marketing + catalog). **Primary visual source of truth; keep them.**

### Components

`window.GoodWoodPrintFulfillmentDesignSystem_327690.<Name>`

**`components/brand/`** — `WoodRings` · `CraftCut` · `GwpMark`
**`components/core/`** — `Button` · `IconButton` · `StatusBadge` (+ `STATUS_TONES` map — defined in `components/core/status-tones.js`, the shared single source of truth, mirrored language-neutrally in `tokens/status-tones.json` for the frontend/backend)
**`components/forms/`** — `Input` · `SearchField` · `Select` · `FilterChip` · `DateRangeField` · `SegmentedControl`
**`components/navigation/`** — `TopNav` · `NavUser` · `PageHero` · `TabBar` · `Pagination` · `Breadcrumb` · `Sidebar` · `AdminBar`
**`components/data/`** — `Surface` · `MetricCard` · `DataTable` · `ProductCell` · `ShareBar` · `WalletSummary` · `SectionHeading` · `KeyValueRow` · `ChartFrame`
**`components/catalog/`** — `ProductCard` · `CatalogHero` · `SearchShell`
**`components/marketing/`** — `MarketingHero` · `FeatureCard`
**`components/feedback/`** — `EmptyState` · `LoadingState` · `Skeleton` · `Drawer` · `SupportPanel` · `TicketConversation` · `Callout` · `Popover` · `Modal` · `CommandPalette` (+ `CommandTrigger`) · `Toast` (+ `ToastStack`)

Each directory holds `<Name>.jsx`, `<Name>.d.ts` (props contract), `<Name>.prompt.md` (what & when, usage, rules) and one `@dsCard` showcase HTML.

**Intentional additions** (no direct counterpart in the sources, added because the component language needs them):
- `Surface` — the sky → cream → white primitive. Added because "never nest a fourth surface" is unenforceable as prose but trivial as a component. `level="sheet"` + `outline` is its admin-field variant.
- `WoodRings` / `CraftCut` — the two signature motifs, componentised so they are used consistently rather than re-hand-rolled per screen.
- `GwpMark` — a lockup component, since no vector logo exists and every surface would otherwise type the brand name by hand.
- `NavUser` — exported alongside `TopNav` because the identity block appears in every operational screen.
- `ShareBar` — the status-breakdown bar that exists in `SellerDashboard.jsx`; componentised because the encoded quantity (share of **total**, not of the largest row) and the track's minimum contrast are both easy to get silently wrong, and Orders/Products need the same element.
- `Callout`, `SectionHeading`, `KeyValueRow` — pulled out of the ui_kits screens themselves: `SourceNote`, `SectionHead`/`SectionTitle` and the label/value drawer row were each hand-built independently in 2–3 screens with slightly different shapes. One component, one shape.
- `Popover` / `DateRangeField` — `PageHero` and `Surface` both use `overflow:hidden` to crop their own decoration, which silently clips a plain `position:absolute` popover placed inside them. `Popover` escapes to a portal at fixed coordinates instead; `DateRangeField` is the pre-built custom-date-range case, previously hand-rolled per screen.
- `Modal` — a centred sibling to `Drawer` for content with no side to slide in from (a shortcuts legend, an image zoom); both existed as one-off dialogs in `SellerOrders.html`/`SellerCatalog.html`.
- `Toast` / `ToastStack` — promoted from `SellerOrders.html`'s own toast system; any screen with a mutating action needs the same confirmation primitive.
- `SegmentedControl` — the density/view-mode toggle (Gọn/Vừa/Đầy đủ, Lưới/Bảng), distinct from `FilterChip` (independent toggles) and `TabBar` (page navigation).
- `ChartFrame` — the methodology-first chart card for Reports & Analytics, a named app module with no prior design-system coverage at all; `SellerCharts.html` hand-built this same frame six times over.
- `Breadcrumb` — the trail + prev/next strip for a detail screen nested under a list, instead of a full `PageHero`. Deferred in `guidelines/ALIGNMENT_AUDIT.md` (O2) for lack of a using screen; `SellerProductDetail.html` now is one.
- `Sidebar` — the admin-only vertical nav rail (light, never dark). The real admin IA (`menu.config.jsx`) is 13 groups / ~30 routes, too deep for `TopNav`'s 6–8-item horizontal bar — chosen over an extended mega-dropdown TopNav after showing the user both. Operational (seller) screens keep `TopNav`; the two surfaces intentionally use different shells. Defaults to `field="gradient"` (dissolve rail + fading seams); `field="flat"` keeps the original opaque rail. Icon chips are the ACTIVE row's only — a rail of 13 tinted chips read heavy and the tint carried no meaning.
- `AdminBar` — the admin chrome bar, sibling to `TopNav`. Its default surface **is** the AdminDashboard bar — 64px opaque white, one hairline, constant height — so every admin screen wears the same top bar whether the brand mark sits in the bar (workstation screens, via `brand`) or in the rail; `surface="transparent"` keeps the older dissolve-field behaviour (no fill at rest, condensing to 52px on scroll). Like `PageHero` it owns no page CTA.
- `CommandPalette` / `CommandTrigger` — ⌘K navigation for an IA of ~30 routes, where neither a horizontal bar nor a 13-group rail can show the map. The component owns its hotkey; the trigger is the visible affordance in `AdminBar.right`, because a palette nobody knows about is not navigation.
- `Skeleton` — shimmer placeholder on the system's own `gwp-shimmer`. `LoadingState`'s spinner is for a whole empty region; `Skeleton` is for content whose shape is already known (table rows, KPI figures), so the layout doesn't jump when data lands.

### Domain boundaries

`StatusBadge` and `NavUser.role` are **DOMAIN-VERIFIED** against `fulfillment-system-be-prod/src/constants/common.ts` (`ORDER_STATUS`, `USER_ROLE`) and `src/ticket/ticket.enum.ts` (`TicketStatus`, `TicketPriority`), re-verified this pass.

Everything below is **DOMAIN-BOUND** — the components provide the visual container and assert no behaviour. Each is marked in its `.d.ts`:

| Surface | Component | State |
|---|---|---|
| Reviews / ratings | `ProductCard.rating`, `.reviews` | No reviews entity found in the backend. **Off by default; never pass placeholder values.** |
| Pricing rules | `ProductCard.price` | Caller supplies a formatted string. No currency, tax or discount rule implied. |
| Merchandising labels | `ProductCard.badge` | "Bestseller" / "New" imply an unverified rule. |
| SKU construction, BOM hierarchy | `ProductCell.code` | Fields exist; formats and nesting not read. Never parse or construct a SKU. |
| Wallet / accounting semantics | `WalletSummary` | Balance model not read. Label exactly what the backend returns; never derive or sum. |
| Production / shipping lifecycle, `tracking_status` vocabulary | `StatusBadge` | Transitions not modelled. `tracking_status` exists but has no enum — do not assume it matches `ORDER_STATUS`. |
| Permission logic | `NavUser.role` | Role names verified; visibility behaviour is the app's. |
| Personalization flow | — | Not modelled by any component. |

### `guidelines/`

The 20-section design-system presentation, as Design System tab cards:

| Group | Cards |
|---|---|
| **01 Brand** | Brand essence · Brand mark & lockups |
| **02 Colors** | Canonical palette · Colour duties · Tint ramps · Surface stack in use · Status system · Sky → white dissolve field |
| **03 Type** | Display (Baloo 2) · Body (Nunito Sans) · Technical (IBM Plex Mono) · Hierarchy in use |
| **04 Spacing** | Spacing scale · Corner radii · Shadow system · Motion |
| **05 Composition** | Blue / cream rhythm · Composition principles |
| **06 Motifs** | Wood Rings · Craft Cut · Workshop line art · Product photography · Iconography |
| **07 Surface classes** | Operational UI language · Marketing UI language · Catalog UI language · Admin shell chrome |
| **08 Principles** | Responsive principles · Text contrast · Status contrast & operational rules · GoodWoodPrint vs not |
| **Components** | One dense showcase card per component directory |

### `ui_kits/`

**`seller-app/`** — screen recreations of the Seller Fulfillment App, composed from the compiled components with contracts read from the real codebase (see the kit's README for per-screen sources and the full written contract per screen):
- `SellerDashboard.html` — the `customer`-role overview: Balance / Total Orders / Total Quantity per period (Today · This Week · This Month · This Year), Order Summary by status, Recent Transactions (6, no pagination — per the source). Interactive period switch, custom date-range filter.
- `SellerOrders.html` — the seller's order workbench: 3 tabs, 3 densities, in-place row expansion, URL-held filters/sort/density/deep-links, bulk actions, virtual scroll.
- `SellerCatalog.html` — the real `/product-catalog` route (renamed from `SellerProducts.html`, which had read the admin-only `/products` route by mistake — customer has no access to it). Filter chips generated from real `configs.specifications`, pricing from real `configs.pricing`, hover cost breakdown.
- `SellerProductDetail.html` — **kit-original, no source route.** The order-configuration bench a 560px drawer can't fit.
- `SellerWallet.html` — balance + transaction history from the dashboard's own report payload; leads with "orders left," not just a balance figure.
- `SellerTickets.html` — the real `/tickets` route (renamed from `SellerSupport.html`, which was speculative — the route is now confirmed customer-accessible). Status tabs, priority auto-assigned from reason, thread drawer.
- `SellerCharts.html` — **kit-original, not a routed screen.** The five economics charts buildable from existing Wallet/Catalog fields today, plus the six that need new backend fields (listed on the page).
- `SellerProfile.html` — the real `/profile` route: profile card, three info cards (DOMAIN-BOUND, card bodies not yet read), transaction history.
- `SellerApiKeys.html` — the real `/api-keys` route: API key / access token / base URL, masked with reveal + copy.
- `SellerTtsShops.html` — the real `/tts-shops` route (customer-only): connected TikTok Shops, connect-link flow.
- `SellerTtsOrders.html` — the real `/tts-orders` route (customer-only): incoming TikTok Shop orders, Import-to-GWP-order action.

Nav is the real 5-item `SellerTopNav.jsx` structure (Tổng quan · Đơn hàng · Tickets · Catalog · Tích hợp▾), read from source — not the earlier 6-item guess. Still to build: the true `TICKET_REASON` enum. (The marketing site, buyer-facing catalog, internal warehouse workstations and system/auth screens now exist — see below; this kit's seller Catalog remains the seller's own view of `/product-catalog`.)

**`admin-app/`** — the internal surface. It shares every token and component with the seller app but wears a different shell, on purpose. **Its ground is white** (the seller app keeps the cream shell floating on sky) and each screen gets **one** sky element rather than a blue field:
- `AdminDashboard.html` — the overview, and the reference for the direction: white `TopNav surface="white"`, white page, one large sky hero surface carrying the system's only brand gradient, numbers-first KPI cards (white, `--shadow-sm`, no border, a pale icon blob, the number in navy display and a sparkline in the tile's own ink — never four identical blue tiles), a cream Needs-attention list as the page's warm note, and a bottom row where the chart is a card and the order list is not. Radii 24 hero / 18 card / 10 control.
- `AdminOrders.html` · `AdminProducts.html` — the same white `TopNav variant="bar" surface="white"` as the dashboard (brand, nav pills, ⌘K search, bell, `NavUser`), a 32px display page title, 40px controls, and a frameless `DataTable` (`surface="field"`, sticky white header pinned at `--nav-height`). Orders carries the list screens' one sky element: a `--sky-50` summary band under the title whose last figure is the critical note.
- `AdminFulfillmentOps.html` — the scan-driven Kiểm tra đơn / QC đóng gói workstation, on the same white ground; it uses `AdminBar` rather than the nav-pill `TopNav` because it's a focused workstation you enter and exit (see its `Thoát` button), not a browsing surface — same 64px white + hairline chrome either way. `AdminShell-Sidebar.html` keeps the `Sidebar` rail component on display for a future deep-IA screen; no current admin screen is built on it.

**One shell across the admin app: `TopNav`, not a rail.** Dashboard, Orders and
Products all wear the identical white `TopNav`. `Sidebar` stays in the
component library — documented and available the day an admin IA grows past
what a top bar can hold — but is not the current pattern; don't mix it into a
new admin screen without a reason to depart from the bar.

**Colour on admin, with blue still dominant.** Blue anchors every screen (nav mark, hero, the big chart, mono IDs, the primary CTA); the other hues appear as **doses in the tokens that already own them** — the KPI wash rhythm on icon blobs and sparklines, `--cream-100` for a warm list surface, status tones for counts and badges. No new hue was added to the palette to break the blue monotony, and none should be.

**`marketing/`** — the prospective-seller site: `Landing.html`, `HowItWorks.html`, and the buyer-facing `BuyerCatalog.html` / `BuyerProductDetail.html`. Cream shell floating on sky, cream marketing heroes, product-photography slots.

**`warehouse-app/`** — the internal production / QC workstations (`FulfillmentScan`, `ProductionPipeline`, `QuickScan`, `WarehouseFulfillment*`): dense, scan-driven surfaces on the white admin ground with `AdminBar` chrome and 48px dense tables.

**`system/`** — cross-surface chrome: `SystemAuth`, `SystemAuthClassic`, `SystemErrors`, `SystemLoader`.

> The kit now spans ~60 screens across `seller-app/`, `admin-app/`, `marketing/`, `warehouse-app/` and `system/`. `ui_kits/screen-manifest.json` is the authoritative screen index and `ui_kits/FlowMap.html` maps how they connect.

### `templates/`

Starting points a consuming project copies or follows — each a Design Component (`.dc.html`) composed from the compiled components, loading the system through a sibling `ds-base.js` (edit its one `base` line to repoint at the bound `_ds/` tree). They surface as the **Templates** group in the picker; they are not compiled into the bundle or the card grid.

| Template | Entry | What it starts |
|---|---|---|
| **Seller Dashboard** | `templates/seller-dashboard/SellerDashboard.dc.html` | Floating cream nav on sky, cream page hero, cool-led KPI wash row, transactions table, order-status breakdown |
| **Admin List Screen** | `templates/admin-list/AdminList.dc.html` | White `TopNav` bar, display page title, sky summary band, filter shell with CTA, frameless data table |
| **Marketing Landing** | `templates/marketing-landing/MarketingLanding.dc.html` | Cream headline stack with a white accent line, product-photography slot, value-proposition feature grid |
| **Catalog Grid** | `templates/catalog-grid/CatalogGrid.dc.html` | Compact branded hero with search, filter/sort shell, product-card grid in cool wells |

---

## 7 · Accessibility floor

Functional operational text is `navy-700` or `navy-900`. Navy on Bright Sky is 7.8:1 (AAA) and is the normal functional pairing. Navy on cream is 11.5:1. Action Blue on white and white on Action Blue are both 4.6:1 (AA) — fine for 14px+ and buttons.

**Cream display type on Bright Sky measures 1.4:1 and does not meet WCAG**, even against the 3:1 large-text threshold. It is nevertheless the approved brand direction for hero and large brand typography, so it is a **declared exception, scoped to display type only** — never labels, controls, body copy, data, or anything a user must read to operate the product. Page identity is always available in accessible form elsewhere: the active nav pill (navy on cream, 11.5:1) and the document title.

Where a hero must carry cream type **and** conform at display size, use `PageHero tone="deep"` — sky-600 lifts cream to 3.65:1, which passes AA for large text. **This is an open decision: see `guidelines/ALIGNMENT_AUDIT.md`.**

**`--surface-hero-deep` is display-type-only.** At mid-luminance nothing in the palette clears 4.5:1 on it — navy-900 tops out at 4.10, white 3.73, cream 3.65. So it may carry a large display figure and nothing else: labels, body copy, money and controls must sit on a **nested light chip** (`--surface-data` or `--cream-100`) inside the block. `PageHero tone="deep"` enforces this by moving its own eyebrow and subtitle onto chips. Never reduce small text on it with `opacity` — the blend drops the pair further, not less.

Action Blue on sky is 3.1:1 — it fails for small text but clears the 3:1 bar for large type and graphical objects, so accent *words* belong on cream or pale sky while an icon or rule may sit on sky.

**The text ink floor.** On any light ground — cream, white, pale sky — **text is never lighter than `navy-500`.** Measured on cream-100 / white: navy-500 = 5.3 / 5.5 ✓, navy-400 = 3.3 / 3.4 ✗, navy-300 = 2.2 / 2.2 ✗. So `--navy-400` and `--navy-300` are **non-text tokens** — icons (which only need the 3:1 object threshold), borders, dots, empty stars, disabled states. They must never carry a label, caption, timestamp, count or table header. Use `--text-label` (= navy-500) for micro labels, `--text-muted` for secondary copy, and `--text-nontext` when you genuinely mean a glyph or rule.

**Never de-emphasise small text with `opacity`.** Alpha blends the ink into whatever is behind it and silently drops a verified pair below its measured ratio — a 4.8:1 badge label at `opacity:.72` lands at 2.9:1. Differentiate small text with size, weight and letter-spacing instead.

**Status labels are part of the contrast contract.** `StatusBadge` renders at 11–12px bold, which counts as small text (bold only qualifies as large at ≥18.66px), so every status `-fg` clears 4.5:1 against its own `-bg`. All seven pairs are verified and the measured ratios are noted inline in `tokens/colors.css`: success 4.8 · progress 5.0 · info 5.6 · pending 5.0 · attention 4.8 · critical 5.6 · neutral 6.6. `MetricCard`'s wash tiles consume the same values — never lighten a `-fg` or darken a `-bg` without re-checking the pair.

Status is colour **plus** a text label, always. Focus rings are never removed. `prefers-reduced-motion` disables every animation. Touch targets are ≥44px below 768px. Every `IconButton` requires a `label`.

---

## 8 · The two failure modes

**Generic SaaS drift.** Predominantly white pages · dark or vertical sidebar · dark hero · grey dense tables · card-in-card-in-card · a uniform grid of equal small modules from top to bottom · KPI-dashboard composition · heavy gradients, glassmorphism, neon, excessive shadows · Ant Design recoloured blue · ERP or fintech chrome · random blob decorations · 3D corporate illustration · emoji icons. If a screen would look at home in any other admin product, it is wrong.

**L!M imitation.** The L!M reference informed the palette's confidence — bright sky-blue conviction, warm cream contrast, large colour fields, expressive typography, playful cleanliness, photography/colour harmony. **Nothing else may be borrowed:** not the logo, wordmark construction, exclamation-mark device, donut imagery, mascot, illustration style, page composition or decorative arrangements. GWP's own recognisable language is Wood Rings, Craft Cut, workshop line art, the GWP monogram, and the navy operational voice. The result must read as GoodWoodPrint — not as L!M adapted to fulfillment.
