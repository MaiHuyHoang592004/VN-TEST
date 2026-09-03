Share-of-total bar for status breakdowns — the little progress track beside a count.

```jsx
const total = rows.reduce((a, r) => a + r.orders, 0);
<ShareBar value={row.orders} total={total} label={`${row.status}: share of all orders`} />
```

Rules: `total` is the **sum of all rows**, never the largest row — share-of-largest is a different quantity that looks deceptively similar. The track is deliberately `--navy-400`: paler neutrals disappear on a white surface and the bar stops communicating a scale. A non-zero share always shows at least 2px.
