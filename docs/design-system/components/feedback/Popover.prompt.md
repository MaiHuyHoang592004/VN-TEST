The escape hatch for any dropdown/filter panel triggered from inside a PageHero, Surface, or EmptyState — all three clip overflow for their own decoration, which silently cuts off a plain `position:absolute` popover. Popover renders to a portal instead.

```jsx
const ref = React.useRef(null);
const [open, setOpen] = React.useState(false);
<span ref={ref}><Button size="sm" onClick={() => setOpen(v => !v)}>Cột</Button></span>
<Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} width={206}>
  <div style={{fontSize:"var(--fs-micro)",fontWeight:800,color:"var(--text-label)"}}>HIỆN CỘT</div>
  {/* checkboxes, rows, whatever the panel needs */}
</Popover>
```

Rules: build on this rather than hand-rolling another `position:absolute` panel — that is exactly the bug this component exists to stop recurring. `DateRangeField` is the pre-built date-range case; reach for bare `Popover` for anything else (column visibility, a small settings menu). Closes on an outside click and stays repositioned on scroll/resize while open.
