"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Star, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResponsiveDialog } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addWarehouseMemberAction,
  removeWarehouseMemberAction,
  listWarehouseStaffAction,
} from "@/modules/inventory/warehouses/actions";

import type { WarehouseRow } from "./warehouse-dialog";

type Member = { userId: string; name: string; email: string; isPrimary: boolean };
type Candidate = { id: string; name: string | null; email: string };

/**
 * Staff assigned to a customer.
 *
 * Membership is many-to-many, which is the whole point of the model: the legacy
 * system tied a site to a single user account, so two people could never share
 * one customer's queue. "Primary" marks someone's home site and drives their
 * landing view; only one can hold it.
 */
export function WarehouseMembersDialog({
  customer,
  open,
  onOpenChange,
}: {
  customer: WarehouseRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    listWarehouseStaffAction(customer.id).then((res) => {
      setMembers(res.members);
      setCandidates(res.candidates);
    });

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer.id]);

  const run = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await fn();
      await load();
      router.refresh();
      toast.success(message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  // Someone already on the team shouldn't appear in the "add" list.
  const assignable = candidates.filter(
    (c) => !members?.some((m) => m.userId === c.id),
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${t("admin.warehouses.staffTitle")} — ${customer.name}`}
      description={t("admin.warehouses.staffDesc")}
    >
      <div className="flex flex-col gap-4 py-2">
          <div className="flex gap-2">
            <Select value={picked} onValueChange={(v) => setPicked(v ?? "")}>
              <SelectTrigger className="flex-1" aria-label={t("admin.warehouses.staffAdd")}>
                <SelectValue>
                  {picked
                    ? (assignable.find((c) => c.id === picked)?.name ??
                      assignable.find((c) => c.id === picked)?.email ??
                      "Select…")
                    : t("admin.warehouses.staffAdd")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {assignable.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    {t("admin.warehouses.staffNone")}
                  </SelectItem>
                ) : (
                  assignable.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name || c.email}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              disabled={!picked || busy}
              onClick={() =>
                run(
                  () => addWarehouseMemberAction(customer.id, picked, false),
                  t("admin.warehouses.staffAdded"),
                ).then(() => setPicked(""))
              }
            >
              {t("admin.warehouses.staffAddBtn")}
            </Button>
          </div>

          {members === null ? (
            <p className="text-muted-foreground text-sm">{t("admin.warehouses.staffLoading")}</p>
          ) : members.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("admin.warehouses.staffEmpty")}
            </p>
          ) : (
            <ul className="border-border divide-y rounded-md border">
              {members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.name || m.email}</p>
                    <p className="text-muted-foreground truncate text-xs">{m.email}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {m.isPrimary ? (
                      <Badge product="secondary" className="gap-1">
                        <Star className="size-3" /> {t("admin.warehouses.staffPrimary")}
                      </Badge>
                    ) : (
                      <Button
                        product="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => addWarehouseMemberAction(customer.id, m.userId, true),
                            t("admin.warehouses.staffSetPrimary"),
                          )
                        }
                      >
                        {t("admin.warehouses.staffMakePrimary")}
                      </Button>
                    )}
                    <Button
                      product="ghost"
                      size="icon"
                      aria-label={`${t("admin.warehouses.staffRemove")} ${m.email}`}
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => removeWarehouseMemberAction(customer.id, m.userId),
                          t("admin.warehouses.staffRemoved"),
                        )
                      }
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </div>
    </ResponsiveDialog>
  );
}
