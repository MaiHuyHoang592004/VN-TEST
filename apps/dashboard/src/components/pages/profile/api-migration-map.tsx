"use client";

import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n";

import { SettingsCard } from "./settings-card";

/**
 * What an integration built against the old API has to change — doc 07 F4, and
 * the thing that has to be LIVE before the legacy base URL is switched off.
 *
 * Every legacy endpoint a seller could hold is listed, including the retired
 * ones. A missing column is how somebody discovers a shutdown by 404 at 2am, so
 * "retired" is stated out loud rather than left out.
 *
 * Kept as data in this file rather than prose in a doc: it renders inside the
 * dashboard the sellers already log into, and it cannot drift from the app the
 * way a PDF does.
 */
type Mapping = {
  legacy: string;
  /** null = retired with no replacement. */
  now: string | null;
  /** Shown as a warning column — a silent behaviour change, not a rename. */
  breaking?: boolean;
  /** Key under profile.api.migration.notes — the note is COPY, and copy in a
   * seven-locale app does not live in a component as an English literal. */
  noteKey?: string;
};

const MAPPINGS: Mapping[] = [
  { legacy: "POST /api/warehouse/orders", now: "POST /api/v1/orders" },
  { legacy: "POST /api/v2/warehouse/orders", now: "POST /api/v1/orders" },
  { legacy: "POST /api/v3/warehouse/orders", now: null, noteKey: "v3Orders" },
  { legacy: "GET /api/warehouse/orders", now: "GET /api/v1/orders", noteKey: "listOrders" },
  { legacy: "GET /api/warehouse/orders/:id", now: "GET /api/v1/orders/:id" },
  { legacy: "PATCH /api/warehouse/orders/:id", now: "PATCH /api/v1/orders/:id" },
  {
    legacy: "PATCH /api/warehouse/orders/:id/resolve-design",
    now: "PATCH /api/v1/orders/:id",
    noteKey: "resolveDesign",
  },
  {
    legacy: "PATCH /api/warehouse/orders/:id/resolve-label",
    now: "PATCH /api/v1/orders/:id",
    noteKey: "resolveLabel",
  },
  { legacy: "GET /api/warehouse/metadata", now: "GET /api/v1/catalog" },
  { legacy: "GET /api/v3/warehouse/orders/pricing", now: "GET /api/v1/catalog", noteKey: "pricing" },
  { legacy: "GET /api/warehouse/profile", now: "GET /api/v1/me" },
  { legacy: "x-api-key header", now: "x-api-key header", noteKey: "apiKey" },
  {
    legacy: "Outbound webhooks — x-api-key signature",
    now: "Outbound webhooks — X-Signature",
    breaking: true,
    noteKey: "webhookSignature",
  },
  { legacy: "GET /api/admin/v1/*", now: null, noteKey: "admin" },
  {
    legacy: "OCR label extraction, sync-mockup, SSE order stream",
    now: null,
    noteKey: "drivePipeline",
  },
];

export function ApiMigrationMap() {
  const { t } = useTranslation();

  return (
    <SettingsCard title={t("profile.api.migration.title")} description={t("profile.api.migration.hint")}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] text-sm">
          <thead className="text-muted-foreground text-xs">
            <tr className="border-border border-b">
              <th className="py-2 pr-4 text-left font-medium">
                {t("profile.api.migration.colLegacy")}
              </th>
              <th className="py-2 pr-4 text-left font-medium">
                {t("profile.api.migration.colNow")}
              </th>
              <th className="py-2 text-left font-medium">{t("profile.api.migration.colNote")}</th>
            </tr>
          </thead>
          <tbody>
            {MAPPINGS.map((column) => (
              <tr key={column.legacy} className="border-border/60 border-b align-top last:border-0">
                <td className="py-2 pr-4">
                  <code className="text-muted-foreground font-mono text-xs">{column.legacy}</code>
                </td>
                <td className="py-2 pr-4">
                  {column.now ? (
                    <code className="font-mono text-xs">{column.now}</code>
                  ) : (
                    <Badge variant="secondary">{t("profile.api.migration.retired")}</Badge>
                  )}
                </td>
                <td className="text-muted-foreground py-2 text-xs">
                  {column.breaking && (
                    <span className="mr-1.5 text-(--status-attention-fg) inline-flex items-center gap-1 font-medium">
                      <AlertTriangle className="size-3" />
                      {t("profile.api.migration.breaking")}
                    </span>
                  )}
                  {column.noteKey && t(`profile.api.migration.notes.${column.noteKey}`)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SettingsCard>
  );
}
