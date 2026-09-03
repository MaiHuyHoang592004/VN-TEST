Every chart in Reports & Analytics states its question and its real source fields before it states an answer — a chart with no "grounded in" strip is just a pretty shape nobody can verify.

```jsx
<ChartFrame title="Số dư ví theo ngày" ask="Ví có cạn trước khi kỳ này kết thúc không?"
  fields={["balance","transactions[].date","transactions[].amount","transactions[].status"]}
  derived="nhịp đốt tính từ chi vận hành, không phải dòng tiền ròng"
  tools={<FilterChip selected={proj} onClick={()=>setProj(v=>!v)}>Dự phóng</FilterChip>}
  foot="Payout loại ra: rút tiền là quyết định, không phải chi phí.">
  <svg>{/* the actual chart */}</svg>
</ChartFrame>
```

Rules: `fields` are real field names, never invented ones — if a chart needs a field the backend doesn't expose, that is a reason to skip the chart and say so in `foot`/`ask`, not to list the field anyway. Draw the chart itself with plain SVG/canvas inside `children`; this component only owns the frame.
