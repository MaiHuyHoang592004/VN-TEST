import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import { fieldRules, ruleHint, validateValue } from "./field-rules.ts";

/** The real helper from modules/fulfillment/orders/schema.ts — the shape that
 * produces `anyOf`, which is most of what this file exists to flatten. */
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

test("reads required-ness, kind and length off a plain string field", () => {
  const rules = fieldRules(
    z.object({ externalId: z.string().trim().min(1).max(120) }),
  );
  assert.deepEqual(rules.externalId, {
    required: true,
    kind: "text",
    minLength: 1,
    maxLength: 120,
  });
});

test("flattens `.optional().or(z.literal(\"\"))` to its real branch", () => {
  // Without flattening this arrives as anyOf[{string,maxLength}, {const:""}]
  // and every optional text field in the app would carry no rule at all.
  const rules = fieldRules(z.object({ marketplace: optionalText(64) }));
  assert.deepEqual(rules.marketplace, {
    required: false,
    kind: "text",
    maxLength: 64,
  });
});

test("recognises email and url formats through the anyOf wrapper", () => {
  const rules = fieldRules(
    z.object({
      shippingEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
      imageUrl: z.string().trim().url().max(1000).optional().or(z.literal("")),
    }),
  );
  assert.equal(rules.shippingEmail?.kind, "email");
  // zod emits format "uri", not "url".
  assert.equal(rules.imageUrl?.kind, "url");
});

test("keeps a genuine numeric range", () => {
  const rules = fieldRules(
    z.object({ quantity: z.number().int().min(1).max(10_000) }),
  );
  assert.deepEqual(rules.quantity, {
    required: true,
    kind: "integer",
    min: 1,
    max: 10_000,
  });
});

test("drops the MAX_SAFE_INTEGER bound that .positive() invents", () => {
  // .positive() emits {exclusiveMinimum: 0, maximum: 9007199254740991}.
  // Reading that verbatim would render "From 1 to 9007199254740991".
  const rules = fieldRules(
    z.object({ productVariantId: z.number().int().positive() }),
  );
  assert.equal(rules.productVariantId?.max, undefined);
  assert.equal(rules.productVariantId?.min, 1, "exclusive 0 means 1 and up");
});

test("yields no rule for fields it cannot describe", () => {
  // Dates come back with no `type` at all, so there is nothing honest to say
  // about them. Booleans and enums are picked from a control, never mistyped.
  const rules = fieldRules(
    z.object({
      placedAt: z.coerce.date().optional().default(() => new Date()),
      deadline: z.coerce.date().optional().nullable(),
      trackInventory: z.boolean().default(true),
      status: z.enum(["DRAFT", "ACTIVE"]).default("ACTIVE"),
    }),
  );
  assert.equal(rules.placedAt, undefined);
  assert.equal(rules.deadline, undefined);
  assert.equal(rules.trackInventory, undefined);
  assert.equal(rules.status, undefined);
});

test("a field with .default() is not required", () => {
  // JSON Schema leaves defaulted fields out of `required`, which is correct:
  // the user may leave it blank and still get a valid value.
  const rules = fieldRules(
    z.object({ uom: z.string().trim().min(1).max(24).default("pcs") }),
  );
  assert.equal(rules.uom?.required, false);
});

test("survives a schema it cannot introspect at all", () => {
  // Never worth crashing a dialog over a missing hint.
  assert.deepEqual(fieldRules(z.object({}) as never), {});
});

/** A stand-in for the real t(): returns the key plus its vars, so a test can
 * assert which sentence was chosen without depending on the copy. */
