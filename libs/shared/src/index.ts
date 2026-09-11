/**
 * @fulfillflow/shared — the isomorphic layer.
 *
 * Pure types, constants and logic that BOTH the server and the browser need,
 * with ZERO dependencies. Nothing here may import from @fulfillflow/db or an
 * app: the arrow points shared ← db ← apps.
 *
 * The test: if adding an import here would break a browser bundle, it doesn't
 * belong in this package.
 *
 * The V1 role/permission model (USER_ROLES/SELLER/...) was removed in the
 * FulfillFlow M1 restructure — it modeled the old gwprint seller/warehouse
 * roles, which don't exist in the V2.1 schema (OrganizationRole, FacilityRole,
 * PlatformRole instead). The V2 access module (org/facility-role based,
 * exception-visibility whitelist per spec §2.2) is M2 work: this package
 * currently has no exports until that lands.
 */
export {};
