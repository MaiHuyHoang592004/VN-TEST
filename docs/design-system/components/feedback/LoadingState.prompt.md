Loading placeholders — skeletons that match the shape of the content that is coming.

```jsx
<LoadingState variant="rows" rows={5} />
<LoadingState variant="cards" rows={8} />
<LoadingState variant="brand" label="Generating mockups…" />
```

Rules: skeletons are pale sky, never grey — a grey skeleton instantly reads as generic SaaS. Match the skeleton's shape and count to the real content. `brand` only for waits over ~2s that occupy a whole surface.
