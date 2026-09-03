import { headers } from "next/headers";

import { getMyApiKeys } from "@/modules/identity/profile/queries";
import { ApiKeysPanel } from "@/components/pages/profile/api-keys-panel";

export default async function ApiKeysPage() {
  const keys = await getMyApiKeys();
  // Derive the public base URL from the request rather than hard-coding it, so
  // the snippet is right on localhost, previews and production alike.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return (
    <ApiKeysPanel
      baseUrl={`${proto}://${host}`}
      keys={keys.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        revokedAt: k.revokedAt?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
      }))}
    />
  );
}
