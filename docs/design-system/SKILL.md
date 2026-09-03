---
name: goodwoodprint-design
description: Use this skill to generate well-branded interfaces and assets for GoodWoodPrint (GWP) — the print-on-demand fulfillment platform for personalized products — either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping the Seller Fulfillment App, marketing pages, and Product Catalog.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## The four rules that matter most

1. **Sky IS the page, and cool leads.** Bright Sky `#ABDAEF` is the dominant open canvas (~70% cool); the default floating surface is the soft neutral `--surface-shell` #FBFCFA; White nests inside for data. Warm Cream `#FFFDF0` is brand warmth in doses (~30%) — logo on sky, nav shell, marketing moments, product wells — never the default operational fill. Never trap sky inside a card as a rectangular panel, never predominantly white, never beige or visibly yellow.
2. **Cross the sky/cream boundary at least once per screen, with a Craft Cut** — the organic router-cut curve, not a straight rule. Two cuts per screen maximum.
3. **Display ink follows the surface — never "display = navy".** On saturated sky the hero title is **cream** (accent line white); on cream and white it is navy; KPI numbers are navy. Navy carries eyebrows, subtitles, labels, data and controls. A navy headline on sky is the fastest way to look like a generic SaaS admin — GWP feels **light first, data second**.
4. **Ration the display face.** Baloo 2 for brand moments, page titles and KPI numbers only. Nunito Sans runs the UI. IBM Plex Mono for Order IDs, SKUs, tracking numbers and money.

Never invent order states, roles, or business logic — the real vocabulary is in README.md §1.

Building the real frontend from this system? Start with `CLAUDE_CODE_HANDOFF.md` — implementation order, resolved decisions, and the per-screen definition of done.
