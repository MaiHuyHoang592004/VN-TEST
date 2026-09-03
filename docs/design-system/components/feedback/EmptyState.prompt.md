Empty and zero-result state — pass it to `DataTable`'s `empty` prop or use it for a whole blank page region.

```jsx
<EmptyState title="No orders yet" art={<WorkshopArt />}
  action={<Button variant="primary" icon={<Plus size={16} />}>New Order</Button>}>
  Orders you create or import will show up here, with production and shipping status.
</EmptyState>
```

Rules: warm and specific copy, never "No data". One action. Wood Rings centred and soft. Workshop line art, not a spot illustration of an empty box.
