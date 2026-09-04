import { listWarehouses } from "@/modules/inventory/warehouses/queries";
import { WarehousesTable } from "@/components/pages/admin/warehouses/warehouses-table";
import { AdminPageHeader } from "@/components/pages/admin/admin-header";
import { Page } from "@/components/ds";

export default async function AdminWarehousesPage() {
  // Inactive sites are included: this is the screen where you'd reactivate one.
  const rows = await listWarehouses({ includeInactive: true });

  return (
    <Page>
      <AdminPageHeader />
      <WarehousesTable
        rows={rows.map((w) => ({
          id: w.id,
          code: w.code,
          name: w.name,
          description: w.description,
          region: w.region,
          line1: w.line1,
          line2: w.line2,
          city: w.city,
          state: w.state,
          zip: w.zip,
          country: w.country,
          timezone: w.timezone,
          status: w.status,
          contactName: w.contactName,
          contactEmail: w.contactEmail,
          contactPhone: w.contactPhone,
          members: w._count.members,
          orders: w._count.orders,
        }))}
      />
    </Page>
  );
}
