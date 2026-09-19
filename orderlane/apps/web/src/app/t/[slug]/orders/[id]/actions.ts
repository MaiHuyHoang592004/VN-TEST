"use server";

import { applyTransition } from "@orderlane/services";
import { revalidatePath } from "next/cache";

import { currentContext } from "@/lib/session";

export interface TransitionState {
  readonly error?: string;
}

/**
 * Taking a transition from the UI.
 *
 * `expectedVersion` is the version the page was rendered with. Sending it back
 * is what turns "somebody else moved this while you were reading" from a
 * silent overwrite into a message — the optimistic lock is only useful if the
 * client actually participates in it.
 */
export async function takeTransition(
  _previous: TransitionState,
  formData: FormData,
): Promise<TransitionState> {
  const slug = String(formData.get("slug") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const instanceId = String(formData.get("instanceId") ?? "");
  const transitionKey = String(formData.get("transitionKey") ?? "");
  const expectedVersion = Number(formData.get("expectedVersion"));

  const { ctx } = await currentContext(slug);

  try {
    await applyTransition(ctx, instanceId, transitionKey, {
      ...(Number.isInteger(expectedVersion) ? { expectedVersion } : {}),
    });
  } catch (error) {
    // Service errors already carry a message written for a person; there is
    // nothing useful to add by rewording them here.
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath(`/t/${slug}/orders/${orderId}`);
  revalidatePath(`/t/${slug}/orders`);
  return {};
}
