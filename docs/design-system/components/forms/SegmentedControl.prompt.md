The density/view-mode switch — not a filter (use `FilterChip`), not page navigation (use `TabBar`). One option is always selected.

```jsx
<SegmentedControl size="sm" value={density} onChange={setDensity}
  options={[{value:"compact",label:"Gọn"},{value:"cozy",label:"Vừa"},{value:"full",label:"Đầy đủ"}]} />
<SegmentedControl value={view} onChange={setView} options={[{value:"grid",label:<Grid3x3 size={15}/>},{value:"table",label:<List size={15}/>}]} />
```

Rules: 2-4 options only — more than that wants a `Select`. Keep labels to a word or an icon; this sits inline in a toolbar next to search and filters, not as its own row.
