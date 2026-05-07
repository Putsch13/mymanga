"use client";

import { useState } from "react";
import type {
  ChapterReadinessIssue,
  ChapterStudioData,
  ChapterStudioStep,
  EstimateCanonicalProductionPlan,
} from "@manga-ai-studio/core";
import { AlertTriangle, Pencil, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FieldTooltip } from "@/components/ui/field-tooltip";
import { Label } from "@/components/ui/label";
import type { OutlineProgressionIssue } from "@/lib/outline-progression-guard";
import { NarrativeContractCard } from "./narrative-contract-card";
import { PremiumPlanSceneOverview } from "./premium-plan-scene-overview";
import { ProductionPlanCard } from "./production-plan-card";
import { ChapterScriptDialoguesPanel } from "./chapter-script-dialogues-panel";
import { StudioInlineIssues } from "./studio-inline-issues";

/**
 * BUG-09 : rendu éditable d'un beat unique.
 * Ouvre un formulaire inline quand l'utilisateur clique sur "✏️ Réécrire".
 * Le parent reçoit (beatId, instructions) et appelle autofill `rewrite_beat`.
 */
function BeatItem({
  beat,
  index,
  fallbackTitle,
  onRewriteBeat,
  rewriting,
}: {
  beat: { beatId?: string; label?: string; summary: string };
  index: number;
  fallbackTitle: string;
  onRewriteBeat?: (beatId: string, instructions: string) => void | Promise<void>;
  rewriting?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [instructions, setInstructions] = useState("");
  const canRewrite = Boolean(beat.beatId && onRewriteBeat);

  const handleSubmit = async () => {
    if (!beat.beatId || !onRewriteBeat) return;
    await onRewriteBeat(beat.beatId, instructions.trim());
    setEditing(false);
    setInstructions("");
  };

  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium">{beat.label ?? `Temps ${index + 1}`}</p>
          <p className="mt-1 text-muted-foreground">{beat.summary}</p>
        </div>
        {canRewrite && !editing ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0 gap-1 text-xs"
            onClick={() => setEditing(true)}
            disabled={rewriting}
            data-testid={`rewrite-beat-${beat.beatId}`}
          >
            <Pencil className="h-3 w-3" />
            Réécrire
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-2 border-t border-border/40 pt-2">
          <Label className="text-xs text-muted-foreground">
            Instructions (facultatif) — ex. « raccourcir », « ajouter un quiproquo entre X et Y »
          </Label>
          <textarea
            className="w-full rounded-md border border-border/60 bg-background/60 p-2 text-sm"
            rows={3}
            maxLength={500}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Précise ce que tu veux modifier dans ce temps…"
            disabled={rewriting}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setInstructions("");
              }}
              disabled={rewriting}
            >
              Annuler
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSubmit()}
              disabled={rewriting}
            >
              {rewriting ? "Réécriture…" : "Réécrire ce temps"}
            </Button>
          </div>
        </div>
      ) : null}
      {/* sentinel to silence unused var warning if fallbackTitle unused */}
      <span className="hidden">{fallbackTitle}</span>
    </div>
  );
}

