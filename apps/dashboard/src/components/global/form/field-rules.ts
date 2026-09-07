import { z } from "zod";

/**
 * What a field's zod schema already knows, in the shape the UI needs.
 *
 * The point is that the rules exist exactly once. A hand-written hint saying
 * "up to 64 characters" beside a `.max(64)` is a second copy of the truth, and
 * the copy is the one that goes stale when the schema changes.
 *
 * Deliberately narrow: no enum or boolean. Those render as a Select or a
 * Checkbox, where the value is picked from a list and cannot be mistyped, so
 * there is no rule worth stating and nothing for blur validation to catch.
 */
export type FieldRule = {
  required: boolean;
  kind: "text" | "number" | "integer" | "email" | "url";
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  /** A format the value must match — money and phone are regex schemas here. */
  pattern?: string;
};

/** JSON Schema's view of one property — only the keywords we act on. */
type Node = {
  type?: string;
  format?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  pattern?: string;
  const?: unknown;
  enum?: unknown[];
  anyOf?: Node[];
};

/**
 * `.optional().or(z.literal(""))` — the app's idiom for "optional text" — comes
 * out as anyOf[realThing, {const:""}], and `.nullable()` as anyOf[realThing,
 * {type:"null"}]. The first branch that isn't one of those fillers is the
 * field's actual type.
 */
function unwrap(node: Node): Node {
  if (!node.anyOf) return node;
  const real = node.anyOf.find(
    (branch) => branch.type !== "null" && branch.const !== "",
  );
  return real ?? node;
}

/**
 * `.positive()` compiles to {exclusiveMinimum: 0, maximum: 9007199254740991} —
 * the upper bound is Number.MAX_SAFE_INTEGER, an artefact of how zod expresses
 * "a positive number", not a limit anyone meant. Rendering it verbatim gives
 * "From 1 to 9007199254740991".
 */
function realBound(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Math.abs(value) >= Number.MAX_SAFE_INTEGER ? undefined : value;
}

function ruleFor(node: Node, required: boolean): FieldRule | undefined {
  const n = unwrap(node);

  // An enum is `{type:"string", enum:[…]}` — a string by JSON Schema's reading,
  // but a Select on screen. Checked before the string branch, which would
  // otherwise claim it and offer length advice for a value nobody types.
  if (n.enum) return undefined;

  if (n.type === "string") {
    const kind =
      n.format === "email" ? "email" : n.format === "uri" ? "url" : "text";
    return {
      required,
      kind,
      ...(n.minLength !== undefined ? { minLength: n.minLength } : {}),
      ...(n.maxLength !== undefined ? { maxLength: n.maxLength } : {}),
      // Only for plain text. email/uri already carry their own check, and
      // zod emits a pattern for those too — keeping it would run the same
      // test twice and report the vaguer of the two messages.
      ...(n.pattern !== undefined && kind === "text" ? { pattern: n.pattern } : {}),
    };
  }

  if (n.type === "integer" || n.type === "number") {
    const isInt = n.type === "integer";
    // An exclusive bound on a whole number is just the next one along. On a
    // float there is no "next", so we treat it as inclusive and accept being
    // off by an epsilon — this only ever feeds a hint sentence.
    const min =
      realBound(n.minimum) ??
      (n.exclusiveMinimum !== undefined
        ? realBound(isInt ? n.exclusiveMinimum + 1 : n.exclusiveMinimum)
        : undefined);
    const max =
      realBound(n.maximum) ??
      (n.exclusiveMaximum !== undefined
        ? realBound(isInt ? n.exclusiveMaximum - 1 : n.exclusiveMaximum)
        : undefined);
    return {
      required,
      kind: isInt ? "integer" : "number",
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
    };
  }

  // Dates arrive with no `type` at all; booleans and enums are picked, not
  // typed. Nothing honest to say, so say nothing.
  return undefined;
}

/**
 * Describe every field of an object schema.
 *
 * Call it once at module scope (`const RULES = fieldRules(orderSchema)`) rather
 * than inside a component — it is pure and the answer never changes, so there
 * is no reason to pay for it on every render, and no reason to build a cache
 * either.
 */
