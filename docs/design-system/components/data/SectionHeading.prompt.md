A section title outside of `Surface` — use `Surface`'s own `title`/`subtitle`/`action` props when the section IS a surface; reach for `SectionHeading` when it sits loose inside one (a sub-section of a drawer, a block of a detail page).

```jsx
<SectionHeading title="Bảng giá theo bậc" note="4 biến thể × 4 bậc" />
<SectionHeading title="Khách phải cung cấp" right={<Button variant="ghost" size="sm">Sao chép liên kết</Button>} />
```

Rules: one per block, never nested. `note` is a short clause, not a sentence — put longer explanation in a `Callout` underneath instead.
