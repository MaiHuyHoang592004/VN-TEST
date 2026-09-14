type AddressFields = { name: string | null; line1: string | null; city: string | null; postalCode: string | null; countryCode: string | null };

/** Syntactic completeness only; this does not verify carrier deliverability. */
export function validateAddressCompleteness(address: AddressFields) {
  const validationErrors: Record<string, string> = {};
  for (const field of ["name", "line1", "city", "postalCode", "countryCode"] as const) {
    if (!address[field]?.trim()) validationErrors[field] = "REQUIRED";
  }
  if (address.countryCode?.trim() && !/^[A-Z]{2}$/.test(address.countryCode)) validationErrors.countryCode = "INVALID_COUNTRY_CODE";
  return { validationStatus: Object.keys(validationErrors).length ? "INVALID" as const : "VALID" as const, validationErrors };
}
