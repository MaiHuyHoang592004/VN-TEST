# Mangled-source report — `niyamvora/opcreative-team` @ 2026-07-24

Found while establishing a build baseline for the GWP design-system migration.
All three local zips (`opcreative-team-main{,(1),(2)}.zip`) are byte-identical
(md5 `dd172066a88c4f9e1282840ffa3e0787`), so the damage is committed upstream.

`npx turbo run build --filter=@gwprint/dashboard` fails on the pristine tree.
`npx turbo run lint` passes (0 errors), which is why this was invisible until a build.

## Cause

A global search-and-replace was applied to import paths, identifiers and Tailwind
class names, but NOT to filenames. Three word pairs were swapped:

- `row` → `column`
- `product` ↔ `variant`
- `warehouse` ↔ `customer`

Exports kept their correct names, so every broken import has exactly one resolution.

## 1. Unresolvable imports (build-breaking)

```
app/(protected)/admin/boms/page.tsx:5:import { listSkuOptions } from "@/modules/catalog/variant-variants/queries";
app/(protected)/admin/products/[id]/variants/page.tsx:10:} from "@/modules/catalog/variant-variants/queries";
app/(protected)/catalog/page.tsx:2:import { listSkusWithMyPrice } from "@/modules/catalog/variant-variants/queries";
components/pages/admin/products/delete-product-dialog.tsx:15:import type { ProductRow } from "./variant-dialog";
components/pages/admin/products/products-table.tsx:35:import { ProductDialog, type ProductRow } from "./variant-dialog";
components/pages/admin/products/products-table.tsx:36:import { DeleteProductDialog } from "./delete-variant-dialog";
components/pages/admin/products/skus/attach-variants-dialog.tsx:10:import { attachVariantsAction } from "@/modules/catalog/variant-variants/actions";
components/pages/admin/products/skus/bulk-prices-dialog.tsx:9:import { bulkSetPricesAction } from "@/modules/catalog/variant-variants/actions";
components/pages/admin/products/skus/sku-grid.tsx:29:} from "@/modules/catalog/variant-variants/actions";
components/pages/admin/variants/delete-variant-dialog.tsx:15:import type { VariantRow } from "./product-dialog";
components/pages/admin/variants/variants-table.tsx:34:import { VariantDialog, type VariantRow } from "./product-dialog";
components/pages/admin/variants/variants-table.tsx:35:import { DeleteVariantDialog } from "./delete-product-dialog";
components/pages/admin/warehouses/delete-warehouse-dialog.tsx:15:import type { WarehouseRow } from "./customer-dialog";
components/pages/admin/warehouses/warehouse-members-dialog.tsx:25:import type { WarehouseRow } from "./customer-dialog";
components/pages/admin/warehouses/warehouses-table.tsx:19:import { WarehouseDialog, type WarehouseRow } from "./customer-dialog";
components/pages/admin/warehouses/warehouses-table.tsx:20:import { DeleteWarehouseDialog } from "./delete-customer-dialog";
components/pages/admin/warehouses/warehouses-table.tsx:21:import { WarehouseMembersDialog } from "./customer-members-dialog";
components/pages/home/home.tsx:9:import { WarehouseHome } from "./customer-home";
components/pages/orders/import-dialog.tsx:11:import { resolveSkusAction } from "@/modules/catalog/variant-variants/actions";
components/pages/orders/order-dialog.tsx:18:import { listSkuOptionsAction } from "@/modules/catalog/variant-variants/actions";
```

Files that DO exist on disk: `warehouse-dialog.tsx`, `delete-warehouse-dialog.tsx`,
`warehouse-members-dialog.tsx`, `product-dialog.tsx`, `delete-product-dialog.tsx`,
`variant-dialog.tsx`, `delete-variant-dialog.tsx`, `warehouse-home.tsx`,
and `src/modules/catalog/product-variants/`.

## 2. Tailwind classes that compile to nothing (silent layout bugs)

