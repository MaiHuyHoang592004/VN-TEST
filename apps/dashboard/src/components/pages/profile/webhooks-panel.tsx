"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/lib/i18n";
import {
  updateWebhookAction,
  testWebhookAction,
} from "@/modules/identity/profile/actions";
import { SettingsCard, SettingsStack } from "./settings-card";

/** 32 hex chars — comfortably above the 16-char minimum the schema enforces. */
function randomSecret() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function WebhooksPanel({
  webhookUrl,
  hasSecret,
}: {
  webhookUrl: string;
  hasSecret: boolean;
}) {
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState(webhookUrl);
  const [secret, setSecret] = useState("");

  const save = () =>
    startTransition(async () => {
      try {
        await updateWebhookAction({ url, secret });
        setSecret("");
        toast.success(t("profile.webhooks.saved"));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("common.error"));
      }
    });

  const test = () =>
    startTransition(async () => {
      const res = await testWebhookAction();
      if (res.ok) toast.success(`${t("profile.webhooks.testOk")} ${res.status}`);
      else toast.error(t("profile.webhooks.testFailed"));
    });

  return (
    <SettingsStack>
      <SettingsCard
        title={t("profile.webhooks.title")}
        description={t("profile.webhooks.hint")}
        footer={t("profile.webhooks.httpsOnly")}
        action={
          <>
            <Button
              variant="outline"
              onClick={test}
              disabled={pending || !webhookUrl}
            >
              {t("profile.webhooks.sendTest")}
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? t("common.saving") : t("common.save")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="url">{t("profile.webhooks.url")}</Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-app.com/webhooks/gwprint"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="secret">{t("profile.webhooks.secret")}</Label>
            <div className="mt-1.5 flex gap-2">
              <Input
                id="secret"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                // Blank means "leave the existing secret alone" — the service
                // only overwrites when a new value is supplied.
                placeholder={
                  hasSecret
                    ? t("profile.webhooks.secretSet")
                    : t("profile.webhooks.secretNone")
                }
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setSecret(randomSecret())}
              >
                {t("profile.webhooks.generate")}
              </Button>
            </div>
            <p className="text-muted-foreground mt-1.5 text-xs">
              {t("profile.webhooks.secretHint")}
            </p>
          </div>
        </div>
      </SettingsCard>
    </SettingsStack>
  );
}