const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}(${JSON.stringify(vars)})` : key;

test("says nothing at all when the schema adds nothing worth saying", () => {
  // An optional 120-char text field has no rule a person benefits from
  // hearing. Saying "Optional" here put eight identical lines on one form;
  // FormDialog explains the asterisk once instead.
  const [rule] = Object.values(fieldRules(z.object({ city: optionalText(120) })));
  assert.equal(ruleHint(rule, t), undefined);
});

test("hint mentions a length limit a person could hit, not a database bound", () => {
  const tight = fieldRules(z.object({ zip: z.string().trim().min(1).max(20) })).zip;
  assert.equal(ruleHint(tight, t), 'form.rule.maxChars({"max":20})');

  // 2000 chars is storage, not guidance — saying it would be noise on a field
  // nobody will ever fill that far.
  const loose = fieldRules(z.object({ note: optionalText(2000) })).note;
  assert.equal(ruleHint(loose, t), undefined);
});

test("hint gives a worked example for email and url", () => {
  const rules = fieldRules(
    z.object({
      shippingEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
    }),
  );
  assert.equal(ruleHint(rules.shippingEmail, t), "form.rule.email");
});

test("blur on an empty required field asks for it; an empty optional one stays quiet", () => {
  const req = fieldRules(z.object({ a: z.string().min(1).max(10) })).a;
  const opt = fieldRules(z.object({ b: optionalText(10) })).b;
  assert.equal(validateValue(req, "   ", t), "form.err.required");
  assert.equal(validateValue(opt, "", t), undefined);
});

test("catches the typo cases the server would have rejected after submit", () => {
  const rules = fieldRules(
    z.object({
      email: z.string().trim().email().max(200).optional().or(z.literal("")),
      url: z.string().trim().url().max(1000).optional().or(z.literal("")),
      qty: z.number().int().min(1).max(10_000),
    }),
  );
  assert.equal(validateValue(rules.email, "hoang@", t), "form.err.email");
  assert.equal(validateValue(rules.email, "hoang@congty.vn", t), undefined);

  assert.equal(validateValue(rules.url, "congty.vn/anh.png", t), "form.err.url");
  assert.equal(validateValue(rules.url, "https://congty.vn/anh.png", t), undefined);

  assert.equal(validateValue(rules.qty, "2.5", t), "form.err.integer");
  assert.equal(validateValue(rules.qty, "abc", t), "form.err.number");
  assert.equal(validateValue(rules.qty, "0", t), 'form.err.min({"min":1})');
  assert.equal(validateValue(rules.qty, "99999", t), 'form.err.max({"max":10000})');
  assert.equal(validateValue(rules.qty, "12", t), undefined);
});

test("too-long text reports how far over it is", () => {
  const rule = fieldRules(z.object({ a: z.string().trim().min(1).max(5) })).a;
  assert.equal(
    validateValue(rule, "abcdefgh", t),
    'form.err.tooLong({"max":5,"count":8})',
  );
});

test("a lone lower bound of zero is not worth a line, but still validates", () => {
  const rule = fieldRules(z.object({ unitPrice: z.number().nonnegative() })).unitPrice;
  assert.equal(ruleHint(rule, t), undefined, "'At least 0' says nothing");
  assert.equal(validateValue(rule, "-5", t), 'form.err.min({"min":0})');

  // A lower bound that genuinely constrains still shows.
  const qty = fieldRules(z.object({ q: z.number().int().positive() })).q;
  assert.equal(ruleHint(qty, t), 'form.rule.min({"min":1})');
});

test("checks the regex schemas that money and phone are built from", () => {
  // core/schema.ts states these as regexes, so they were invisible to a
  // FieldRule that only understood length and range — leaving the highest
  // stakes field in the app, the amount box, with no check before submit.
  const money = z.string().trim().regex(/^\d+(\.\d{1,2})?$/);
  const rules = fieldRules(z.object({ amount: money }));
  assert.equal(validateValue(rules.amount, "12.50", t), undefined);
  assert.equal(validateValue(rules.amount, "12,50", t), "form.err.pattern");
  assert.equal(validateValue(rules.amount, "abc", t), "form.err.pattern");
});

test("does not double-check a format that already has its own message", () => {
  // zod emits BOTH format:"email" and a pattern. Running the pattern too would
  // report the vague "wrong format" instead of the email-specific sentence.
  const rules = fieldRules(z.object({ e: z.string().email() }));
  assert.equal(rules.e?.pattern, undefined);
  assert.equal(validateValue(rules.e, "hoang@", t), "form.err.email");
});
