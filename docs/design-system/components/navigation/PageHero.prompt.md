The operational page header — every Dashboard/Orders/Products/Wallet screen opens with one.

```jsx
<PageHero
  meta="ORDERS"
  title="Orders"
  subtitle="Track every order from checkout to delivery"
  art={<WorkshopArt />}
/>
```

**Colour rule — display ink follows the surface.** On the saturated sky field the title renders CREAM, so the page reads light and brand-forward. The eyebrow and subtitle stay navy because they are functional text. On `tone="soft"` (pale sky) or `tone="cream"` the title is navy. **A navy display title on saturated sky is the generic-SaaS look this rule exists to prevent.**

**It takes no actions.** Operational CTAs go in `TopNav.cta`, `SearchShell.action` or `TabBar.right`:

```jsx
<TopNav … cta={<Button variant="primary" size="sm" icon={<Plus size={15} />}>New Order</Button>} />
<PageHero title="Orders" subtitle="Track every order from checkout to delivery" />
<SearchShell left={…} action={<Button variant="primary" size="sm">New Order</Button>} />
```

Rules: one hero per screen. Line art on the right in operational contexts — save product photography for marketing and catalog. Keep `size="md"`; `lg` is for module landing pages only. `tone="deep"` uses sky-600 where the cream title must meet WCAG large-text contrast.
