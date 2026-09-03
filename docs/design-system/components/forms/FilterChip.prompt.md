Pill filter toggle — use for catalog category rows and quick-status filters.

```jsx
<div style={{display:"flex",gap:"var(--space-2)",flexWrap:"wrap"}}>
  <FilterChip selected count={482}>All Products</FilterChip>
  <FilterChip count={128}>Ornaments</FilterChip>
  <FilterChip count={96}>Mugs</FilterChip>
</div>
```

Rules: exactly one chip selected in a single-select row, and it is Action Blue filled. Lay chips out with flex + gap, never inline whitespace. Counts are mono.
