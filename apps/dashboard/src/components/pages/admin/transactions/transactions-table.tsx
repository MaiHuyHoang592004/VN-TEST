"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Can } from "@/components/global/permission-gate";
import { useTranslation } from "@/lib/i18n";

import { ApproveDialog } from "./approve-dialog";
import { StatusBadge } from "@/components/ds";

export type TransactionRow = {
  id: number;
  publicId: string;
  /** Receipt screenshots the seller attached to the request (doc 07 B). */
  evidence: { url: string; originalFilename: string }[];
  /** A refund request carries the orders it is about. */
  orderIds: number[];
  amount: string;
  type: string;
  status: string;
  note: string | null;
  description: string | null;
  balanceBefore: string | null;
  balanceAfter: string | null;
  createdAt: string;
  userName: string;
  userEmail: string;
};

const TYPES = ["TOPUP", "ORDER_PAYMENT", "REFUND", "ADJUSTMENT"] as const;
const STATUSES = ["PENDING", "COMPLETED", "FAILED", "CANCELLED"] as const;

export function TransactionsTable({
  rows,
  total,
}: {
  rows: TransactionRow[];
  total: number;
}) {
  const params = useTableParams();
  const { t } = useTranslation();
  const [acting, setActing] = useState<{ column: TransactionRow; mode: "approve" | "reject" } | null>(
    null,
  );

  const type = params.get("type");
  const status = params.get("status");
  const hasFilters = Boolean(params.get("q") || type || status);

  const columns: Column<TransactionRow>[] = [
    {
      id: "createdAt",
      header: t("finance.colDate"),
      cell: (r) => (
        <div className="min-w-0">
          <p className="text-sm">{new Date(r.createdAt).toLocaleDateString()}</p>
          <p className="text-muted-foreground truncate font-mono text-xs">
            {r.publicId.slice(0, 8)}
          </p>
        </div>
      ),
    },
    {
      id: "user",
      header: t("finance.colUser"),
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{r.userName}</p>
          <p className="text-muted-foreground truncate text-xs">{r.userEmail}</p>
        </div>
      ),
    },
    {
      id: "type",
      header: t("finance.colType"),
      // A transaction TYPE is not a status — explicit neutral, never toneFor().
      cell: (r) => (
        <StatusBadge status={r.type} tone="neutral" dot={false}>
          {t(`finance.types.${r.type}`)}
        </StatusBadge>
      ),
    },
    {
      id: "amount",
      header: t("finance.colAmount"),
      className: "text-right tabular-nums",
      cell: (r) => {
        // A charge is stored negative; the sign IS the direction, so it is
        // shown rather than inferred from the type.
        const negative = r.amount.startsWith("-");
        return (
          <span
            className={`font-mono text-sm font-medium ${
              negative ? "text-destructive" : "text-green-600"
            }`}
          >
            {negative ? "" : "+"}${r.amount.replace("-", "")}
          </span>
        );
      },
    },
    {
      id: "balance",
      header: t("finance.colBalance"),
      hideOnMobile: true,
      className: "text-right tabular-nums",
      cell: (r) =>
        r.balanceBefore && r.balanceAfter ? (
          <span className="text-muted-foreground font-mono text-xs">
            ${r.balanceBefore} → ${r.balanceAfter}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        ),
    },
    {
      id: "status",
      header: t("finance.colStatus"),
      // TransactionStatus is in STATUS_TONES, so the local three-way ternary
      // goes and the colour derives from the value.
      cell: (r) => (
        <StatusBadge status={r.status}>{t(`finance.statuses.${r.status}`)}</StatusBadge>
      ),
    },
    {
      id: "note",
      header: t("finance.colNote"),
      hideOnMobile: true,
      cell: (r) => (
        <div className="flex max-w-[16rem] flex-col gap-1">
          <span className="text-muted-foreground truncate text-sm">
            {r.note ?? r.description ?? "—"}
          </span>
          {r.orderIds.length > 0 && (
            <span className="text-muted-foreground font-mono text-xs">
              {t("finance.colOrders")}: {r.orderIds.join(", ")}
            </span>
          )}
        </div>
      ),
    },
    {
      id: "evidence",
      header: t("finance.colEvidence"),
      hideOnMobile: true,
      cell: (r) =>
        r.evidence.length === 0 ? (
          <span className="text-muted-foreground text-sm">—</span>
        ) : (
          <div className="flex gap-1">
            {r.evidence.slice(0, 3).map((file) => (
              <a
                key={file.url}
                href={file.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="border-border hover:border-foreground/30 block size-9 overflow-hidden rounded border transition-colors"
              >
                {/* Plain <img>: user uploads on arbitrary storage hosts, which
                    next/image would need configuring per domain. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={file.url} alt={file.originalFilename} className="size-full object-cover" />
              </a>
            ))}
            {r.evidence.length > 3 && (
              <span className="text-muted-foreground self-center text-xs">
                +{r.evidence.length - 3}
              </span>
            )}
          </div>
        ),
    },
    {
      id: "actions",
      header: <span className="sr-only">{t("admin.actions.label")}</span>,
      className: "w-10",
      // Only a PENDING column can be acted on, so the menu simply isn't offered
      // otherwise — the service would refuse anyway.
      cell: (r) =>
        r.status !== "PENDING" ? null : (
          <Can permission="transactions.approve">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label={`${t("admin.actions.for")} ${r.publicId}`}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setActing({ column: r, mode: "approve" })}>
                  {t("finance.approve")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setActing({ column: r, mode: "reject" })}
                >
                  {t("finance.reject")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Can>
        ),
    },
  ];

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        rowId={(r) => String(r.id)}
        loading={params.pending}
        empty={hasFilters ? t("finance.emptyFiltered") : t("finance.empty")}
        toolbar={
          <DataTableToolbar
            search={params.get("q")}
            onSearchChange={(v) => params.setFilter("q", v)}
            searchPlaceholder={t("finance.search")}
            hasFilters={hasFilters}
            onClearFilters={() => params.clearFilters(["q", "type", "status"])}
            filters={
              <>
                <Select
                  value={type || "all"}
                  onValueChange={(v) => params.setFilter("type", v === "all" ? "" : String(v))}
                >
                  <SelectTrigger className="w-40" aria-label={t("finance.colType")}>
                    <SelectValue>
                      {type ? t(`finance.types.${type}`) : t("finance.allTypes")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("finance.allTypes")}</SelectItem>
                    {TYPES.map((x) => (
                      <SelectItem key={x} value={x}>
                        {t(`finance.types.${x}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={status || "all"}
                  onValueChange={(v) => params.setFilter("status", v === "all" ? "" : String(v))}
                >
                  <SelectTrigger className="w-36" aria-label={t("finance.colStatus")}>
                    <SelectValue>
                      {status ? t(`finance.statuses.${status}`) : t("finance.allStatuses")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("finance.allStatuses")}</SelectItem>
                    {STATUSES.map((x) => (
                      <SelectItem key={x} value={x}>
                        {t(`finance.statuses.${x}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
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

      {acting && (
        <ApproveDialog
          transaction={acting.column}
          mode={acting.mode}
          open
          onOpenChange={(o) => !o && setActing(null)}
        />
      )}
    </>
  );
}
