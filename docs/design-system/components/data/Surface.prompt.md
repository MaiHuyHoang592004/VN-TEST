The panel primitive — use it instead of hand-rolling white boxes, so the sky → cream → white hierarchy stays intact.

```jsx
<Surface level="content" radius="surface">
  <Surface level="data" radius="card" title="Order Trend" action={<Select size="sm" options={["Last 7 days"]} />}>
    <Chart />
  </Surface>
</Surface>
```

Rules: sky holds cream, cream holds white, white holds data. Never nest a fourth level — a white card inside a white card inside a white card is the failure mode this component exists to prevent. `inset` is for input wells only.
