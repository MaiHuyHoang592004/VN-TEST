/** Derived only from a verified ID token + the Store row it resolves to — never from request body/query. */
export type TenantContext = {
  organizationId: string;
  storeId: string;
  userId: string;
  shopDomain: string;
};
