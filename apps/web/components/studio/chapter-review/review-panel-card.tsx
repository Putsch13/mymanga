/**
 * Carte review d'un panel : axes principaux + axes premium + drift +
 * patches auto + prompt final + packet canonique + image comparison +
 * actions reroll/validate.
 *
 * Auparavant : ~390 LOC inline dans `chapter-review-board.tsx`.
 */
"use client";

import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReviewPanelActions } from "./review-panel-actions";
import type { ReviewPanel } from "./types";

export interface ReviewPanelCardProps {
  panel: ReviewPanel;
  comparePanels: Record<string, boolean>;
  validatedPanels: Record<string, boolean>;
  onValidate: (panelId: string, validated: boolean) => void | Promise<void>;
  onToggleCompare: (panelId: string) => void;
  onReroll: (panelId: string, mode: string) => void | Promise<void>;
}

export function ReviewPanelCard(props: ReviewPanelCardProps) {
  const { panel, comparePanels, validatedPanels, onValidate, onToggleCompare, onReroll } = props;
  const compareOpen = Boolean(comparePanels[panel.panelId] && panel.previousImageUrl);

  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>Panel {panel.panelNumber}</span>
          <span className="text-xs text-muted-foreground">
            {panel.status} · {panel.critical ? "critique" : "standard"} · score{" "}
            {Math.round(panel.score * 100)}%
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <MainAxisScores panel={panel} />
        <PremiumAxisScores panel={panel} />

        <p className="text-muted-foreground">
          Catégorie {panel.panelCategory ?? "?"} · refs {panel.referencePolicy ?? "?"} · raisons
          critiques {panel.criticalityReasons.join(", ") || "aucune"}
        </p>

        <p
          className={
            panel.qaWasRequired && !panel.qaWasExecuted ? "text-red-500" : "text-muted-foreground"
          }
        >
          QA visuelle:{" "}
          {panel.qaWasExecuted
            ? "exécutée"
            : panel.qaWasRequired
              ? `manquante (${panel.qaFailureReason ?? "indisponible"})`
              : `non requise (${panel.qaBypassReason ?? "panel non critique"})`}
        </p>

        <DriftSection panel={panel} />
        <AutoPatchesSection panel={panel} />
        <PromptDebugSection panel={panel} />
        <CanonicalPacketSection panel={panel} />

        {panel.imageUrl ? (
          <div className={`grid gap-3 ${compareOpen ? "md:grid-cols-2" : ""}`}>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Version actuelle
              </p>
              <Image
                src={panel.imageUrl}
                alt={`Panel ${panel.panelNumber} actuel`}
                width={600}
                height={900}
                unoptimized
                className="w-full rounded-xl border border-border/60 bg-background/40 object-cover"
              />
            </div>
            {compareOpen && panel.previousImageUrl ? (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Version précédente
                </p>
                <Image
                  src={panel.previousImageUrl}
                  alt={`Panel ${panel.panelNumber} précédent`}
                  width={600}
                  height={900}
                  unoptimized
                  className="w-full rounded-xl border border-border/60 bg-background/40 object-cover"
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <ul className="space-y-1 text-muted-foreground">
          {panel.rejectionReasons.length > 0 ? (
            panel.rejectionReasons.map((issue, index) => (
              <li key={`${panel.panelId}-${index}`}>- {issue}</li>
            ))
          ) : (
            <li>- Aucun problème majeur détecté</li>
          )}
        </ul>

        <ReviewPanelActions
          panel={panel}
          comparePanels={comparePanels}
          validatedPanels={validatedPanels}
          onValidate={onValidate}
          onToggleCompare={onToggleCompare}
          onReroll={onReroll}
        />
      </CardContent>
    </Card>
  );
}

function MainAxisScores({ panel }: { panel: ReviewPanel }) {
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      <ScoreCell label="Fidélité" score={panel.axisScores.characterFidelity} />
      <ScoreCell label="Narration" score={panel.axisScores.narrativeRelevance} />
      <ScoreCell label="Composition" score={panel.axisScores.compositionReadability} />
      <ScoreCell label="Décor" score={panel.axisScores.environmentConsistency} />
    </div>
  );
}

function ScoreCell({ label, score }: { label: string; score: number }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p>{Math.round(score * 100)}%</p>
    </div>
  );
}

function PremiumAxisScores({ panel }: { panel: ReviewPanel }) {
  const ax = panel.axisScores;
  const hasAny =
    ax.propComplianceScore !== undefined ||
    ax.subjectFocusScore !== undefined ||
    ax.enemyPresenceScore !== undefined ||
    ax.dialogueAnchorScore !== undefined ||
    ax.populationScore !== undefined ||
    ax.cutawayComplianceScore !== undefined;
  if (!hasAny) return null;

  const colorize = (
    value: number | undefined,
    options: { warn?: boolean } = {},
  ): string => {
    if (value === undefined) return "";
    if (value < 0.7) return options.warn ? "text-yellow-500 font-semibold" : "text-red-500 font-semibold";
    return "text-green-500";
  };

  return (
    <div className="grid gap-2 rounded-lg border border-border/40 bg-muted/20 p-2 text-xs sm:grid-cols-5">
      {ax.propComplianceScore !== undefined ? (
        <div>
          <p className="text-muted-foreground">Props</p>
          <p className={colorize(ax.propComplianceScore)}>{Math.round(ax.propComplianceScore * 100)}%</p>
        </div>
      ) : null}
      {ax.subjectFocusScore !== undefined ? (
        <div>
          <p className="text-muted-foreground">Focus</p>
          <p className={colorize(ax.subjectFocusScore)}>{Math.round(ax.subjectFocusScore * 100)}%</p>
        </div>
      ) : null}
      {ax.enemyPresenceScore !== undefined ? (
        <div>
          <p className="text-muted-foreground">Ennemi</p>
          <p className={colorize(ax.enemyPresenceScore)}>{Math.round(ax.enemyPresenceScore * 100)}%</p>
        </div>
      ) : null}
      {ax.dialogueAnchorScore !== undefined ? (
        <div>
          <p className="text-muted-foreground">Dialogue</p>
          <p className={colorize(ax.dialogueAnchorScore, { warn: true })}>
            {Math.round(ax.dialogueAnchorScore * 100)}%
          </p>
        </div>
      ) : null}
      {ax.populationScore !== undefined ? (
        <div>
          <p className="text-muted-foreground">PNJ</p>
          <p className={colorize(ax.populationScore, { warn: true })}>
            {Math.round(ax.populationScore * 100)}%
          </p>
        </div>
      ) : null}
      {ax.cutawayComplianceScore !== undefined ? (
        <div>
          <p className="text-muted-foreground">Cutaway</p>
          <p
            className={
              ax.cutawayComplianceScore < 0.7
                ? "text-red-500 font-semibold"
                : ax.cutawayComplianceScore < 0.85
                  ? "text-yellow-500"
                  : "text-green-500"
            }
          >
            {Math.round(ax.cutawayComplianceScore * 100)}%
          </p>
        </div>
      ) : null}
    </div>
  );
}

function DriftSection({ panel }: { panel: ReviewPanel }) {
  if (!panel.driftSeverity) return null;
  const isHigh = panel.driftSeverity === "high" || panel.driftSeverity === "critical";
  return (
    <div
      className={`space-y-1 rounded-lg border p-2 text-xs ${
        isHigh
          ? "border-amber-500/40 bg-amber-500/5 text-amber-600"
          : "border-border/40 text-muted-foreground"
      }`}
    >
      <p className="font-medium">
        Drift visuel: {panel.driftSeverity}{" "}
        {panel.driftScore !== null ? `(${Math.round(panel.driftScore)}%)` : ""}
        {panel.chapterLookMismatch ? " · LOOK MISMATCH" : ""}
        {panel.continuityRisk ? " · RISQUE CONTINUITÉ" : ""}
      </p>
      {(panel.styleDriftScore !== null && panel.styleDriftScore !== undefined) ||
      (panel.characterDriftScore !== null && panel.characterDriftScore !== undefined) ||
      (panel.beatAlignmentScore !== null && panel.beatAlignmentScore !== undefined) ? (
        <div className="grid grid-cols-3 gap-2">
          {panel.styleDriftScore !== null && panel.styleDriftScore !== undefined ? (
            <span>Style: {Math.round(panel.styleDriftScore)}%</span>
          ) : null}
          {panel.characterDriftScore !== null && panel.characterDriftScore !== undefined ? (
            <span>Perso: {Math.round(panel.characterDriftScore)}%</span>
          ) : null}
          {panel.beatAlignmentScore !== null && panel.beatAlignmentScore !== undefined ? (
            <span>Beat: {Math.round(panel.beatAlignmentScore)}%</span>
          ) : null}
        </div>
      ) : null}
      {panel.recommendedAction && panel.recommendedAction !== "keep" ? (
        <p>
          Action recommandée: <strong>{panel.recommendedAction}</strong>
        </p>
      ) : null}
      {panel.driftReasons.length ? <p>{panel.driftReasons.slice(0, 2).join(", ")}</p> : null}
      {panel.preservedConstraints && panel.preservedConstraints.length > 0 ? (
        <p className="text-green-600">
          Préservé au reroll: {panel.preservedConstraints.join(", ")}
        </p>
      ) : null}
      {panel.relaxedConstraints && panel.relaxedConstraints.length > 0 ? (
        <p className="text-muted-foreground">Relâché: {panel.relaxedConstraints.join(", ")}</p>
      ) : null}
    </div>
  );
}

function AutoPatchesSection({ panel }: { panel: ReviewPanel }) {
  if (!panel.autoAppliedPatches || panel.autoAppliedPatches.length === 0) return null;
  return (
    <div className="space-y-1 rounded-lg border border-blue-500/30 bg-blue-500/5 p-2 text-xs">
      <p className="font-medium text-blue-600">
        Patches auto-appliqués ({panel.autoAppliedPatches.length})
      </p>
      {panel.autoAppliedPatches.map((patch, index) => (
        <p key={index} className="text-muted-foreground">
          · {patch.type}: {patch.description}
        </p>
      ))}
    </div>
  );
}

function PromptDebugSection({ panel }: { panel: ReviewPanel }) {
  if (!panel.promptDebug?.finalPrompt) {
    return (
      <>
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold">Prompt source :</span>{" "}
          {panel.prompt ?? "Aucun prompt source."}
        </p>
        {panel.promptDebug?.promptWarnings?.length ? (
          <p className="text-xs text-amber-500">
            Warnings: {panel.promptDebug.promptWarnings.join(", ")}
          </p>
        ) : null}
      </>
    );
  }
  return (
    <>
      <div className="space-y-1 rounded-lg border border-primary/30 bg-primary/5 p-2">
        <p className="text-[10px] uppercase tracking-wider text-primary/80">
          Prompt final envoyé
          {panel.promptDebug.usedPacket ? " (canonique)" : " (legacy)"}
          {panel.promptDebug.origin ? ` · ${panel.promptDebug.origin}` : ""}
          {panel.promptDebug.retryMode ? ` · retry=${panel.promptDebug.retryMode}` : ""}
        </p>
        <p className="text-xs text-foreground">{panel.promptDebug.finalPrompt}</p>
        {panel.promptDebug.finalNegativePrompt ? (
          <p className="text-[10px] text-destructive/90">
            <span className="font-semibold">Negative:</span>{" "}
            {panel.promptDebug.finalNegativePrompt}
          </p>
        ) : null}
        <p className="text-[10px] text-muted-foreground">
          {[
            panel.promptDebug.provider && panel.promptDebug.model
              ? `${panel.promptDebug.provider}/${panel.promptDebug.model}`
              : null,
            panel.promptDebug.referencePolicy
              ? `ref=${panel.promptDebug.referencePolicy}`
              : null,
            panel.promptDebug.width && panel.promptDebug.height
              ? `${panel.promptDebug.width}×${panel.promptDebug.height}`
              : null,
            typeof panel.promptDebug.refsCount === "number"
              ? `refs=${panel.promptDebug.refsCount}`
              : null,
            typeof panel.promptDebug.lorasCount === "number"
              ? `loras=${panel.promptDebug.lorasCount}`
              : null,
            panel.promptDebug.seed != null ? `seed=${panel.promptDebug.seed}` : null,
            panel.promptDebug.packetVersion
              ? `packet=${panel.promptDebug.packetVersion}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-semibold">Prompt source :</span>{" "}
        {panel.prompt ?? "Aucun prompt source."}
      </p>
      {panel.promptDebug.promptWarnings?.length ? (
        <p className="text-xs text-amber-500">
          Warnings: {panel.promptDebug.promptWarnings.join(", ")}
        </p>
      ) : null}
    </>
  );
}

function CanonicalPacketSection({ panel }: { panel: ReviewPanel }) {
  const cp = panel.canonicalPacket;
  if (!cp) return null;
  return (
    <details className="rounded-lg border border-border/50 bg-muted/30 p-2 text-[11px]">
      <summary className="cursor-pointer font-semibold text-foreground">
        Canonical packet · {cp.imageIntentType ?? "?"}
        {cp.heroPresenceMode ? ` · hero=${cp.heroPresenceMode}` : ""}
        {cp.contentRating ? ` · ${cp.contentRating}` : ""}
      </summary>
      <div className="mt-2 space-y-1">
        {cp.modelRoutingDecision ? (
          <p>
            <span className="font-semibold">Routing:</span>{" "}
            {String(cp.modelRoutingDecision.modelId ?? "?")} · policy=
            {String(cp.modelRoutingDecision.referencePolicy ?? "?")}
            {cp.modelRoutingDecision.reason
              ? ` · reason=${String(cp.modelRoutingDecision.reason)}`
              : ""}
          </p>
        ) : null}
        {cp.providerPayload ? (
          <details className="mt-1 rounded border border-border/40 bg-background/40 p-1">
            <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-muted-foreground">
              Provider payload
            </summary>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-[10px] leading-tight">
              {JSON.stringify(cp.providerPayload, null, 2)}
            </pre>
          </details>
        ) : null}
        {cp.finalEnglishStructuredPrompt ? (
          <details className="mt-1 rounded border border-border/40 bg-background/40 p-1">
            <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-muted-foreground">
              Prompt EN structure
            </summary>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-[10px] leading-tight">
              {cp.finalEnglishStructuredPrompt}
            </pre>
            {cp.negativePromptEnglish ? (
              <div className="mt-1 text-[10px] text-destructive">
                <span className="font-semibold">NEG:</span> {cp.negativePromptEnglish}
              </div>
            ) : null}
          </details>
        ) : null}
        {cp.buildWarnings.length > 0 ? (
          <p className="text-amber-600">Build warnings: {cp.buildWarnings.join(", ")}</p>
        ) : null}
        {panel.canonicalPacketValidation && panel.canonicalPacketValidation.valid === false ? (
          <p className="text-destructive">
            Preflight invalid:{" "}
            {(panel.canonicalPacketValidation.errors as string[] | undefined)?.join(", ")}
          </p>
        ) : null}
        {panel.packetRerollPlans && panel.packetRerollPlans.length > 0 ? (
          <div>
            <p className="font-semibold">Packet reroll plans ({panel.packetRerollPlans.length})</p>
            <ul className="list-disc pl-4 text-[10px]">
              {panel.packetRerollPlans.slice(-3).map((plan, i) => (
                <li key={i}>
                  attempt={String(plan.attempt)} ·{" "}
                  {String(plan.reason ?? plan.reasonNotes ?? "?")}
                  {plan.origin ? ` · ${plan.origin}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}
