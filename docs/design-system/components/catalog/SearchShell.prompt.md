The control bar above a product grid or data table.

```jsx
<SearchShell
  left={<><SearchField placeholder="Search products…" width={280} size="sm" /><FilterChip selected>All</FilterChip></>}
  sort={<Select size="sm" options={["Best Selling","Newest","Price: Low to High"]} />}
  resultCount="Showing 1–12 of 482 products"
  view={view} onViewChange={setView}
/>
```

Rules: one shell per list. Result count is plain muted body copy, never a badge. The view toggle only appears where both views genuinely exist.

This is also where an **operational page CTA** goes, since `PageHero` owns no actions:

```jsx
<SearchShell
  left={<><SearchField placeholder="Search orders, customers…" width={280} size="sm" />
          <Select size="sm" options={["All Statuses","Pending","In Production"]} /></>}
  action={<Button variant="primary" size="sm" icon={<Plus size={15} />}>New Order</Button>}
/>
```
