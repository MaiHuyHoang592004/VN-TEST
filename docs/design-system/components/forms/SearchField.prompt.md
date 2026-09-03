Search input — the nav variant, the table-toolbar variant and the catalog hero variant are all this component.

```jsx
<SearchField placeholder="Search anything…" width={280} />
<SearchField placeholder="Search orders, customers…" width={320} size="sm" />
<SearchField placeholder="Search products…" shape="pill" size="lg" width="100%" />
```

Rules: the magnifier is on the left in operational contexts. The catalog hero search is always `pill` `lg` and full-width inside its container. Placeholder copy names what is searchable, never just "Search".
