/**
 * The team picker.
 *
 * Extracted from the sidebar because the sheet is now the MOBILE nav only —
 * left where it was, a desktop user would have no way to reach it. It renders
 * in two places with two shapes: `variant="block"` is the full-width row the
 * sheet header wants, `variant="row"` is the compact row the desktop avatar
 * menu wants. One component so the team you picked is the team you see.
 *
 * ponytail: TEAMS is dummy data — wire to a real teams table later, at which
 * point the selection needs to live somewhere other than component state.
 */

"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n";

const TEAMS = [
  { id: "personal", name: "HoangMh's projects", plan: "Hobby" },
  { id: "gwprint", name: "GWPrintz", plan: "Pro" },
];

export function TeamSwitcher({ variant = "block" }: { variant?: "block" | "row" }) {
  const { t } = useTranslation();
  const [teamId, setTeamId] = useState(TEAMS[0].id);
  const team = TEAMS.find((x) => x.id === teamId) ?? TEAMS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className={
              variant === "block"
                ? "flex w-full items-center gap-2 rounded-(--radius-card) border border-(--border-hairline) p-2 text-left transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-sky-100 focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
                : "flex w-full items-center gap-2 rounded-(--radius-control) px-2 py-1.5 text-left transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-sky-100 focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
            }
          />
        }
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-(--radius-pill) bg-sky-200 text-(length:--fs-micro) font-semibold text-navy-700">
          {team.name[0]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-sans text-(length:--fs-body-sm) font-semibold text-navy-700">
            {team.name}
          </span>
        </span>
        <Badge variant="secondary" className="shrink-0">
          {team.plan}
        </Badge>
        <ChevronsUpDown className="size-4 shrink-0 text-(--icon-muted)" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuGroup>
          {TEAMS.map(({ id, name, plan }) => (
            <DropdownMenuItem key={id} onClick={() => setTeamId(id)}>
              <span className="mr-1 flex size-5 items-center justify-center rounded-(--radius-pill) bg-sky-200 text-(length:--fs-micro) font-semibold text-navy-700">
                {name[0]}
              </span>
              <span className="flex-1 truncate">{name}</span>
              <span className="text-(length:--fs-meta) text-(--text-muted)">{plan}</span>
              {id === teamId && <Check className="size-4 stroke-navy-700" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Plus className="size-4" />
          <span>{t("sidebar.createTeam")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
