import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAddressCompleteness } from "./address-completeness.validator.js";

const complete = { name: "Ada", line1: "12 Street", city: "Austin", postalCode: "78701", countryCode: "US" };
test("complete address is VALID; missing fields and malformed country produce field errors", () => {
  assert.deepEqual(validateAddressCompleteness(complete), { validationStatus: "VALID", validationErrors: {} });
  for (const key of ["name", "line1", "city", "postalCode", "countryCode"]) {
    const result = validateAddressCompleteness({ ...complete, [key]: null });
    assert.equal(result.validationStatus, "INVALID");
    assert.equal(result.validationErrors[key], "REQUIRED");
  }
  assert.equal(validateAddressCompleteness({ ...complete, countryCode: "USA" }).validationErrors.countryCode, "INVALID_COUNTRY_CODE");
  assert.equal(validateAddressCompleteness({ ...complete, name: "  " }).validationStatus, "INVALID");
});
