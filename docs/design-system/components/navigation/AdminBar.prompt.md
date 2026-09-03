The admin shell's chrome bar — the sibling of `TopNav` (seller) and the replacement for a hand-rolled `<header>` on any admin screen. Its default `surface="white"` **is** the AdminDashboard bar: 64px, opaque white, one hairline, constant height — so every admin screen, rail or no rail, wears one identical top bar. Use it on workstation screens you enter and exit (FulfillmentOps, LabelExtractor, scan stations); use `TopNav variant="bar" surface="white"` on the browsing screens (Dashboard, Orders, Products). It owns NO page CTA — actions live in the toolbar row or the table header.

```jsx
<AdminBar
  brand={<GwpMark lockup="horizontal" size="sm" />}
  title="Kiểm tra đơn"
  right={<>
    <CommandTrigger onClick={() => setPaletteOpen(true)} />
    <IconButton label="Notifications" icon={<Ico n="Bell" s={18} />} />
    <NavUser name="Alex Tran" role="Warehouse admin" />
  </>}
/>
<DataTable stickyHeader="var(--admin-bar-h, 64px)" ... />
```

Rules: pass `brand` only when there is no `Sidebar` to carry the mark — never show the logo twice. It publishes its live height as `--admin-bar-h` on `:root`; pin any sticky table header to that, not a hard-coded 64px. Keep `surface="white"` as the default across the admin app so the chrome never shifts between screens — reach for `surface="transparent"` (dissolve field, condenses to 52px on scroll) only on a screen deliberately built on the sky→white dissolve. Use `revealTitleOnScroll` when the page already carries its own 32px display title, so the bar's copy and the page title never shout at once. Right-hand chrome is quiet utility (search, ⌘K, bell, `NavUser`) — never a primary Action Blue button.
