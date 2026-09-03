The admin-only nav rail. Build the `groups` array once per app section and reuse it across every admin screen so the menu can't drift between pages — see `ui_kits/admin-app/` for the real `menu.config.jsx`-derived structure.

```jsx
const GROUPS = [
  { heading:"Main Menu", items:[
    { label:"Dashboard", icon:<Ico n="LayoutDashboard" s={16} /> },
    { label:"Order Management", icon:<Ico n="Package" s={16} /> },
    { label:"Fulfillment Management", icon:<Ico n="Home" s={16} />, children:["Kiểm tra đơn","QC đóng gói"] },
  ]},
];
<Sidebar groups={GROUPS} active={active} onNavigate={setActive} brand={<GwpMark lockup="stacked" size="sm" />} footer={<NavUser name="Alex Tran" role="Admin" />} />
```

Rules: `icon` is a caller-supplied node (this component ships no icons of its own, same convention as `Button`/`MetricCard`). A group with `children` toggles open/closed on click instead of navigating — don't also give it a real route unless the real IA has one (`Fulfillment Management` itself has no page, only its children do). Keep `groups` as one static array per app area; don't rebuild it inline on every render.
