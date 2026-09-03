The GWP button — a soft borderless pill; pick the variant by importance, not by taste.

```jsx
<Button variant="primary" size="lg">Order Online</Button>
<Button variant="secondary" size="lg" iconAfter={<ArrowRight size={16} />}>View Menu</Button>
<Button variant="soft">Explore products</Button>
<Button variant="ghost" size="sm">Cancel</Button>
<Button variant="primary" shape="rounded" size="sm" icon={<Plus size={15} />}>New Order</Button>
```

**On dark grounds use `inverse`, never `ghost`.** `ghost`'s hover fill is pale sky, so a light-labelled ghost button disappears the moment you hover it. `inverse` is for navy-class grounds (cream ≈ 9.5:1). On `--surface-hero-deep` (sky-600) cream is only 3.65:1 — large-text only — so a button there must be `cream` (navy label, 11.5:1) or `secondary` (white pill, Action Blue label, 5.6:1).

```jsx
<Button variant="cream" size="sm">Nạp tiền</Button>        {/* on deep sky */}
<Button variant="secondary" size="sm">Xem ví</Button>       {/* on deep sky */}
<Button variant="inverse" size="sm">Xem tất cả</Button>     {/* on navy only */}
```

Rules: **pill is the default shape everywhere**; `rounded` only inside dense operational toolbars. Pills are borderless — fill plus one quiet shadow does the work. Exactly one `primary` per region. `secondary` is a white pill with an Action Blue label. `soft` is the pale-sky pill with navy ink — the quiet brand action (white text on soft sky fails contrast, so the ink is navy by design). `accent` (yellow) is a marketing-only, once-per-page move. Hover darkens, press scales to 0.98 — never change hue on press.
