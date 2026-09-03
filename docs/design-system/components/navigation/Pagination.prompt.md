Pagination for every paged table.

```jsx
<Pagination page={1} pageCount={25} onPageChange={setPage} pageSize={10} onPageSizeChange={setSize} />
```

Rules: current page is an Action Blue filled square, never a circle. Lives inside the white data surface. Page numbers left, "Show N" right.
