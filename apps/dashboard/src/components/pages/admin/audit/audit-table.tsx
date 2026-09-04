"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DataTable,
  DataTablePagination,
  DataTableToolbar,
  useTableParams,
  type Column,
} from "@/components/global/data-table";
import { useTranslation } from "@/lib/i18n";
import { StatusBadge } from "@/components/ds";

export type AuditRow = {
  id: string;
  action: string;
  actor: { name: string | null; email: string | null } | null;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  ip: string | null;
  createdAt: string;
};

const TARGET_TYPES = ["user", "customer", "order", "transaction", "api_key", "invite"];
const pretty = (v: string) => v.toLowerCase().replace(/_/g, " ");

/** Money and permission changes deserve to stand out in a long list. */
const isSensitive = (action: string) =>
  action.startsWith("BALANCE_") || action.includes("ROLE") || action.includes("DELETED");

function Diff({
  before,
  after,
  noDetail,
}: {
  before: unknown;
  after: unknown;
  noDetail: string;
}) {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  if (keys.length === 0) {
    return <p className="text-muted-foreground text-xs">{noDetail}</p>;
  }
  return (
    <dl className="grid gap-1 text-xs">
      {keys.map((k) => {
        const from = JSON.stringify(b[k]);
        const to = JSON.stringify(a[k]);
        if (from === to) return null;
        return (
          <div key={k} className="grid grid-cols-[8rem_1fr] gap-2">
            <dt className="text-muted-foreground truncate">{k}</dt>
            <dd className="font-mono">
              <span className="text-muted-foreground line-through">{from ?? "—"}</span>
              {" → "}
              <span>{to ?? "—"}</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function AuditTable({ rows, total }: { rows: AuditRow[]; total: number }) {
  const params = useTableParams({ pageSize: 50 });
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);

  const columns: Column<AuditRow>[] = [
    {
      id: "createdAt",
      header: t("admin.audit.colWhen"),
      cell: (r) => (
        <span className="text-muted-foreground text-xs whitespace-nowrap">
          {new Date(r.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      id: "actor",
      header: t("admin.audit.colWho"),
      cell: (r) => (
        <span className="text-sm">
          {r.actor?.name || r.actor?.email || (
            <span className="text-muted-foreground italic">{t("admin.audit.system")}</span>
          )}
        </span>
      ),
    },
    {
      id: "action",
      header: t("admin.audit.colAction"),
      cell: (r) => (
        // An audit ACTION is not a status, so it never goes through toneFor():
        // the tone is the sensitivity flag, passed explicitly.
        <StatusBadge
          status={r.action}
          tone={isSensitive(r.action) ? "attention" : "neutral"}
          dot={false}
        >
          {pretty(r.action)}
        </StatusBadge>
      ),
    },
    {
      id: "target",
      header: t("admin.audit.colTarget"),
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-muted-foreground font-mono text-xs">
          {r.targetType}:{r.targetId.slice(0, 12)}
        </span>
      ),
    },
    {
      id: "reason",
      header: t("admin.audit.colReason"),
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-muted-foreground line-clamp-1 text-sm">{r.reason ?? "—"}</span>
      ),
    },
    {
      id: "expand",
      header: <span className="sr-only">{t("admin.audit.colDetails")}</span>,
      className: "w-10",
      cell: (r) => (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("admin.audit.showChanges")}
          aria-expanded={expanded === r.id}
          onClick={() => setExpanded(expanded === r.id ? null : r.id)}
        >
          <ChevronDown
            className={`size-4 transition-transform ${expanded === r.id ? "rotate-180" : ""}`}
          />
        </Button>
      ),
    },
  ];

  const hasFilters = Boolean(params.get("action") || params.get("targetType"));

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        rows={rows}
        columns={columns}
        rowId={(r) => r.id}
        loading={params.pending}
        empty={hasFilters ? t("admin.audit.emptyFiltered") : t("admin.audit.empty")}
        toolbar={
          <DataTableToolbar
            hasFilters={hasFilters}
            onClearFilters={() => params.clearFilters(["action", "targetType"])}
            filters={
              <Select
                value={params.get("targetType") || "all"}
                onValueChange={(v) =>
                  params.setFilter("targetType", v === "all" ? "" : (v ?? ""))
                }
              >
                <SelectTrigger className="w-[10rem]" aria-label={t("admin.audit.colTarget")}>
                  <SelectValue>
                    {params.get("targetType") ? pretty(params.get("targetType")) : t("admin.audit.allTargets")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("admin.audit.allTargets")}</SelectItem>
                  {TARGET_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {pretty(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        }
        footer={
          <DataTablePagination
            page={params.page}
            pageSize={params.pageSize}
            total={total}
            onPageChange={params.setPage}
            onPageSizeChange={params.setPageSize}
          />
        }
      />

      {/* Rendered under the table rather than as an inline column so the row
          grid isn't disturbed by a wide diff. */}
      {expanded && (
        <div className="border-border rounded-lg border p-4">
          <p className="mb-2 text-sm font-medium">{t("admin.audit.whatChanged")}</p>
          <Diff
            before={rows.find((r) => r.id === expanded)?.before}
            after={rows.find((r) => r.id === expanded)?.after}
            noDetail={t("admin.audit.noDetail")}
          />
          {rows.find((r) => r.id === expanded)?.ip && (
            <p className="text-muted-foreground mt-3 font-mono text-xs">
              {t("admin.audit.from")} {rows.find((r) => r.id === expanded)?.ip}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
