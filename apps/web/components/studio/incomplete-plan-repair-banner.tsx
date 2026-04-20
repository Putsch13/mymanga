"use client";

import { AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * P1.4 — Bannière de réparation guidée pour les chapitres dont le contrat
 * images est incomplet. On la garde persistante en haut de l'éditeur studio
 * tant que `contractStatus !== "ok"` ou que `launchBlocked === true` pour la
 * raison `incomplete_plan` / `missing_blueprints`.
 *
 * Objectif UX : transformer un état d'erreur silencieux (ex. "52/75
 * blueprints" invisible dans l'UI) en un appel à l'action clair "Régénérer
 * le plan" sans perdre les autres données du chapitre.
 *
 * L'existant `ChapterOnboardingBanner` reste réservé à l'onboarding (premier
 * chapitre / pas de personnages). Les deux peuvent cohabiter.
 */
export function IncompletePlanRepairBanner({
  contractStatus,
  panelBlueprintCount,
  minimumImages,
  generatingOutline,
  onRegeneratePlan,
}: {
  contractStatus: "ok" | "missing_production_plan" | "missing_blueprints" | "incomplete_blueprints" | undefined;
  panelBlueprintCount: number | undefined;
  minimumImages: number | undefined;
  generatingOutline: boolean;
  onRegeneratePlan: () => void | Promise<void>;
}) {
  if (
    !contractStatus ||
    contractStatus === "ok" ||
    contractStatus === "missing_production_plan"
  ) {
    return null;
  }

  const count = panelBlueprintCount ?? 0;
  const minimum = minimumImages ?? 75;
  const isEmpty = contractStatus === "missing_blueprints" || count === 0;

  const message = isEmpty
    ? `Ce chapitre n'a aucun blueprint de panel (minimum requis ${minimum}). La génération n'est pas lançable : régénère le plan pour reconstruire un contrat de production valide.`
    : `Ce chapitre utilise un plan incomplet (${count}/${minimum} blueprints). La génération n'est pas lançable : régénère le plan pour rétablir un contrat images valide — tes données canon et narratives ne sont pas perdues.`;

  return (
    <div
      data-testid="incomplete-plan-repair-banner"
      data-contract-status={contractStatus}
      className="relative flex flex-col gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100 sm:flex-row sm:items-start"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-red-300" aria-hidden />
        <div className="space-y-1">
          <p className="font-medium">Contrat de génération incomplet</p>
          <p className="text-xs leading-relaxed text-red-200/90">{message}</p>
        </div>
      </div>
      <div className="sm:ml-auto">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-red-500/40 bg-red-500/10 text-red-100 hover:bg-red-500/20"
          disabled={generatingOutline}
          onClick={() => void onRegeneratePlan()}
          data-testid="incomplete-plan-repair-banner-action"
        >
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          {generatingOutline ? "Régénération…" : "Régénérer le plan"}
        </Button>
      </div>
    </div>
  );
}
