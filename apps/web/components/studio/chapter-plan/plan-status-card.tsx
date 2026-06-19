/**
 * Carte "État du chapitre avant génération" — synthèse + boutons d'action.
 *
 * P1.3 — wording produit : on distingue explicitement deux choses :
 *   1) Outline éditorial validé (déroulé narratif OK)
 *   2) Contrat images complet (panelBlueprints.length >= minimumImages)
 *
 * P8 — 3 états possibles pour le badge "Contrat images" :
 *   1) Plan vide                     → danger (bloquant)
 *   2) Plan hors range premium       → danger (bloquant)
 *   3) Plan natif dans la range 70-75 → success
 */
"use client";

import type { EstimateCanonicalProductionPlan } from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface PlanStatusCardProps {
  preparationScore: number;
  outlineValidated: boolean;
  hasProductionPlan: boolean;
  contractComplete: boolean;
  panelBlueprintCount: number;
  minimumImages: number;
  generatingOutline: boolean;
  imageCounts: {
    estimatedImages: number;
    targetImages: number;
    minimumImages: number;
    missingImages: number;
  };
  canonicalPlan: EstimateCanonicalProductionPlan | null;
  canonicalMetrics: Record<string, unknown> | null;
  onGenerateOutlines: () => void | Promise<void>;
  onValidatePlan: () => void;
}

export function PlanStatusCard(props: PlanStatusCardProps) {
  const {
    preparationScore,
    outlineValidated,
    hasProductionPlan,
    contractComplete,
    panelBlueprintCount,
    minimumImages,
    generatingOutline,
    imageCounts,
    canonicalPlan,
    canonicalMetrics,
    onGenerateOutlines,
    onValidatePlan,
  } = props;

  const isEmpty = hasProductionPlan && panelBlueprintCount === 0;
  const isOutOfRange = hasProductionPlan && panelBlueprintCount > 0 && !contractComplete;

  return (
    <Card
      className="border-border/60 bg-card/40"
      data-studio-field="studio-plan-contract-overview"
    >
      <CardHeader>
        <CardTitle className="text-base">État du chapitre avant génération</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2" data-testid="plan-step-statuses">
          <OutlineStatusBadge outlineValidated={outlineValidated} />
          <ContractStatusBadge
            contractComplete={contractComplete}
            isEmpty={isEmpty}
            isOutOfRange={isOutOfRange}
            panelBlueprintCount={panelBlueprintCount}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <div>
            <p className="text-muted-foreground">Préparation</p>
            <p>{preparationScore}/100</p>
          </div>
          {canonicalPlan ? (
            <>
              <div>
                <p className="text-muted-foreground">Panels (canonique)</p>
                <p>{canonicalPlan.panelCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Pages (canonique)</p>
                <p>
                  {typeof canonicalMetrics?.totalPages === "number"
                    ? canonicalMetrics.totalPages
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Beats</p>
                <p>{canonicalPlan.beatCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Format</p>
                <p className="capitalize">{canonicalPlan.format}</p>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-muted-foreground">Images estimées</p>
                <p>{imageCounts.estimatedImages}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Images cibles</p>
                <p>{imageCounts.targetImages}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Cible indicative</p>
                <p>{imageCounts.minimumImages}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Manquantes</p>
                <p>{imageCounts.missingImages}</p>
              </div>
            </>
          )}
        </div>

        {/* P8 — blocants stricts : plan vide OU plan hors range 70-75. */}
        {isEmpty ? (
          <div
            data-testid="plan-step-contract-hint"
            className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200"
          >
            Le plan ne contient aucun blueprint de panel. La génération n&apos;est pas lançable —
            régénère le plan avant validation.
          </div>
        ) : null}
        {isOutOfRange ? (
          <div
            data-testid="plan-step-out-of-range-hint"
            className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200"
          >
            Le découpage natif produit <strong>{panelBlueprintCount} panels</strong>, hors de la
            range premium <strong>70–75</strong>. La génération est <strong>bloquée</strong> :
            régénère un plan à densité correcte avant de lancer la pipeline.
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void onGenerateOutlines()}
            disabled={generatingOutline}
          >
            {generatingOutline ? "Génération..." : "Régénérer le plan"}
          </Button>
          <Button
            type="button"
            onClick={onValidatePlan}
            data-testid="plan-step-validate"
            aria-disabled={hasProductionPlan && !contractComplete ? true : undefined}
            title={
              hasProductionPlan && !contractComplete
                ? `Contrat incomplet (${panelBlueprintCount}/${minimumImages}) — régénère le plan avant validation.`
                : undefined
            }
          >
            Valider le plan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OutlineStatusBadge({ outlineValidated }: { outlineValidated: boolean }) {
  return (
    <span
      data-testid="plan-status-outline"
      data-tone={outlineValidated ? "success" : "muted"}
      className={
        outlineValidated
          ? "inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200"
          : "inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground"
      }
    >
      {outlineValidated ? "✓ Outline validé" : "○ Outline à générer"}
    </span>
  );
}

function ContractStatusBadge(props: {
  contractComplete: boolean;
  isEmpty: boolean;
  isOutOfRange: boolean;
  panelBlueprintCount: number;
}) {
  const { contractComplete, isEmpty, isOutOfRange, panelBlueprintCount } = props;
  const tone = contractComplete ? "success" : isEmpty || isOutOfRange ? "danger" : "muted";
  const className =
    tone === "success"
      ? "inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200"
      : tone === "danger"
        ? "inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-200"
        : "inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground";
  const label = isEmpty
    ? "⚠ Plan vide — régénère"
    : isOutOfRange
      ? `⚠ Plan hors range 70-75 (${panelBlueprintCount}) — régénère`
      : contractComplete
        ? `✓ Contrat images complet (${panelBlueprintCount})`
        : "○ Contrat images à générer";
  return (
    <span data-testid="plan-status-contract" data-tone={tone} className={className}>
      {label}
    </span>
  );
}
