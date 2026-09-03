Dropdown for forms and for the filter toolbar above tables.

```jsx
<Select label="Shipping type" options={["Standard","Expedited","Priority"]} />
<Select size="sm" options={["All Statuses","Pending","In Production","Fulfilled"]} />
<Select size="sm" icon={<Calendar size={15} />} options={["Last 7 days","Last 30 days"]} />
```

Rules: toolbar selects are `size="sm"` with no label — the first option states the dimension ("All Statuses"). Status option lists must use the real GWP status vocabulary.
