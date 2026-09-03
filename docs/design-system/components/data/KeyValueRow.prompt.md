The label/value line for anything read-only inside a drawer — a transaction detail, an order field, a price breakdown. Stack them with `var(--space-1)` or `var(--space-2)` gap; no border needed between rows, the surface change per row is enough.

```jsx
<KeyValueRow label="Loại" value={txn.type} />
<KeyValueRow label="Số tiền" value={txn.amount} mono />
<KeyValueRow label="Trạng thái" value={<StatusBadge status={txn.status} size="sm" />} tone="success" />
```

Rules: `mono` for anything machine-owned (amounts, IDs, tracking numbers) — matches the system-wide mono rule. `tone` tints the value ink only, for a quick positive/negative read; leave it unset for neutral fields.
