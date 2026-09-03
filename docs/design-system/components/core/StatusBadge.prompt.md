Status pill for every fulfilment, tracking, stock and ticket state — pass the real backend status string and it colours itself.

```jsx
<StatusBadge status="In Production" />
<StatusBadge status="Fulfilled" />
<StatusBadge status="Design problems" />
<StatusBadge status="Validating" pulse />
<StatusBadge status="Low Stock" size="sm" />
```

Rules: never invent a status label — the vocabulary is fixed by the backend (`Pending, Validating, Mockup Generating, Production Ready, In Production, Produced, Filled, Fulfilled, Completed, Cancel, Refund, Return, Wrong Label, Design problems, Asset processing failed`; tickets are `open / in_progress / closed`). Colour is never the only signal — the label always reads.