export function fieldRules(
  schema: z.ZodObject<z.ZodRawShape>,
): Record<string, FieldRule | undefined> {
  let json: { properties?: Record<string, Node>; required?: string[] };
  try {
    json = z.toJSONSchema(schema, {
      io: "input",
      unrepresentable: "any",
    }) as typeof json;
  } catch {
    // A schema shape zod cannot express as JSON Schema costs us the hints for
    // that form. It must never cost us the form.
    return {};
  }

  const required = new Set(json.required ?? []);
  const out: Record<string, FieldRule | undefined> = {};
  for (const [name, node] of Object.entries(json.properties ?? {})) {
    const rule = ruleFor(node, required.has(name));
    if (rule) out[name] = rule;
  }
  return out;
}

type Translate = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

/**
 * Above this, a character limit is a database bound rather than something a
 * person could bump into. Telling someone an address line holds 200 characters
 * is noise; telling them a postcode holds 20 is a useful warning. Keeping the
 * threshold low is what stops eighteen fields all wearing the same grey
 * sentence.
 */
const MEANINGFUL_LENGTH = 100;

/** The rule half of a field's hint. Bespoke copy is joined in by FormField. */
export function ruleHint(
  rule: FieldRule | undefined,
  t: Translate,
): string | undefined {
  if (!rule) return undefined;
  const parts: string[] = [];

  // Optionality is deliberately NOT said here. It was, and on the new-order
  // form that rendered "Optional" under eight of eighteen fields — eight
  // identical grey lines, which reads as noise rather than as help. The
  // asterisk convention is explained once by FormDialog's legend instead, so
  // this sentence only ever carries information specific to the field.
  if (rule.kind === "email") {
    parts.push(t("form.rule.email"));
  } else if (rule.kind === "url") {
    parts.push(t("form.rule.url"));
  } else if (rule.kind === "number" || rule.kind === "integer") {
    const { min, max } = rule;
    if (min !== undefined && max !== undefined) {
      parts.push(t("form.rule.range", { min, max }));
    } else if (min !== undefined && min !== 0) {
      // A lone lower bound of zero is what everyone already assumes — a price
      // field announcing "At least 0" spends a line saying nothing. Kept for
      // validation, just not worth printing.
      parts.push(t("form.rule.min", { min }));
    } else if (max !== undefined) {
      parts.push(t("form.rule.max", { max }));
    }
  } else if (
    rule.maxLength !== undefined &&
    rule.maxLength <= MEANINGFUL_LENGTH
  ) {
    parts.push(t("form.rule.maxChars", { max: rule.maxLength }));
  }

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

// Deliberately lax next to zod's exhaustive pattern. This runs while someone is
// filling a form, where the job is to catch the obvious typo early and say so
// kindly; the server still validates properly on submit. A client check strict
// enough to reject a valid-but-unusual address would be worse than none.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The message to show under a field, or undefined if the value is fine. */
export function validateValue(
  rule: FieldRule | undefined,
  raw: string,
  t: Translate,
): string | undefined {
  if (!rule) return undefined;
  const value = raw.trim();

  if (value === "") {
    return rule.required ? t("form.err.required") : undefined;
  }

  if (rule.kind === "number" || rule.kind === "integer") {
    const n = Number(value);
    if (!Number.isFinite(n)) return t("form.err.number");
    if (rule.kind === "integer" && !Number.isInteger(n)) {
      return t("form.err.integer");
    }
    if (rule.min !== undefined && n < rule.min) {
      return t("form.err.min", { min: rule.min });
    }
    if (rule.max !== undefined && n > rule.max) {
      return t("form.err.max", { max: rule.max });
    }
    return undefined;
  }

  if (rule.maxLength !== undefined && value.length > rule.maxLength) {
    return t("form.err.tooLong", { max: rule.maxLength, count: value.length });
  }
  if (rule.minLength !== undefined && value.length < rule.minLength) {
    return t("form.err.tooShort", { min: rule.minLength });
  }

  if (rule.pattern !== undefined && !new RegExp(rule.pattern).test(value)) {
    // Money and phone are regex schemas (core/schema.ts), and they are the
    // fields where getting the format wrong costs the most. The message is
    // necessarily generic — a regex cannot be read aloud — so the field's
    // hint stays on screen beside it, carrying the worked example.
    return t("form.err.pattern");
  }
  if (rule.kind === "email" && !LOOKS_LIKE_EMAIL.test(value)) {
    return t("form.err.email");
  }
  if (rule.kind === "url") {
    let protocol: string | undefined;
    try {
      protocol = new URL(value).protocol;
    } catch {
      return t("form.err.url");
    }
    if (protocol !== "http:" && protocol !== "https:") {
      return t("form.err.url");
    }
  }

  return undefined;
}
