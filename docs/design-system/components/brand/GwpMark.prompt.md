The GWP lockup — use it in nav bars, footers, empty states and loaders instead of typing the brand name by hand.

```jsx
{/* on cream / white / the floating nav shell — the default */}
<GwpMark lockup="stacked" size="md" />

{/* on a bright sky field */}
<GwpMark lockup="inline" tone="cream" />

{/* small or inside dense data — one step deeper, still sky family */}
<GwpMark lockup="monogram" size="sm" tone="sky-strong" />
```

**The logo is brand light, not information ink.** Light sky on cream, white and the nav shell; cream on bright sky. **Navy is no longer the default** — it reads heavy and corporate and pulls the brand toward SaaS/admin. Reserve `tone="navy"` for favicons, watermarks, technical stamps, and the rare data zone that needs very high contrast.

Ratios on cream: sky-500 2.5:1, sky-600 3.7:1. Logotypes are exempt from WCAG 1.4.3, so `sky` is the default for its lightness — step to `sky-strong` when the mark gets small.

The monogram is a signature, not a decoration — one per screen at most, and it belongs on props (boxes, mugs, aprons, devices) inside illustration rather than sprinkled through the UI. `variant="image"` needs the PNG copied next to the page.
