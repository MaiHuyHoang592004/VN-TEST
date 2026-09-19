import type { WorkflowDefinition } from "./types.ts";

/**
 * Two starting processes, shipped as examples rather than as the truth.
 *
 * They exist to prove the engine is general: the second one contains cycles
 * (a proof that goes back for changes, a quality check that sends work back to
 * production), which no ordered status enum can express without lying. A
 * merchant copies one and edits it; neither is privileged in the code.
 */

/** Stock on hand, nothing made to order: pick, pack, dispatch. */
export const STANDARD_RETAIL: WorkflowDefinition = {
  key: "standard-retail",
  version: 1,
  name: "Standard retail",
  states: [
    { key: "received", label: "Received", kind: "INITIAL", position: 0 },
    { key: "picking", label: "Picking", kind: "ACTIVE", position: 1 },
    { key: "packed", label: "Packed", kind: "ACTIVE", position: 2 },
    { key: "dispatched", label: "Dispatched", kind: "ACTIVE", position: 3 },
    { key: "exception", label: "Delivery exception", kind: "ACTIVE", position: 4 },
    { key: "delivered", label: "Delivered", kind: "TERMINAL", position: 5 },
    { key: "returned", label: "Returned", kind: "TERMINAL", position: 6 },
    { key: "cancelled", label: "Cancelled", kind: "TERMINAL", position: 7 },
  ],
  transitions: [
    {
      key: "start_picking",
      label: "Start picking",
      from: "received",
      to: "picking",
      requiredRole: "OPERATOR",
      guards: [{ kind: "count_is_zero", count: "lines_missing_stock" }],
    },
    { key: "mark_packed", label: "Mark packed", from: "picking", to: "packed", requiredRole: "OPERATOR" },
    {
      key: "dispatch",
      label: "Dispatch",
      from: "packed",
      to: "dispatched",
      requiredRole: "OPERATOR",
      guards: [{ kind: "flag_is_true", flag: "has_shipping_label" }],
    },
    { key: "confirm_delivery", label: "Confirm delivery", from: "dispatched", to: "delivered" },
    { key: "raise_exception", label: "Raise delivery exception", from: "dispatched", to: "exception" },
    { key: "resume_delivery", label: "Resume delivery", from: "exception", to: "dispatched" },
    { key: "accept_return", label: "Accept return", from: "exception", to: "returned", requiredRole: "OPERATOR" },
    { key: "cancel_early", label: "Cancel", from: "received", to: "cancelled", requiredRole: "OWNER" },
    { key: "cancel_picking", label: "Cancel", from: "picking", to: "cancelled", requiredRole: "OWNER" },
  ],
};

/**
 * Made to order, with two loops: a buyer proof that can come back for changes,
 * and a quality check that can send work back to production. Both are ordinary
 * edges here and impossible in a linear status column.
 */
export const MADE_TO_ORDER: WorkflowDefinition = {
  key: "made-to-order",
  version: 1,
  name: "Made to order",
  states: [
    { key: "received", label: "Received", kind: "INITIAL", position: 0 },
    { key: "proofing", label: "Proofing", kind: "ACTIVE", position: 1 },
    { key: "awaiting_approval", label: "Awaiting approval", kind: "ACTIVE", position: 2 },
    { key: "in_production", label: "In production", kind: "ACTIVE", position: 3 },
    { key: "quality_check", label: "Quality check", kind: "ACTIVE", position: 4 },
    { key: "packed", label: "Packed", kind: "ACTIVE", position: 5 },
    { key: "dispatched", label: "Dispatched", kind: "ACTIVE", position: 6 },
    { key: "delivered", label: "Delivered", kind: "TERMINAL", position: 7 },
    { key: "cancelled", label: "Cancelled", kind: "TERMINAL", position: 8 },
  ],
  transitions: [
    { key: "start_proof", label: "Start proof", from: "received", to: "proofing", requiredRole: "OPERATOR" },
    {
      key: "send_proof",
      label: "Send proof to buyer",
      from: "proofing",
      to: "awaiting_approval",
      requiredRole: "OPERATOR",
      guards: [{ kind: "count_is_zero", count: "lines_missing_artwork" }],
    },
    { key: "request_changes", label: "Buyer requested changes", from: "awaiting_approval", to: "proofing" },
    { key: "approve_proof", label: "Buyer approved", from: "awaiting_approval", to: "in_production" },
    { key: "send_to_qc", label: "Send to quality check", from: "in_production", to: "quality_check", requiredRole: "OPERATOR" },
    { key: "qc_rework", label: "Send back for rework", from: "quality_check", to: "in_production", requiredRole: "OPERATOR" },
    { key: "qc_pass", label: "Passed quality check", from: "quality_check", to: "packed", requiredRole: "OPERATOR" },
    {
      key: "dispatch",
      label: "Dispatch",
      from: "packed",
      to: "dispatched",
      requiredRole: "OPERATOR",
      guards: [{ kind: "flag_is_true", flag: "has_shipping_label" }],
    },
    { key: "confirm_delivery", label: "Confirm delivery", from: "dispatched", to: "delivered" },
    { key: "cancel_early", label: "Cancel", from: "received", to: "cancelled", requiredRole: "OWNER" },
    { key: "cancel_proofing", label: "Cancel", from: "proofing", to: "cancelled", requiredRole: "OWNER" },
    { key: "cancel_awaiting", label: "Cancel", from: "awaiting_approval", to: "cancelled", requiredRole: "OWNER" },
  ],
};

export const PRESETS = [STANDARD_RETAIL, MADE_TO_ORDER] as const;
