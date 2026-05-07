"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, ClipboardList, XCircle } from "lucide-react";
import type { PremiumReadinessDashboard } from "@/lib/readiness/build-premium-readiness-dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RepairActionButtons } from "./repair-action-buttons";

export function PremiumReadinessDashboardCard({
  dashboard,
  projectId,
  chapterId,
  characterId,
}: {
  dashboard: PremiumReadinessDashboard | null;
  projectId?: string;
  chapterId?: string;
  characterId?: string;
}) {
  if (!dashboard) return null;

  const tone =
    dashboard.status === "ready"
      ? "border-green-500/25 bg-green-500/5"
      : dashboard.status === "warning"
        ? "border-amber-500/25 bg-amber-500/5"
        : "border-red-500/25 bg-red-500/5";

  const Icon =
    dashboard.status === "ready" ? CheckCircle2 : dashboard.status === "warning" ? AlertTriangle : XCircle;

  const blocked = dashboard.issues.filter((i) => i.severity === "blocked");
  const warned = dashboard.issues.filter((i) => i.severity === "warning");

  return (
    <Card
      className={`border-border/60 ${tone}`}
      data-testid="premium-readiness-dashboard"
      data-studio-field="studio-premium-readiness-dashboard"
    >
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="h-4 w-4 shrink-0" />
          Checklist premium et contrats
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Icon
              className={`h-5 w-5 shrink-0 ${
                dashboard.status === "ready"
                  ? "text-green-400"
                  : dashboard.status === "warning"
                    ? "text-amber-400"
                    : "text-red-400"
              }`}
            />
            <span className="font-medium">
              {dashboard.status === "ready"
                ? "Prêt côté contrats"
                : dashboard.status === "warning"
                  ? "Quelques avertissements"
                  : "Blocages à corriger"}
            </span>
          </div>
          <span className="rounded-full border border-border/60 bg-background/50 px-2.5 py-0.5 text-xs text-muted-foreground">
            Score {Math.round(dashboard.score)} / 100
          </span>
        </div>

        {dashboard.dialogueQaSummary ? (
          <p className="text-xs text-muted-foreground">
            QA dialogues :{" "}
            {dashboard.dialogueQaSummary.valid ? (
              <span className="text-green-600 dark:text-green-400">OK</span>
            ) : (
              <>
                <span className="text-amber-600 dark:text-amber-400">
                  {dashboard.dialogueQaSummary.blockingCount} bloquant(s)
                </span>
                {dashboard.dialogueQaSummary.warningCount > 0 ? (
                  <span>
                    , {dashboard.dialogueQaSummary.warningCount} avertissement(s)
                  </span>
                ) : null}
              </>
            )}
            <span className="text-muted-foreground">
              {" "}
              — lisibilité manga{" "}
              {Math.round((dashboard.dialogueQaSummary.scores.mangaReadabilityScore ?? 0) * 100)} %, ancrage speakers{" "}
              {Math.round((dashboard.dialogueQaSummary.scores.speakerAnchorScore ?? 0) * 100)} %
            </span>
          </p>
        ) : null}

        {blocked.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-red-200/90">Bloquants</p>
            <ul className="space-y-2">
              {blocked.map((issue, i) => (
                <li
                  key={`${issue.code}-${i}`}
                  className="flex flex-col gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-red-50">{issue.message}</p>
                      <p className="mt-0.5 text-[11px] text-red-200/70">{issue.code}</p>
                    </div>
                    {issue.fixAction?.href ? (
                      <Button asChild size="sm" variant="outline" className="shrink-0 border-red-400/40 text-red-100">
                        <Link href={issue.fixAction.href}>{issue.fixAction.label}</Link>
                      </Button>
                    ) : null}
                  </div>
                  {projectId && chapterId ? (
                    <RepairActionButtons
                      blockerCodes={[issue.code]}
                      context={{ projectId, chapterId, characterId }}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {warned.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-200/90">Avertissements</p>
            <ul className="space-y-1.5 text-xs text-amber-100/90">
              {warned.slice(0, 12).map((issue, i) => (
                <li key={`w-${issue.code}-${i}`} className="flex flex-wrap items-center gap-2">
                  <span>· {issue.message}</span>
                  {issue.fixAction?.href ? (
                    <Link href={issue.fixAction.href} className="text-amber-300 underline underline-offset-2">
                      {issue.fixAction.label}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
            {warned.length > 12 ? (
              <p className="text-[11px] text-muted-foreground">+ {warned.length - 12} autre(s)…</p>
            ) : null}
          </div>
        ) : null}

        {dashboard.status === "ready" && blocked.length === 0 && warned.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aucun problème détecté par la checklist premium (intention, monde visuel, couverture, dialogue, stack).
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
