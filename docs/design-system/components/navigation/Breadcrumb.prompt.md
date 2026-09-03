For a detail screen reached by drilling into a list, where a full `PageHero` would cost too much vertical space. The last trail item is the current page and renders as plain text, never a link.

```jsx
<Breadcrumb
  trail={[{label:"Sản phẩm", onClick:()=>history.back()}, {label:"Móc khoá tên"}]}
  onPrev={()=>go(-1)} onNext={()=>go(1)} nextDisabled={isLast} />
```

Rules: only for a screen that has a natural prev/next sibling order (a product list, a paginated set) — if there's nothing to step between, a plain trail with no `onPrev`/`onNext` is fine too. Never combine with `PageHero` on the same screen; pick one.
