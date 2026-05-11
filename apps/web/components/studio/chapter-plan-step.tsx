"use client";

import type {
  ChapterReadinessIssue,
  ChapterStudioData,
  ChapterStudioStep,
  EstimateCanonicalProductionPlan,
} from "@manga-ai-studio/core";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OutlineProgressionIssue } from "@/lib/outline-progression-guard";
import { PremiumPlanSceneOverview } from "./premium-plan-scene-overview";
import { ProductionPlanCard } from "./production-plan-card";
import { ChapterScriptDialoguesPanel } from "./chapter-script-dialogues-panel";
import { StudioInlineIssues } from "./studio-inline-issues";
import { BeatList } from "./chapter-plan/beat-list";
import { ChapterVisualContractReadout } from "./chapter-plan/chapter-visual-contract-readout";
import { LegacyMetricsCard } from "./chapter-plan/legacy-metrics-card";
import { NarrativeDirectionCard } from "./chapter-plan/narrative-direction-card";
import { PlanStatusCard } from "./chapter-plan/plan-status-card";

export interface ChapterPlanStepProps {
  draft: ChapterStudioData;
  /** Snapshot `chapter.outline.chapterVisualContract` (GET studio). */
  chapterVisualContract?: unknown;
  preparationScore: number;
  issues: ChapterReadinessIssue[];
  warningItems: ChapterReadinessIssue[];
  generatingOutline: boolean;
  imageCounts: {
    estimatedImages: number;
    targetImages: number;
    minimumImages: number;
    missingImages: number;
  };
  progressionIssues?: OutlineProgressionIssue[];
  onIssueAction: (issue: ChapterReadinessIssue) => void | Promise<void>;
  onUpdateDraft: (next: ChapterStudioData, step?: ChapterStudioStep) => void;
  onGenerateOutlines: () => void | Promise<void>;
  onValidatePlan: () => void;
  onRewriteBeat?: (beatId: string, instructions: string) => void | Promise<void>;
  rewritingBeat?: boolean;
  /** P1.2 — personnages projet pour ancrer les bulles (characterId). */
  characterCatalog?: Array<{ id: string; name: string; roleType?: string | null }>;
}