```
components/global/data-table/data-table-pagination.tsx:45:    <div className="flex flex-col gap-3 sm:flex-column sm:items-center sm:justify-between">
components/global/data-table/data-table-toolbar.tsx:62:    <div className="flex flex-col gap-3 sm:flex-column sm:items-center sm:justify-between">
components/global/layout/footer/footer.tsx:50:        <div className="flex flex-col gap-10 md:flex-column md:justify-between">
components/pages/admin/boms/bom-dialog.tsx:194:      <div className="flex flex-col gap-4 lg:flex-column">
components/pages/auth/login-screen.tsx:163:      <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-14 lg:flex-column lg:items-center lg:justify-between lg:gap-20">
components/pages/catalog/catalog-browser.tsx:54:      <div className="mb-6 flex flex-col gap-2 sm:flex-column sm:items-center sm:justify-between">
components/pages/catalog/catalog-browser.tsx:143:            <div key={p.id} className="flex flex-col gap-3 p-4 sm:flex-column sm:items-center">
components/pages/orders/order-qr.tsx:341:      <div className="flex flex-col-reverse gap-2 sm:flex-column sm:justify-end">
components/pages/profile/settings-card.tsx:64:        <CardFooter className="border-border bg-muted/50 flex flex-col gap-3 rounded-b-xl border-t px-6 py-3 sm:flex-column sm:items-center sm:justify-between">
components/pages/support/ticket-thread.tsx:98:      <div className="flex flex-col gap-6 lg:flex-column lg:items-start">
components/ui/alert-dialog.tsx:88:        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-column sm:justify-end",
components/ui/alert-dialog.tsx:104:        "mb-2 inline-flex size-10 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:column-span-2 *:[svg:not([class*='size-'])]:size-6",
components/ui/alert.tsx:7:  "group/alert relative grid w-full gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:column-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
components/ui/calendar.tsx:49:          "relative flex flex-col gap-4 md:flex-column",
components/ui/card.tsx:64:        "col-start-2 column-span-2 column-start-1 self-start justify-self-end",
components/ui/dialog.tsx:105:        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-column sm:justify-end",
components/ui/drawer.tsx:139:            "data-[swipe-axis=x]:inset-y-0 data-[swipe-axis=x]:flex-column",
components/ui/field.tsx:61:          "flex-column items-center has-[>[data-slot=field-content]]:items-start *:data-[slot=field-label]:flex-auto has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
components/ui/field.tsx:63:          "flex-col *:w-full @md/field-group:flex-column @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:*:data-[slot=field-label]:flex-auto [&>.sr-only]:w-auto @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
components/ui/message.tsx:25:        "group/message relative flex w-full min-w-0 gap-2 text-sm data-[align=end]:flex-column-reverse",
components/ui/toggle-group.tsx:45:        "group/toggle-group flex w-fit flex-column items-center gap-[--spacing(var(--gap))] rounded-lg data-[size=sm]:rounded-[min(var(--radius-md),10px)] data-vertical:flex-col data-vertical:items-stretch",
```

Intended: `sm:flex-row`, `col-span-2`, `col-start-1`. The two data-table ones mean
the toolbar and pagination bars have been stacking vertically at every breakpoint.

## 3. Row/column identifier mangles (cosmetic, but misleading)

```
components/global/data-table/data-table.tsx:40:  cell: (column: T) => ReactNode;
components/global/data-table/data-table.tsx:55:  rowId: (column: T) => string;
components/global/data-table/data-table.tsx:75:  onRowClick?: (column: T) => void;
components/global/data-table/data-table.tsx:89:  mobileCard?: (column: T) => ReactNode;
components/global/data-table/data-table.tsx:160:            {rows.map((column) => {
components/global/data-table/data-table.tsx:290:              rows.map((column) => {
components/pages/fulfillment/quick-scan.tsx:233:            ...entry.rows.map((column) => (
components/pages/home/warehouse-home.tsx:85:          {rows.map((column) => (
components/pages/orders/status-summary.tsx:48:      {rows.map((column) => (
components/ui/table.tsx:58:      data-slot="table-column"
```

## 4. Field mappings that compile but render the WRONG data

In `app/(protected)/orders/page.tsx` — four swapped pairs. Both relations exist on
the order, so TypeScript is satisfied while the UI shows the wrong values:

```tsx
          customerName: o.warehouse?.name ?? o.warehouse?.email ?? null,
          warehouseCode: o.customer?.code ?? null,
          productName: o.variant?.name ?? null,
          variantName: o.product?.name ?? null,
```

The key names state the intent: `customerName` should read `o.customer`,
`warehouseCode` should read `o.warehouse`, `productName` should read `o.product`,
`variantName` should read `o.variant`.

## Why this class of damage matters most

Sections 1–3 are mechanical: they fail loudly or compile to nothing. Section 4 is
the dangerous one — it type-checks, renders, and looks plausible. A build cannot
find the rest of its kind, so the safest fix is a revert of the bad rename commit
upstream rather than a repair applied downstream.
