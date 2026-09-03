"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/global/form";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import {
  activateBomAction,
  createBomAction,
  deleteBomAction,
  duplicateBomAction,
  getBomAction,
  listVersionsAction,
  previewConsumptionAction,
  updateBomAction,
} from "@/modules/inventory/boms/actions";

import type { MaterialOption, SiteOption } from "./boms-table";

const STAGES = ["PRODUCTION", "PACKING", "SHIPPING", "OTHER"] as const;
const STATUSES = ["DRAFT", "ACTIVE", "INACTIVE"] as const;

type DraftLine = {
  materialId: string;
  componentSku: string;
  quantityPerUnit: string;
  unit: string;
  /** PERCENT in the form, rate in the database. Converted on save and load. */
  wastagePercent: string;
  stage: string;
  required: boolean;
};

const emptyLine = (): DraftLine => ({
  materialId: "",
  componentSku: "",
  quantityPerUnit: "1",
  unit: "pcs",
  wastagePercent: "0",
  stage: "PRODUCTION",
  required: true,
});

type Version = { id: number; name: string; version: number; status: string };

/**
 * One dialog for the whole recipe: its versions down the left, its lines in the
 * middle, and what making N of them would need on the right.
 *
 * The preview calls the SAME explode the reservation uses, so what it promises
 * and what assignment does cannot drift apart.
 */