function BeatList({
  title,
  subtitle,
  emptyLabel,
  beats,
  defaultCollapsed,
  onRewriteBeat,
  rewriting,
}: {
  title: string;
  subtitle?: string;
  emptyLabel: string;
  beats: Array<{ beatId?: string; label?: string; summary: string }> | undefined;
  defaultCollapsed?: boolean;
  onRewriteBeat?: (beatId: string, instructions: string) => void | Promise<void>;
  rewriting?: boolean;
}) {
  if (defaultCollapsed && (beats ?? []).length > 0) {
    return (
      <details className="rounded-xl border border-border/60 bg-card/40">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium flex items-center justify-between">
          <span>{title}</span>
          <span className="text-xs text-muted-foreground">{(beats ?? []).length} temps · cliquer pour voir</span>
        </summary>
        <div className="px-4 pb-4 space-y-3 text-sm">
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          {beats?.map((beat, index) => (
            <BeatItem
              key={beat.beatId ?? `${title}-${index}`}
              beat={beat}
              index={index}
              fallbackTitle={title}
              onRewriteBeat={onRewriteBeat}
              rewriting={rewriting}
            />
          ))}
        </div>
      </details>
    );
  }

  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {(beats ?? []).length > 0 ? (
          beats?.map((beat, index) => (
            <BeatItem
              key={beat.beatId ?? `${title}-${index}`}
              beat={beat}
              index={index}
              fallbackTitle={title}
              onRewriteBeat={onRewriteBeat}
              rewriting={rewriting}
            />
          ))
        ) : (
          <p className="text-muted-foreground">{emptyLabel}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ChapterVisualContractReadout({ snapshot }: { snapshot: unknown }) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const o = snapshot as Record<string, unknown>;
  const contract =
    o.contract && typeof o.contract === "object" && !Array.isArray(o.contract)
      ? (o.contract as Record<string, unknown>)
      : null;
  if (!contract) return null;

  const main =
    contract.mainLocation && typeof contract.mainLocation === "object"
      ? (contract.mainLocation as Record<string, unknown>)
      : null;
  const mainName = typeof main?.name === "string" && main.name.trim() ? main.name : null;
  const needsClarification = contract.needsClarification === true;
  const usedOpenAI = o.usedOpenAI === true;
  const requiredCount =
    typeof o.requiredFromContractCount === "number" ? o.requiredFromContractCount : 0;
  const warnings = Array.isArray(o.warnings) ? (o.warnings as string[]) : [];
  const props = Array.isArray(contract.props) ? (contract.props as Record<string, unknown>[]) : [];
  const species = Array.isArray(contract.species) ? (contract.species as Record<string, unknown>[]) : [];
  const robots = Array.isArray(contract.robots) ? (contract.robots as Record<string, unknown>[]) : [];
  const hybrids = Array.isArray(contract.hybrids) ? (contract.hybrids as Record<string, unknown>[]) : [];
  const creatures = Array.isArray(contract.creatures)
    ? (contract.creatures as Record<string, unknown>[])
    : [];
  const rejected = Array.isArray(contract.rejectedOrUnrelated)
    ? (contract.rejectedOrUnrelated as Record<string, unknown>[])
    : [];

  const requiredProps = props.filter((p) => p.importance === "required");
  const optionalProps = props.filter((p) => p.importance !== "required");

  return (
    <Card className="border-border/60 bg-card/30">
      <CardHeader>
        <CardTitle className="text-base">Contrat visuel du chapitre</CardTitle>
        <p className="text-xs text-muted-foreground">
          Extrait lors du pipeline premium (IA locale au chapitre). Sert de référence pour la couverture
          visuelle.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Source IA : {usedOpenAI ? "oui" : "non"}</span>
          <span>Obligations « required » : {requiredCount}</span>
        </div>
        {needsClarification ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
            Lieu principal encore ambigu — précise le décor dans l’intent ou les beats si besoin.
          </p>
        ) : null}
        <div>
          <p className="text-xs font-medium text-muted-foreground">Lieu principal détecté</p>
          <p className="mt-0.5">{mainName ?? "— (non spécifié)"}</p>
        </div>
        {species.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Espèces / peuples</p>
            <ul className="mt-1 list-inside list-disc text-muted-foreground">
              {species.slice(0, 6).map((c, i) => (
                <li key={i}>{typeof c.name === "string" ? c.name : "—"}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {robots.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Robots / méchas</p>
            <ul className="mt-1 list-inside list-disc text-muted-foreground">
              {robots.slice(0, 6).map((c, i) => (
                <li key={i}>{typeof c.name === "string" ? c.name : "—"}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {hybrids.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Hybrides / chimères</p>
            <ul className="mt-1 list-inside list-disc text-muted-foreground">
              {hybrids.slice(0, 6).map((c, i) => (
                <li key={i}>{typeof c.name === "string" ? c.name : "—"}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {creatures.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Créatures / menaces (autres)</p>
            <ul className="mt-1 list-inside list-disc text-muted-foreground">
              {creatures.slice(0, 8).map((c, i) => (
                <li key={i}>{typeof c.name === "string" ? c.name : "—"}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {requiredProps.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Props obligatoires (contrat)</p>
            <ul className="mt-1 list-inside list-disc text-muted-foreground">
              {requiredProps.map((p, i) => (
                <li key={i}>{typeof p.name === "string" ? p.name : "—"}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {optionalProps.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Props optionnels / ambiance</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {optionalProps
                .slice(0, 12)
                .map((p) => (typeof p.name === "string" ? p.name : ""))
                .filter(Boolean)
                .join(", ") || "—"}
            </p>
          </div>
        ) : null}
        {rejected.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-amber-600/90">Entités écartées (hors chapitre)</p>
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
              {rejected.slice(0, 6).map((r, i) => (
                <li key={i}>
                  <span className="font-medium">{typeof r.name === "string" ? r.name : "?"}</span>
                  {typeof r.reason === "string" ? ` — ${r.reason}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {warnings.length > 0 ? (
          <p className="text-xs text-muted-foreground">Avertissements : {warnings.slice(0, 3).join(" · ")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
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
}: {
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
}) {
  const hasOutline = (draft.editorialOutline?.beats?.length ?? 0) > 0 || (draft.productionOutline?.beats?.length ?? 0) > 0;

  // P1.3 — wording produit : "Valider le plan" était ambigu (on pouvait le
  // comprendre comme "prêt à générer" alors qu'il manque parfois des
  // blueprints). On distingue explicitement deux choses :
  //   1) Outline éditorial validé (déroulé narratif OK)
  //   2) Contrat images complet (panelBlueprints.length >= minimumImages)
  const hasProductionPlan = Boolean(draft.productionPlan);
  const panelBlueprintCount = Array.isArray(draft.productionPlan?.panelBlueprints)
    ? draft.productionPlan.panelBlueprints.length
    : 0;
  const minimumImages = imageCounts.minimumImages ?? draft.productionPlan?.minimumImages ?? 0;
  const contractComplete = hasProductionPlan && panelBlueprintCount >= minimumImages && minimumImages > 0;
  const outlineValidated = hasOutline;
  const canonicalPlan: EstimateCanonicalProductionPlan | null | undefined =
    draft.estimateContext?.canonicalProductionPlan ?? undefined;

  const canonicalMetrics =
    canonicalPlan && typeof canonicalPlan.metrics === "object" && canonicalPlan.metrics !== null
      ? (canonicalPlan.metrics as Record<string, unknown>)
      : null;

  return (
    <div data-studio-section="plan" className="space-y-6">
      {chapterVisualContract ? <ChapterVisualContractReadout snapshot={chapterVisualContract} /> : null}

      {/* UX-FIX-4 : CTA proéminent si outline absente */}
      {!hasOutline && !generatingOutline && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-violet-500/40 bg-violet-500/5 py-12 text-center">
          <Sparkles className="h-8 w-8 text-violet-400/60" />
          <div className="space-y-1">
            <p className="text-lg font-medium">L&apos;outline n&apos;est pas encore générée</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Clique ci-dessous pour que l&apos;IA génère l&apos;outline éditorial, l&apos;outline de production et le plan complet du chapitre.
            </p>
          </div>
          <Button size="lg" type="button" onClick={() => void onGenerateOutlines()} className="mt-2 gap-2">
            <Sparkles className="h-4 w-4" />
            Générer outline &amp; plan de production
          </Button>
        </div>
      )}

      {generatingOutline && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/40 bg-card/20 py-10 text-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Génération en cours — cela peut prendre 30–60 secondes…</p>
        </div>
      )}

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Direction narrative du chapitre</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label>Objectif émotionnel</Label>
              <FieldTooltip
                text="Ce que le lecteur doit ressentir à la fin du chapitre."
                example="Tension insoutenable / Soulagement inattendu"
              />
            </div>
            <Input
              data-testid="studio-emotional-goal"
              data-studio-field="studio-emotional-goal"
              value={draft.narrativeContract?.emotionalGoal ?? ""}
              onChange={(event) =>
                onUpdateDraft({
                  ...draft,
                  narrativeContract: {
                    emotionalGoal: event.target.value,
                    heroStateAtStart: draft.narrativeContract?.heroStateAtStart ?? "",
                    heroStateAtEnd: draft.narrativeContract?.heroStateAtEnd ?? "",
                    centralConflict: draft.narrativeContract?.centralConflict ?? "",
                    revealOrInformationGain: draft.narrativeContract?.revealOrInformationGain ?? "",
                    relationshipShift: draft.narrativeContract?.relationshipShift ?? "",
                    chapterQuestion: draft.narrativeContract?.chapterQuestion ?? "",
                    endingMode: draft.narrativeContract?.endingMode ?? "cliffhanger",
                    tone: draft.narrativeContract?.tone ?? "dramatic",
                    intensityCurve: draft.narrativeContract?.intensityCurve ?? [],
                    forbiddenNarrativeMisses: draft.narrativeContract?.forbiddenNarrativeMisses ?? [],
                  },
                }, "narrative_contract")
              }
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label>Conflit central</Label>
              <FieldTooltip
                text="L'obstacle principal qui structure le chapitre."
                example="Le héros doit choisir entre deux loyautés."
              />
            </div>
            <Input
              data-testid="studio-central-conflict"
              data-studio-field="studio-central-conflict"
              value={draft.narrativeContract?.centralConflict ?? ""}
              onChange={(event) =>
                onUpdateDraft({
                  ...draft,
                  narrativeContract: {
                    emotionalGoal: draft.narrativeContract?.emotionalGoal ?? "",
                    heroStateAtStart: draft.narrativeContract?.heroStateAtStart ?? "",
                    heroStateAtEnd: draft.narrativeContract?.heroStateAtEnd ?? "",
                    centralConflict: event.target.value,
                    revealOrInformationGain: draft.narrativeContract?.revealOrInformationGain ?? "",
                    relationshipShift: draft.narrativeContract?.relationshipShift ?? "",
                    chapterQuestion: draft.narrativeContract?.chapterQuestion ?? "",
                    endingMode: draft.narrativeContract?.endingMode ?? "cliffhanger",
                    tone: draft.narrativeContract?.tone ?? "dramatic",
                    intensityCurve: draft.narrativeContract?.intensityCurve ?? [],
                    forbiddenNarrativeMisses: draft.narrativeContract?.forbiddenNarrativeMisses ?? [],
                  },
                }, "narrative_contract")
              }
            />
          </div>
          <div className="lg:col-span-2">
            <NarrativeContractCard contract={draft.narrativeContract} />
          </div>
        </CardContent>
      </Card>

      {/* Warning progression répétitive */}
      {progressionIssues && progressionIssues.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p className="text-sm font-medium">Le plan détaillé semble répétitif</p>
          </div>
          <ul className="space-y-1 text-xs text-amber-300/90 pl-6">
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
      )}

      {/* Encart explicatif */}
      {(draft.editorialOutline?.beats?.length ?? 0) > 0 || (draft.productionOutline?.beats?.length ?? 0) > 0 ? (
        <div className="rounded-xl border border-border/40 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Résumé macro</span> — valide le déroulé global du chapitre.{" "}
          <span className="font-medium text-foreground">Découpage détaillé</span> — utilisé par l&apos;IA pour générer les pages, les panels et les dialogues.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Résumé macro : replié par défaut si le plan détaillé est plus riche */}
        <BeatList
          title="Résumé du chapitre (5 grands temps)"
          subtitle="Version courte pour valider le déroulé global."
          emptyLabel="Aucun résumé généré."
          beats={draft.editorialOutline?.beats}
          defaultCollapsed={
            (draft.productionOutline?.beats?.length ?? 0) > (draft.editorialOutline?.beats?.length ?? 0)
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

      {/* Métriques legacy : masquées quand le plan canonique existe (une seule vérité). */}
      {draft.productionPlan?.premiumReadinessScore !== undefined && !canonicalPlan && (
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="text-base">Auto-déductions narratives</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              Ces informations sont inférées automatiquement par le backend — aucune configuration manuelle requise.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {draft.productionPlan?.propCoverage?.covered && draft.productionPlan.propCoverage.covered.length > 0 && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Props inférés</p>
                  <div className="flex flex-wrap gap-1">
                    {[...new Set(draft.productionPlan.propCoverage.covered)].slice(0, 6).map((prop) => (
                      <span key={prop} className="rounded bg-muted/60 px-1.5 py-0.5 text-xs">{prop}</span>
                    ))}
                  </div>
                </div>
              )}
              {draft.productionPlan?.cutawayCoverage && (
                <div>
                  <p className="text-muted-foreground text-xs">Plans de coupe prévus</p>
                  <p className="font-semibold">{draft.productionPlan.cutawayCoverage.count}</p>
                </div>
              )}
              {draft.productionPlan?.enemyCoverage && (
                <div>
                  <p className="text-muted-foreground text-xs">Panels focus ennemi</p>
                  <p className="font-semibold">{draft.productionPlan.enemyCoverage.panelCount}</p>
                </div>
              )}
              {draft.productionPlan?.dialogueAnchorCoverage && (
                <div>
                  <p className="text-muted-foreground text-xs">Dialogues ancrés</p>
                  <p className="font-semibold">{draft.productionPlan.dialogueAnchorCoverage.anchored}</p>
                </div>
              )}
              {draft.productionPlan?.npcCoverage && (
                <div>
                  <p className="text-muted-foreground text-xs">Densité PNJ moy.</p>
                  <p className="font-semibold">{draft.productionPlan.npcCoverage.avgNpcCount.toFixed(1)}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {canonicalPlan && draft.productionPlan?.premiumReadinessScore !== undefined && (
        <details className="rounded-xl border border-border/40 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">
            Debug — métriques legacy (non utilisées pour la génération premium)
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {draft.productionPlan?.cutawayCoverage && (
              <span>Coupe (legacy) : {draft.productionPlan.cutawayCoverage.count}</span>
            )}
            {draft.productionPlan?.npcCoverage && (
              <span>PNJ moy. (legacy) : {draft.productionPlan.npcCoverage.avgNpcCount.toFixed(1)}</span>
            )}
          </div>
        </details>
      )}

      <Card className="border-border/60 bg-card/40" data-studio-field="studio-plan-contract-overview">
        <CardHeader>
          <CardTitle className="text-base">État du chapitre avant génération</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* P1.3 — deux badges distincts pour lever l'ambiguité entre
              "outline narratif validé" et "contrat images complet". */}
          <div className="flex flex-wrap items-center gap-2" data-testid="plan-step-statuses">
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
            {(() => {
              // P8 — 3 états possibles pour le badge "Contrat images" :
              //   1) Plan vide                                → danger (bloquant)
              //   2) Plan hors range premium (<70 ou >75)     → danger (bloquant)
              //   3) Plan natif dans la range 70-75           → success
              const isEmpty = hasProductionPlan && panelBlueprintCount === 0;
              const isOutOfRange =
                hasProductionPlan && panelBlueprintCount > 0 && !contractComplete;
              const tone = contractComplete
                ? "success"
                : isEmpty || isOutOfRange
                  ? "danger"
                  : "muted";
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
                <span
                  data-testid="plan-status-contract"
                  data-tone={tone}
                  className={className}
                >
                  {label}
                </span>
              );
            })()}
          </div>

          <div className="grid gap-4 md:grid-cols-5">
            <div><p className="text-muted-foreground">Préparation</p><p>{preparationScore}/100</p></div>
            {canonicalPlan ? (
              <>
                <div>
                  <p className="text-muted-foreground">Panels (canonique)</p>
                  <p>{canonicalPlan.panelCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Pages (canonique)</p>
                  <p>{typeof canonicalMetrics?.totalPages === "number" ? canonicalMetrics.totalPages : "—"}</p>
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
                <div><p className="text-muted-foreground">Images estimées</p><p>{imageCounts.estimatedImages}</p></div>
                <div><p className="text-muted-foreground">Images cibles</p><p>{imageCounts.targetImages}</p></div>
                <div><p className="text-muted-foreground">Cible indicative</p><p>{imageCounts.minimumImages}</p></div>
                <div><p className="text-muted-foreground">Manquantes</p><p>{imageCounts.missingImages}</p></div>
              </>
            )}
          </div>

          {/* P8 — blocants stricts : plan vide OU plan hors range 70-75.
              Plus de message "génération OK sous la cible" : un storyboard
              sous-dimensionné ou surdimensionné est un BUG éditorial qui doit
              être corrigé avant de lancer la pipeline. */}
          {hasProductionPlan && panelBlueprintCount === 0 && (
            <div
              data-testid="plan-step-contract-hint"
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200"
            >
              Le plan ne contient aucun blueprint de panel. La génération n&apos;est pas lançable —
              régénère le plan avant validation.
            </div>
          )}
          {hasProductionPlan && panelBlueprintCount > 0 && !contractComplete && (
            <div
              data-testid="plan-step-out-of-range-hint"
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200"
            >
              Le découpage natif produit <strong>{panelBlueprintCount} panels</strong>, hors de la
              range premium <strong>70–75</strong>. La génération est <strong>bloquée</strong> :
              régénère un plan à densité correcte avant de lancer la pipeline.
            </div>
          )}

          <div className="flex flex-wrap gap-3 justify-end">
            <Button type="button" variant="secondary" onClick={() => void onGenerateOutlines()} disabled={generatingOutline}>
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

      <StudioInlineIssues title="Points à corriger" issues={issues} emptyLabel="Aucun blocant : le plan peut partir en génération." testIdPrefix={null} onAction={onIssueAction} />
      <StudioInlineIssues title="Points à surveiller" issues={warningItems} tone="neutral" testIdPrefix={null} onAction={onIssueAction} />
    </div>
  );
}
