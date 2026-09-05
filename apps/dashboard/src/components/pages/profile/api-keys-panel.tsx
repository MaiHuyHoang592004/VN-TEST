"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FormDialog, ResponsiveDialog } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import {
  createApiKeyAction,
  revokeApiKeyAction,
} from "@/modules/identity/profile/actions";
import { SettingsCard, SettingsStack } from "./settings-card";
import { ApiMigrationMap } from "./api-migration-map";

export type ApiKeyRow = {
  id: number;
  name: string | null;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

function CopyButton({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  // The timer outlives the button when a dialog closes mid-tick, so it is
  // cleared on unmount rather than left to set state on a dead component.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={label}
      onClick={async () => {
        // navigator.clipboard is undefined outside a secure context and can
        // reject when permission is denied. Unguarded, both failed silently
        // while the tick still appeared — the user walked off with nothing.
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          toast.error(t("profile.api.copyFailed"));
          return;
        }
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </Button>
  );
}

export function ApiKeysPanel({
  keys,
  baseUrl,
}: {
  keys: ApiKeyRow[];
  baseUrl: string;
}) {
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyRow | null>(null);

  const create = () =>
    startTransition(async () => {
      try {
        const res = await createApiKeyAction({ name });
        setName("");
        // The raw key exists exactly once, in this response. It is never
        // retrievable again — only its hash is stored.
        setCreatedKey(res.raw);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("common.error"));
      }
    });

  // Revoking kills a live credential the moment it lands and cannot be undone,
  // so it is confirmed first — and the dialog NAMES the key, because a list of
  // "Untitled key" rows is exactly where the wrong one gets clicked.
  const revoke = (id: number) =>
    startTransition(async () => {
      try {
        await revokeApiKeyAction(id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("profile.api.revokeFailed"));
        return;
      }
      setRevoking(null);
      toast.success(t("profile.api.revoked"));
    });

  const active = keys.filter((k) => !k.revokedAt);

  return (
    <SettingsStack>
      <SettingsCard
        title={t("profile.api.title")}
        description={t("profile.api.hint")}
        footer={t("profile.api.shownOnce")}
        action={
          <Button onClick={create} disabled={pending || !name.trim()}>
            {t("profile.api.create")}
          </Button>
        }
      >
        <div className="max-w-sm">
          <Label htmlFor="keyName">{t("profile.api.keyName")}</Label>
          <Input
            id="keyName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("profile.api.keyNamePlaceholder")}
            className="mt-1.5"
          />
        </div>

        {active.length > 0 && (
          <ul className="border-border mt-5 divide-y rounded-md border">
            {active.map((k) => (
              <li
                key={k.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {k.name || t("profile.api.unnamed")}
                  </p>
                  <p className="text-muted-foreground font-mono text-xs">
                    {k.prefix || "—"}…
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground hidden text-xs sm:inline">
                    {k.lastUsedAt
                      ? `${t("profile.api.lastUsed")} ${new Date(k.lastUsedAt).toLocaleDateString()}`
                      : t("profile.api.neverUsed")}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => setRevoking(k)}
                  >
                    {t("profile.api.revoke")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {active.length === 0 && (
          <p className="text-muted-foreground mt-5 text-sm">
            {t("profile.api.empty")}
          </p>
        )}
      </SettingsCard>

      <SettingsCard
        title={t("profile.api.usage")}
        description={t("profile.api.usageHint")}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <code className="bg-muted min-w-0 flex-1 truncate rounded-md px-3 py-2 font-mono text-xs">
              {baseUrl}/api/v1
            </code>
            <CopyButton value={`${baseUrl}/api/v1`} label={t("common.copy")} />
          </div>
          <div className="flex items-center gap-2">
            <code className="bg-muted min-w-0 flex-1 truncate rounded-md px-3 py-2 font-mono text-xs">
              x-api-key: opc_live_…
            </code>
            <Badge variant="secondary">{t("profile.api.header")}</Badge>
          </div>
        </div>
      </SettingsCard>

      {/* Shown once, deliberately modal: closing it loses the key forever. */}
      <ResponsiveDialog
        open={Boolean(createdKey)}
        onOpenChange={(open) => !open && setCreatedKey(null)}
        title={t("profile.api.created")}
        description={t("profile.api.createdHint")}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <code className="bg-muted min-w-0 flex-1 overflow-x-auto rounded-md px-3 py-2 font-mono text-xs">
              {createdKey}
            </code>
            {createdKey && (
              <CopyButton value={createdKey} label={t("common.copy")} />
            )}
          </div>
          <Button className="w-full sm:w-auto sm:self-end" onClick={() => setCreatedKey(null)}>
            {t("profile.api.savedIt")}
          </Button>
        </div>
      </ResponsiveDialog>

      {revoking && (
        <FormDialog
          open
          onOpenChange={(open) => !open && setRevoking(null)}
          title={t("profile.api.revokeTitle")}
          description={`${revoking.name || t("profile.api.unnamed")} · ${revoking.prefix || "—"}…`}
          submitLabel={t("profile.api.revoke")}
          destructive
          pending={pending}
          onSubmit={() => revoke(revoking.id)}
        >
          <p className="text-(length:--fs-body-sm) text-(--text-muted)">
            {t("profile.api.revokeBody")}
          </p>
        </FormDialog>
      )}

      <ApiMigrationMap />
    </SettingsStack>
  );
}
