Shimmer placeholder for content whose shape is already known — table rows, KPI figures, a drawer's key/value list — so the layout doesn't jump when data lands. Use `LoadingState`'s centred spinner instead for a whole empty region whose shape you can't predict yet.

```jsx
// A loading table row
<tr><td><Skeleton w={140} h={16} /></td><td><Skeleton w={80} h={16} /></td></tr>

// A loading KPI figure
<Skeleton w="60%" h={12} />        {/* label */}
<Skeleton w="40%" h={28} />        {/* value */}

// A stacked block (last line auto-shortens to 62%)
<Skeleton lines={3} h={12} gap={8} />
```

Rules: match the skeleton's size to the real content it stands in for — a 12px bar for a label line, 16–20px for a value, 56px for a table row — so nothing reflows when data arrives. Never shimmer for longer than ~2s of real work; past that, say what is slow instead. It rides the system's own `gwp-shimmer` keyframe, so `prefers-reduced-motion` stills it automatically — don't add a competing animation. Don't use it as a decorative divider or spacer; a Skeleton always means "content is loading here."
