Cropped concentric tree-ring watermark — use it to make a plain colour field feel like GoodWoodPrint, in hero corners, empty states, brand blocks and loaders.

```jsx
<div style={{position:"relative",overflow:"hidden",background:"var(--surface-canvas)"}}>
  <WoodRings size={620} tone="cream" strength="medium" anchor="top-right" offset="-22%" />
  <h1>Good wood. Great products.</h1>
</div>
```

Rules: one ring cluster per composition. `tone="cream"` on sky, `tone="navy"` on cream/white. Never behind a table, list or form — it competes with data. `anchor="center"` is only for empty states and loaders.
