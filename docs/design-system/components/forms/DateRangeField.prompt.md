The custom date-range filter chip. Renders as a FilterChip; clicking it opens a From/To popover that escapes any clipped ancestor (see `Popover`).

```jsx
const [range, setRange] = React.useState(null);
<DateRangeField value={range} onChange={setRange}
  placeholder="Khoảng ngày" fromLabel="Từ" toLabel="Đến" applyLabel="Áp dụng" cancelLabel="Huỷ"
  formatValue={(f,t)=>`${short(f)}–${short(t)}`} />
```

Rules: pass `formatValue` to render the applied range in the screen's own date style (Vietnamese short dates, ISO, whatever the screen already uses elsewhere) — the component itself is locale-agnostic. `onChange(null)` fires from the chip's own × when a range is applied; treat that the same as clearing any other filter. Don't reimplement the popover positioning — that was the actual bug this component fixes.
