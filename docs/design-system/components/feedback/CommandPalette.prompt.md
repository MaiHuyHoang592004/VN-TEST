⌘K navigation for the admin IA of ~30 routes, where neither a horizontal bar nor a 13-group rail can show the whole map. It owns its own hotkey (⌘K / Ctrl-K toggles), so the screen holds only the `open` flag. Always pair it with `CommandTrigger` in `AdminBar.right` — the visible affordance — because a palette nobody knows about is not navigation.

```jsx
const [open, setOpen] = React.useState(false);
const ITEMS = [
  { group:"Go to", label:"Orders", icon:<Ico n="Package" s={16} />, hint:"/orders" },
  { group:"Go to", label:"Products", icon:<Ico n="Boxes" s={16} />, hint:"/products" },
  { group:"Actions", label:"Add order", icon:<Ico n="Plus" s={16} />, hint:"⌘N" },
];
<CommandTrigger onClick={() => setOpen(true)} />
<CommandPalette open={open} onOpenChange={setOpen} items={ITEMS} onSelect={i => navigate(i.hint)} />
```

Rules: keep same-group items adjacent — items render in array order and `group` only draws a heading when the group changes. Selection is a sky FILL, never an underline. **DOMAIN-BOUND:** searching real records (orders, SKUs, sellers) needs a real search endpoint — pass route/action items only until one exists, and never fake result rows. `hint` is mono (a shortcut, a count, a route). Mount one palette per admin screen; don't disable `hotkey` unless another handler already owns ⌘K.
