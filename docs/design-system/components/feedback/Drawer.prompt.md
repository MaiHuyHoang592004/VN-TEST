Side panel — order detail, filter panels and edit forms.

```jsx
<Drawer open={open} onClose={close} title="Order #10429" subtitle="Wood Ornament · Shopify"
  footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary">Save changes</Button></>}>
  <Input label="Tracking number" mono />
</Drawer>
```

Rules: drawer body is CREAM, the footer is white — the surface hierarchy holds inside overlays too. Escape and scrim both close. Prefer a drawer over a centred modal for anything longer than two fields.
