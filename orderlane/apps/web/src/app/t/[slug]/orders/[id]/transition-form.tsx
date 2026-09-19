"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { takeTransition, type TransitionState } from "./actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "…" : label}
    </button>
  );
}

/**
 * One button per transition the engine says this actor may take. The list is
 * `Workflow.available()`, so a rendered button is a button that works — the
 * affordance and the permission check are one computation, not two that drift.
 */
export function TransitionForm({
  slug,
  orderId,
  instanceId,
  version,
  transitions,
}: {
  slug: string;
  orderId: string;
  instanceId: string;
  version: number;
  transitions: readonly { key: string; label: string }[];
}) {
  const [state, action] = useActionState<TransitionState, FormData>(takeTransition, {});

  if (transitions.length === 0) {
    return <p style={{ color: "var(--text-muted)", margin: 0 }}>Nothing to do here.</p>;
  }

  return (
    <>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {transitions.map((transition) => (
          <form key={transition.key} action={action}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="instanceId" value={instanceId} />
            <input type="hidden" name="transitionKey" value={transition.key} />
            <input type="hidden" name="expectedVersion" value={version} />
            <Submit label={transition.label} />
          </form>
        ))}
      </div>
      {state.error ? (
        <p role="alert" style={{ color: "var(--danger)", marginBottom: 0 }}>
          {state.error}
        </p>
      ) : null}
    </>
  );
}