export function BomDialog({
  variantId,
  variantLabel,
  bomId,
  suppliers,
  sites,
  open,
  onOpenChange,
}: {
  variantId: number;
  variantLabel: string;
  /** Omit to start a new draft for this product. */
  bomId?: number;
  suppliers: MaterialOption[];
  sites: SiteOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();

  const [currentId, setCurrentId] = useState<number | undefined>(bomId);
  const [versions, setVersions] = useState<Version[]>([]);
  const [name, setName] = useState(`${variantLabel} BOM`);
  const [status, setStatus] = useState("DRAFT");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  const [previewQty, setPreviewQty] = useState("1");
  const [previewSite, setPreviewSite] = useState(String(sites[0]?.id ?? ""));
  const [preview, setPreview] = useState<
    { sku: string; required: number; available: number; shortage: number; mappingStatus: string }[]
  >([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listVersionsAction(variantId).then((v) => !cancelled && setVersions(v));
    if (currentId) {
      getBomAction(currentId).then((bom) => {
        if (cancelled) return;
        setName(bom.name);
        setStatus(bom.status);
        setLines(
          bom.lines.length
            ? bom.lines.map((l) => ({
                materialId: l.materialId ? String(l.materialId) : "",
                componentSku: l.componentSku,
                quantityPerUnit: String(l.quantityPerUnit),
                unit: l.unit,
                // Rate → percent for display; the reverse happens on save.
                wastagePercent: String(Number(l.wastageRate) * 100),
                stage: l.stage,
                required: l.required,
              }))
            : [emptyLine()],
        );
      });
    }
    return () => {
      cancelled = true;
    };
  }, [open, variantId, currentId]);

  const patchLine = (index: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  const payload = () => ({
    name,
    status,
    lines: lines
      .filter((l) => l.materialId || l.componentSku)
      .map((l, index) => ({
        materialId: l.materialId ? Number(l.materialId) : null,
        componentSku:
          l.componentSku || suppliers.find((m) => String(m.id) === l.materialId)?.sku || "—",
        quantityPerUnit: Number(l.quantityPerUnit) || 0,
        unit: l.unit,
        wastageRate: (Number(l.wastagePercent) || 0) / 100,
        stage: l.stage,
        required: l.required,
        sortOrder: index,
      })),
  });

  const run = (fn: () => Promise<{ ok?: boolean; error?: string } | unknown>, okMessage: string) =>
    startTransition(async () => {
      const result = (await fn()) as { ok?: boolean; error?: string; id?: number };
      if (result?.ok === false && result.error) {
        toast.error(
          t(`inventory.boms.errors.${result.error}`) === `inventory.boms.errors.${result.error}`
            ? t(`inventory.errors.${result.error}`)
            : t(`inventory.boms.errors.${result.error}`),
        );
        return;
      }
      toast.success(okMessage);
      if (result?.id) setCurrentId(result.id);
      setVersions(await listVersionsAction(variantId));
      router.refresh();
    });

  const onSave = () =>
    run(
      () => (currentId ? updateBomAction(currentId, payload()) : createBomAction(variantId, payload())),
      t(currentId ? "inventory.boms.updated" : "inventory.boms.created"),
    );

  const runPreview = () =>
    startTransition(async () => {
      const result = (await previewConsumptionAction({
        productVariantId: variantId,
        quantity: Number(previewQty) || 1,
        warehouseId: Number(previewSite) || undefined,
      })) as { lines?: typeof preview };
      setPreview(result?.lines ?? []);
    });

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("inventory.boms.dialog.title")}
      description={variantLabel}
      className="sm:max-w-5xl"
    >
      <div className="flex flex-col gap-4 lg:flex-column">
        {/* Versions */}
        <aside className="flex shrink-0 flex-col gap-1 lg:w-40">
          <p className="text-muted-foreground text-xs font-medium">
            {t("inventory.boms.dialog.versions")}
          </p>
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setCurrentId(v.id)}
              className={cn(
                "flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                v.id === currentId ? "bg-accent" : "hover:bg-accent/50",
              )}
            >
              <span>v{v.version}</span>
              <Badge product={v.status === "ACTIVE" ? "default" : "secondary"}>
                {t(`inventory.boms.status.${v.status}`)}
              </Badge>
            </button>
          ))}
          <Button
            type="button"
            product="outline"
            size="sm"
            className="mt-1"
            onClick={() => {
              setCurrentId(undefined);
              setName(`${variantLabel} BOM`);
              setStatus("DRAFT");
              setLines([emptyLine()]);
            }}
          >
            {t("inventory.boms.dialog.newDraft")}
          </Button>
        </aside>

        {/* The recipe */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("inventory.boms.dialog.name")}
              className="min-w-40 flex-1"
            />
            <Select value={status} onValueChange={(v) => v && setStatus(v)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`inventory.boms.status.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            {lines.map((line, index) => (
              <div
                key={index}
                className="grid items-center gap-2 sm:grid-cols-[1fr_5rem_4rem_5rem_2.5rem]"
              >
                <Select
                  value={line.materialId}
                  onValueChange={(v) => {
                    if (!v) return;
                    // Choosing a material autofills the sku and unit, so the
                    // line still says what it wanted if it is ever unmapped.
                    const m = suppliers.find((mm) => String(mm.id) === v);
                    patchLine(index, {
                      materialId: v,
                      componentSku: m?.sku ?? line.componentSku,
                      unit: m?.uom ?? line.unit,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("inventory.boms.dialog.material")} />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.name} — {m.sku}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  type="number"
                  step="0.0001"
                  min={0}
                  value={line.quantityPerUnit}
                  onChange={(e) => patchLine(index, { quantityPerUnit: e.target.value })}
                  aria-label={t("inventory.boms.dialog.qtyPerUnit")}
                  className="tabular-nums"
                />
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={line.wastagePercent}
                  onChange={(e) => patchLine(index, { wastagePercent: e.target.value })}
                  aria-label={t("inventory.boms.dialog.wastage")}
                  className="tabular-nums"
                />
                <Select value={line.stage} onValueChange={(v) => v && patchLine(index, { stage: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`inventory.boms.stage.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-1">
                  <Checkbox
                    checked={line.required}
                    onCheckedChange={(c) => patchLine(index, { required: c === true })}
                    aria-label={t("inventory.boms.dialog.required")}
                  />
                  <Button
                    type="button"
                    product="ghost"
                    size="icon"
                    disabled={lines.length === 1}
                    onClick={() => setLines((ls) => ls.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              product="outline"
              size="sm"
              className="self-start"
              onClick={() => setLines((ls) => [...ls, emptyLine()])}
            >
              {t("inventory.boms.dialog.addLine")}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button disabled={pending} onClick={onSave}>
              {t("inventory.boms.dialog.save")}
            </Button>
            <Button
              product="outline"
              disabled={pending || !currentId || status === "ACTIVE"}
              onClick={() =>
                currentId &&
                run(() => activateBomAction(currentId), t("inventory.boms.activated"))
              }
            >
              {t("inventory.boms.dialog.activate")}
            </Button>
            <Button
              product="outline"
              disabled={pending || !currentId}
              onClick={() =>
                currentId &&
                run(() => duplicateBomAction(currentId), t("inventory.boms.duplicated"))
              }
            >
              {t("inventory.boms.dialog.duplicate")}
            </Button>
            <Button
              product="destructive"
              disabled={pending || !currentId}
              onClick={() =>
                currentId && run(() => deleteBomAction(currentId), t("inventory.boms.deleted"))
              }
            >
              {t("inventory.boms.dialog.delete")}
            </Button>
          </div>
        </div>

        {/* Preview */}
        <aside className="flex shrink-0 flex-col gap-2 lg:w-64">
          <p className="text-muted-foreground text-xs font-medium">
            {t("inventory.boms.dialog.preview")}
          </p>
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              value={previewQty}
              onChange={(e) => setPreviewQty(e.target.value)}
              aria-label={t("inventory.boms.dialog.previewQty")}
              className="w-20 tabular-nums"
            />
            {/* A picker, not a raw id: legacy made the floor type a customer
                number from memory. */}
            <Select value={previewSite} onValueChange={(v) => v && setPreviewSite(v)}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button product="outline" size="sm" disabled={pending} onClick={runPreview}>
            {t("inventory.boms.dialog.preview")}
          </Button>

          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 text-left">{t("inventory.boms.dialog.component")}</th>
                <th className="py-1 text-right">{t("inventory.boms.dialog.requiredQty")}</th>
                <th className="py-1 text-right">{t("inventory.boms.dialog.shortage")}</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((column) => (
                <tr key={column.sku} className="border-t">
                  <td className="py-1">
                    <span className="font-mono">{column.sku}</span>
                    {column.mappingStatus === "UNMAPPED" && (
                      <Badge product="secondary" className="ml-1">
                        {t("inventory.boms.dialog.unmapped")}
                      </Badge>
                    )}
                  </td>
                  <td className="py-1 text-right tabular-nums">{column.required}</td>
                  <td
                    className={cn(
                      "py-1 text-right tabular-nums",
                      column.shortage > 0 && "text-vercel-red font-medium",
                    )}
                  >
                    {column.shortage}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </aside>
      </div>
    </ResponsiveDialog>
  );
}