export function ChapterPlanStep({
  draft,
  chapterVisualContract,
  preparationScore,
  issues,
  warningItems,
  generatingOutline,
  imageCounts,
  progressionIssues,
  onIssueAction,
  onUpdateDraft,
  onGenerateOutlines,
  onValidatePlan,
  onRewriteBeat,
  rewritingBeat,
  characterCatalog,
}: ChapterPlanStepProps) {
  const hasOutline =
    (draft.editorialOutline?.beats?.length ?? 0) > 0 ||
    (draft.productionOutline?.beats?.length ?? 0) > 0;

  // P1.3 — wording produit : "Valider le plan" était ambigu (on pouvait le
  // comprendre comme "prêt à générer" alors qu'il manque parfois des
  // blueprints). On distingue explicitement deux choses :
  //   1) Outline éditorial validé (déroulé narratif OK)
  //   2) Contrat images complet (panelBlueprints.length >= minimumImages)
  const hasProductionPlan = Boolean(draft.productionPlan);
  const panelBlueprintCount = Array.isArray(draft.productionPlan?.panelBlueprints)
    ? draft.productionPlan.panelBlueprints.length
    : 0;
  const minimumImages =
    imageCounts.minimumImages ?? draft.productionPlan?.minimumImages ?? 0;
  const contractComplete =
    hasProductionPlan && panelBlueprintCount >= minimumImages && minimumImages > 0;
  const outlineValidated = hasOutline;
  const canonicalPlan: EstimateCanonicalProductionPlan | null | undefined =
    draft.estimateContext?.canonicalProductionPlan ?? undefined;

  const canonicalMetrics =
    canonicalPlan && typeof canonicalPlan.metrics === "object" && canonicalPlan.metrics !== null
      ? (canonicalPlan.metrics as Record<string, unknown>)
      : null;

  return (
    <div data-studio-section="plan" className="space-y-6">
      {chapterVisualContract ? (
        <ChapterVisualContractReadout snapshot={chapterVisualContract} />
      ) : null}

      {/* UX-FIX-4 : CTA proéminent si outline absente */}
      {!hasOutline && !generatingOutline ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-violet-500/40 bg-violet-500/5 py-12 text-center">
          <Sparkles className="h-8 w-8 text-violet-400/60" />
          <div className="space-y-1">
            <p className="text-lg font-medium">L&apos;outline n&apos;est pas encore générée</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Clique ci-dessous pour que l&apos;IA génère l&apos;outline éditorial, l&apos;outline
              de production et le plan complet du chapitre.
            </p>
          </div>
          <Button
            size="lg"
            type="button"
            onClick={() => void onGenerateOutlines()}
            className="mt-2 gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Générer outline &amp; plan de production
          </Button>
        </div>
      ) : null}

      {generatingOutline ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/40 bg-card/20 py-10 text-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">
            Génération en cours — cela peut prendre 30–60 secondes…
          </p>
        </div>
      ) : null}

      <NarrativeDirectionCard draft={draft} onUpdateDraft={onUpdateDraft} />

      {progressionIssues && progressionIssues.length > 0 ? (
        <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-center gap-2 text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p className="text-sm font-medium">Le plan détaillé semble répétitif</p>
          </div>
          <ul className="space-y-1 pl-6 text-xs text-amber-300/90">
            {progressionIssues.slice(0, 3).map((issue, i) => (
              <li key={i}>· {issue.message}</li>
            ))}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-amber-500/30 text-amber-200 hover:bg-amber-500/20"
            onClick={() => void onGenerateOutlines()}
            disabled={generatingOutline}
          >
            {generatingOutline ? "Régénération…" : "Régénérer la seconde moitié"}
          </Button>
        </div>
      ) : null}

      {hasOutline ? (
        <div className="rounded-xl border border-border/40 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Résumé macro</span> — valide le déroulé
          global du chapitre.{" "}
          <span className="font-medium text-foreground">Découpage détaillé</span> — utilisé par
          l&apos;IA pour générer les pages, les panels et les dialogues.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <BeatList
          title="Résumé du chapitre (5 grands temps)"
          subtitle="Version courte pour valider le déroulé global."
          emptyLabel="Aucun résumé généré."
          beats={draft.editorialOutline?.beats}
          defaultCollapsed={
            (draft.productionOutline?.beats?.length ?? 0) >
            (draft.editorialOutline?.beats?.length ?? 0)
          }
          onRewriteBeat={onRewriteBeat}
          rewriting={rewritingBeat}
        />
        <BeatList
          title="Découpage détaillé pour la génération"
          subtitle="Version complète utilisée par l'IA pour produire les images."
          emptyLabel="Aucun plan détaillé généré."
          beats={draft.productionOutline?.beats}
          onRewriteBeat={onRewriteBeat}
          rewriting={rewritingBeat}
        />
      </div>

      <ProductionPlanCard
        plan={draft.productionPlan}
        canonicalProductionPlan={canonicalPlan ?? null}
      />

      <PremiumPlanSceneOverview
        draft={draft}
        onRewriteBeat={onRewriteBeat}
        rewritingBeat={rewritingBeat}
      />

      <ChapterScriptDialoguesPanel
        draft={draft}
        characterCatalog={characterCatalog ?? []}
        onUpdateDraft={(next) => onUpdateDraft(next, "production_plan")}
      />

      <LegacyMetricsCard
        productionPlan={draft.productionPlan}
        canonicalPlan={canonicalPlan ?? null}
      />

      <PlanStatusCard
        preparationScore={preparationScore}
        outlineValidated={outlineValidated}
        hasProductionPlan={hasProductionPlan}
        contractComplete={contractComplete}
        panelBlueprintCount={panelBlueprintCount}
        minimumImages={minimumImages}
        generatingOutline={generatingOutline}
        imageCounts={imageCounts}
        canonicalPlan={canonicalPlan ?? null}
        canonicalMetrics={canonicalMetrics}
        onGenerateOutlines={onGenerateOutlines}
        onValidatePlan={onValidatePlan}
      />

      <StudioInlineIssues
        title="Points à corriger"
        issues={issues}
        emptyLabel="Aucun blocant : le plan peut partir en génération."
        testIdPrefix={null}
        onAction={onIssueAction}
      />
      <StudioInlineIssues
        title="Points à surveiller"
        issues={warningItems}
        tone="neutral"
        testIdPrefix={null}
        onAction={onIssueAction}
      />
    </div>
  );
}
