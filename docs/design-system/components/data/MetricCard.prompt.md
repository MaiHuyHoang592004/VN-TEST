KPI figure — the quick-status strip above a table and the dashboard metric row.

```jsx
{/* canonical: semantic wash surfaces */}
<MetricCard label="All Orders"     value="1,248" />
<MetricCard label="Pending"        value="120" tone="pending" />
<MetricCard label="In Production"  value="315" tone="progress" />
<MetricCard label="Shipped"        value="865" tone="success" />
<MetricCard label="Delayed"        value="68"  tone="critical" />

{/* secondary, opt-in: white card with icon chip */}
<MetricCard variant="card" tone="action" icon={<Package size={19} />}
  label="Total Orders" value="1,248" delta="18.2%" deltaNote="vs last 7 days" />
```

Rules: **`wash` is the default and the canonical operational treatment** — pastel semantic surface, no border, no shadow. `variant="card"` is the white bordered KPI card; it is secondary and reads as generic SaaS, so use it for at most one introductory row.

Tone follows meaning, not variety — a row of five different tones is only correct when the five metrics genuinely mean five different things (as in the Orders status strip). 4–5 per row maximum, and only ONE metric row per screen. The value uses display type; the label does not.
