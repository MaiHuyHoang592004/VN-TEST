The primary navigation for every GWP surface — a rounded cream shell floating on the sky canvas.

```jsx
<TopNav
  items={["Dashboard","Orders","Products","Inventory","Tickets","Wallet","Analytics"]}
  active="Dashboard"
  brand={<GwpMark lockup="stacked" />}
  search={<SearchField placeholder="Search anything…" width={260} size="sm" />}
  actions={<IconButton label="Notifications" badge={1}><Bell size={18} /></IconButton>}
  cta={<Button variant="primary" size="sm" icon={<Plus size={15} />}>New Order</Button>}
  user={<NavUser name="Jane Cooper" role="Seller" />}
/>
```

Rules: cream shell, sky visible around it, `--radius-md` corners, `--shadow-sm`, 32px inner padding — never dark, never a vertical sidebar, never a full-bleed header with a bottom rule. Active item is a filled `--sky-200` pill with navy text; passive items are navy, not grey. **Action Blue appears only in `cta`.** 6–8 top-level items; deeper structure goes into the page's own tabs.

`variant="bar"` exists only for surfaces with no sky canvas behind the nav, and is explicitly the non-canonical fallback.

Operational page CTAs belong here, in `SearchShell.action`, or in `TabBar.right` — **never in `PageHero`.**

Role labels are domain-verified (`admin / customer / warehouse / warehouse_external / warehouse_admin / supporter / designer`) — do not invent new ones.
