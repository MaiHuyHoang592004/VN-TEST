"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { usePermissions } from "@/hooks/use-permissions";
import { USER_ROLES } from "@opcreative/shared";
import { useTranslation } from "@/lib/i18n";

import { InviteUserDialog } from "./invite-user-dialog";
import { EditUserDialog } from "./edit-user-dialog";
import { BalanceDialog, type BalanceMode } from "./balance-dialog";
import { UserStatusDialog, type StatusAction } from "./user-status-dialog";

export type UserRow = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  avatarUrl: string | null;
  roles: string[];
  status: string;
  tier: number | null;
  balance: string;
  lastLoginAt: string | null;
  createdAt: string;
};

const STATUSES = ["ACTIVE", "INACTIVE", "BANNED"];

/** Base UI resolves a Select's label from its items, which live in a portal and
 * aren't server-rendered — so the trigger would show blank until first opened.
 * Passing the label explicitly keeps the current filter visible on load. */

export function UsersTable({
  rows,
  total,
}: {
  rows: UserRow[];
  total: number;
}) {
  const params = useTableParams();
  const { can } = usePermissions();
  const { t } = useTranslation();
  // Role and status codes are enum values, not prose — translate for display.
  const roleLabel = (r: string) => t(`admin.roles.${r}`);
  const statusLabel = (v: string) => t(`admin.statuses.${v}`);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [balance, setBalance] = useState<{ user: UserRow; mode: BalanceMode } | null>(null);
  const [statusChange, setStatusChange] = useState<{ user: UserRow; action: StatusAction } | null>(null);

  const showBalance = can("users.balance.manage");

  const columns: Column<UserRow>[] = [
    {
      id: "name",
      header: t("admin.users.colUser"),
      sortable: true,
      cell: (u) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="size-7">
            <AvatarImage src={u.avatarUrl || u.image || undefined} alt="" />
            <AvatarFallback className="text-xs">
              {(u.name || u.email).slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{u.name || "—"}</p>
            <p className="text-muted-foreground truncate text-xs">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      id: "roles",
      header: t("admin.users.colRoles"),
      cell: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.roles.map((r) => (
            <Badge key={r} product="secondary" className="text-[11px]">
              {roleLabel(r)}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      id: "status",
      header: t("admin.users.colStatus"),
      cell: (u) => (
        <Badge product={u.status === "ACTIVE" ? "default" : "secondary"}>
          {statusLabel(u.status)}
        </Badge>
      ),
    },
    {
      id: "tier",
      header: t("admin.users.colTier"),
      hideOnMobile: true,
      cell: (u) => <span className="text-muted-foreground">{u.tier ?? "—"}</span>,
    },
    // Money is only rendered for people who may manage it — the query omits it
    // for everyone else, so there is nothing to leak even in the HTML.
    ...(showBalance
      ? [
          {
            id: "balance",
            header: t("admin.users.colBalance"),
            sortable: true,
            className: "text-right tabular-nums",
            cell: (u: UserRow) =>
              new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: "USD",
              }).format(Number(u.balance)),
          } satisfies Column<UserRow>,
        ]
      : []),
    {
      id: "lastLoginAt",
      header: t("admin.users.colLastSeen"),
      sortable: true,
      hideOnMobile: true,
      cell: (u) => (
        <span className="text-muted-foreground text-sm">
          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : t("admin.users.never")}
        </span>
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">{t("admin.actions.label")}</span>,
      className: "w-10",
      cell: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button product="ghost" size="icon" aria-label={`${t("admin.actions.for")} ${u.email}`}>
                <MoreHorizontal className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <Can permission="users.update">
              <DropdownMenuItem onClick={() => setEditing(u)}>{t("admin.actions.edit")}</DropdownMenuItem>
            </Can>
            <Can permission="users.balance.manage">
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setBalance({ user: u, mode: "TOPUP" })}>
                {t("admin.users.topUp")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBalance({ user: u, mode: "REFUND" })}>
                {t("admin.users.refund")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBalance({ user: u, mode: "ADJUST" })}>
                {t("admin.users.adjust")}
              </DropdownMenuItem>
            </Can>
            <Can permission="users.update">
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  setStatusChange({
                    user: u,
                    action: u.status === "ACTIVE" ? "DEACTIVATE" : "ACTIVATE",
                  })
                }
              >
                {u.status === "ACTIVE" ? t("admin.users.deactivate") : t("admin.users.activate")}
              </DropdownMenuItem>
            </Can>
            <Can permission="users.delete">
              <DropdownMenuItem
                product="destructive"
                onClick={() => setStatusChange({ user: u, action: "DELETE" })}
              >
                {t("admin.actions.delete")}
              </DropdownMenuItem>
            </Can>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const hasFilters = Boolean(params.get("q") || params.get("role") || params.get("status"));

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        rowId={(u) => u.id}
        loading={params.pending}
        sort={params.sort}
        onSortChange={params.setSort}
        selected={selected}
        onSelectedChange={setSelected}
        empty={hasFilters ? t("admin.users.emptyFiltered") : t("admin.users.empty")}
        toolbar={
          <DataTableToolbar
            search={params.get("q")}
            onSearchChange={(v) => params.setFilter("q", v)}
            searchPlaceholder={t("admin.users.search")}
            hasFilters={hasFilters}
            onClearFilters={() => params.clearFilters(["q", "role", "status"])}
            selectedCount={selected.size}
            filters={
              <>
                <Select
                  value={params.get("role") || "all"}
                  onValueChange={(v) => params.setFilter("role", v === "all" ? "" : (v ?? ""))}
                >
                  <SelectTrigger className="w-[9rem]" aria-label={t("admin.users.colRoles")}>
                    <SelectValue>
                      {params.get("role") ? roleLabel(params.get("role")) : t("admin.users.allRoles")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("admin.users.allRoles")}</SelectItem>
                    {USER_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {roleLabel(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={params.get("status") || "all"}
                  onValueChange={(v) => params.setFilter("status", v === "all" ? "" : (v ?? ""))}
                >
                  <SelectTrigger className="w-[8rem]" aria-label={t("admin.users.colStatus")}>
                    <SelectValue>
                      {params.get("status") ? statusLabel(params.get("status")) : t("admin.users.allStatuses")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("admin.users.allStatuses")}</SelectItem>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {statusLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
            actions={
              <Can permission="users.create">
                <Button onClick={() => setInviteOpen(true)}>{t("admin.users.invite")}</Button>
              </Can>
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
            selectedCount={selected.size}
          />
        }
      />

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      {editing && (
        <EditUserDialog user={editing} open onOpenChange={(o) => !o && setEditing(null)} />
      )}
      {balance && (
        <BalanceDialog
          user={balance.user}
          mode={balance.mode}
          open
          onOpenChange={(o) => !o && setBalance(null)}
        />
      )}
      {statusChange && (
        <UserStatusDialog
          user={statusChange.user}
          action={statusChange.action}
          open
          onOpenChange={(o) => !o && setStatusChange(null)}
        />
      )}
    </>
  );
}
