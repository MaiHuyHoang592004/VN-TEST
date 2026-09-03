The organic cut that separates two GWP colour fields — use it wherever sky meets cream instead of a straight edge.

```jsx
<section style={{background:"var(--surface-canvas)",padding:"var(--pad-hero)"}}>…hero…</section>
<CraftCut from="var(--surface-canvas)" to="var(--surface-content)" depth={96} sweep="right" />
<section style={{background:"var(--surface-content)"}}>…content…</section>
```

Rules: at most two cuts per screen; alternate `sweep` so they don't rhyme. Operational surfaces use shallow cuts (48–72px); marketing can go to 160px. Never stack a cut directly against a table header.
