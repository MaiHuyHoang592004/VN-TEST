In-page tabs for sectioning a data surface.

```jsx
<TabBar
  tabs={[{label:"All Products",count:482},"Active SKUs","BOMs","Low Stock"]}
  active="All Products"
  right={<Button variant="primary" size="sm" icon={<Plus size={15} />}>New Product</Button>}
/>
```

Rules: active underline is Action Blue, 2.5px, pill-capped. Counts are mono. Never nest two underline tab rows — the second level becomes `variant="pill"`.
