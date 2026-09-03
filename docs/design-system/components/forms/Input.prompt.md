Labelled text field for every form in the system.

```jsx
<Input label="Recipient name" placeholder="Jane Cooper" />
<Input label="Tracking number" mono placeholder="9400 1118 9956 7890 1234 56" />
<Input label="Zipcode" error="Zipcode is required" />
```

Rules: labels sit above the field, 12px bold navy-500 — never inside as a placeholder. `mono` for machine-owned values. Focus is a blue border plus the 3px blue ring; never remove the ring.
