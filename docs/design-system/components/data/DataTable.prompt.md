The operational table — Orders, Products, Inventory, Transactions all use this.

```jsx
<DataTable
  columns={[
    { key:"order_id", header:"Order ID", mono:true, width:110 },
    { key:"customer", header:"Customer", strong:true },
    { key:"product",  header:"Product / SKU", render:r => <ProductCell name={r.product} code={r.sku} /> },
    { key:"qty",      header:"Qty", align:"right", width:60 },
    { key:"status",   header:"Production Status", render:r => <StatusBadge status={r.status} /> },
    { key:"total",    header:"Total", align:"right", mono:true },
    { key:"date",     header:"Date", muted:true },
  ]}
  rows={orders}
  footer={<Pagination page={1} pageCount={25} pageSize={10} />}
/>
```

Rules: put it inside a white `<Surface level="data">`. Never add vertical borders or a grey header fill. IDs and money are mono. Status is always a StatusBadge, never coloured text. Row actions are ghost IconButtons in the last column.
