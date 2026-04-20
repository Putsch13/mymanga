"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { QualityScoreBadge } from "./quality-score-badge";
import { QAResultCard } from "./qa-result-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// ─── Types premium ────────────────────────────────────────────────────────────

type PremiumReviewAction =
  | "prop_repair"
  | "speaker_anchor_repair"
  | "enemy_presence_repair"
  | "subject_focus_repair"
  | "cutaway_repair"
  | "npc_population_repair";

type LegacyReviewAction =
  | "style_reroll"
  | "character_reroll"
  | "soft_reroll"
  | "full_reroll";

type ReviewAction = PremiumReviewAction | LegacyReviewAction | string;

type PremiumRetryMode =
  | "prop"
  | "speaker"
  | "enemy_presence"
  | "subject_focus"
  | "cutaway"
  | "npc_population";

type LegacyRetryMode = "style" | "character" | "composition" | "environment";

type RetryMode = PremiumRetryMode | LegacyRetryMode | string;

// Table de mapping premium — source de vérité unique
const REROLL_MODE_MAP: Record<ReviewAction, RetryMode> = {
  style_reroll: "style",
  character_reroll: "character",
  soft_reroll: "composition",
  full_reroll: "character",
  prop_repair: "prop",
  speaker_anchor_repair: "speaker",
  enemy_presence_repair: "enemy_presence",
  subject_focus_repair: "subject_focus",
  cutaway_repair: "cutaway",
  npc_population_repair: "npc_population",
};

type QAReportResponse = {
  ok: boolean;
  report: {
    panelResults: Array<{
      panelId: string;
      sceneId: string;
      panelNumber: number;
      imageUrl: string | null;
      previousImageUrl: string | null;
      critical: boolean;
      criticality: string;
      criticalityReasons: string[];
      score: number;
      axisScores: {
        characterFidelity: number;
        narrativeRelevance: number;
        compositionReadability: number;
        environmentConsistency: number;
        // Premium contractual scores
        propComplianceScore?: number;
        subjectFocusScore?: number;
        dialogueAnchorScore?: number;
        enemyPresenceScore?: number;
        populationScore?: number;
        cutawayComplianceScore?: number;
      };
      rejectionReasons: string[];
      repairSuggestions: string[];
      rerollCount: number;
      driftScore: number | null;
      driftSeverity: string | null;
      driftReasons: string[];
      /** Nouveaux champs drift 2.0 */
      styleDriftScore?: number | null;
      characterDriftScore?: number | null;
      beatAlignmentScore?: number | null;
      sceneContinuityScore?: number | null;
      chapterLookMismatch?: boolean | null;
      recommendedAction?: string | null;
      continuityRisk?: boolean | null;
      /** Contraintes préservées/relâchées au reroll */
      preservedConstraints?: string[];
      relaxedConstraints?: string[];
      /** Patches auto-appliqués */
      autoAppliedPatches?: Array<{ type: string; description: string }>;
      promptDebug: {
        finalPrompt?: string;
        finalNegativePrompt?: string | null;
        promptSource?: string | null;
        usedPacket?: boolean;
        packetVersion?: string | null;
        provider?: string | null;
        model?: string | null;
        referencePolicy?: string | null;
        width?: number | null;
        height?: number | null;
        refsCount?: number | null;
        lorasCount?: number | null;
        seed?: number | null;
        origin?: string | null;
        retryMode?: string | null;
        retryAttemptIndex?: number | null;
        promptWarnings?: string[];
        resolvedPolicy?: Record<string, boolean>;
      };
      canonicalPacket?: {
        packetVersion: string | null;
        imageIntentType: string | null;
        dominantSubjectKind: string | null;
        heroPresenceMode: string | null;
        contentRating: string | null;
        finalEnglishStructuredPrompt: string | null;
        negativePromptEnglish: string | null;
        modelRoutingDecision: Record<string, unknown> | null;
        providerPayload: Record<string, unknown> | null;
        buildWarnings: string[];
      } | null;
      canonicalPacketValidation?: Record<string, unknown> | null;
      packetRerollPlans?: Array<Record<string, unknown>>;
      prompt: string | null;
      referencePolicy: string | null;
      panelCategory: string | null;
      status: string;
      qaWasRequired: boolean;
      qaWasExecuted: boolean;
      qaFailureReason: string | null;
      qaBypassReason: string | null;
    }>;
    pageScore: number;
    chapterScore: number;
    acceptedPanelCount: number;
    rejectedPanelCount: number;
    imageCounts: {
      estimatedImages: number;
      targetImages: number;
      minimumImages: number;
      generatedImages: number;
      acceptedImages: number;
      rejectedImages: number;
      missingImages: number;
    };
    criticalPanelsCount: number;
    criticalPanelsWithVisualQA: number;
    criticalPanelsBlocked: number;
    criticalPanelsMissingQA: number;
    missingCriticalPanels: string[];
  };
};

type FilterState = {
  status: "all" | "completed" | "blocked" | "failed" | "pending";
  criticality: "all" | "critical" | "non_critical";
  qa: "all" | "missing" | "executed";
  score: "all" | "weak";
};

export function ChapterReviewBoard(input: {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  projectTitle: string;
}) {
  const [report, setReport] = useState<QAReportResponse["report"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [comparePanels, setComparePanels] = useState<Record<string, boolean>>({});
  // Validation manuelle par case (userValidatedAt) — état local optimiste.
  // Les cases validées sont protégées des régénérations globales du chapitre.
  const [validatedPanels, setValidatedPanels] = useState<Record<string, boolean>>({});
  const [filters, setFilters] = useState<FilterState>({
    status: "all",
    criticality: "all",
    qa: "all",
    score: "all",
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${input.projectId}/chapters/${input.chapterId}/qa-report`, {
        cache: "no-store",
      });
      const data = (await response.json()) as QAReportResponse;
      setReport(data.report);
    } finally {
      setLoading(false);
    }
  }, [input.chapterId, input.projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredPanels = useMemo(() => {
    const panels = report?.panelResults ?? [];
    return panels.filter((panel) => {
      if (filters.status !== "all" && panel.status !== filters.status) return false;
      if (filters.criticality === "critical" && !panel.critical) return false;
      if (filters.criticality === "non_critical" && panel.critical) return false;
      if (filters.qa === "missing" && panel.qaWasExecuted) return false;
      if (filters.qa === "executed" && !panel.qaWasExecuted) return false;
      if (filters.score === "weak" && panel.score >= 0.72) return false;
      return true;
    });
  }, [filters, report?.panelResults]);

  async function rerollPanel(panelId: string, mode: string = "character") {
    setActionMessage(null);
    // BUG-14 : on utilise désormais le body JSON plutôt que la query string.
    const response = await fetch(`/api/scene-images/${panelId}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string; ok?: boolean };
    setActionMessage(response.ok ? `Reroll ${mode} lancé pour ${panelId}.` : data.message ?? data.error ?? "Le reroll a échoué.");
    await refresh();
  }

  async function validatePanel(panelId: string, validated: boolean) {
    setActionMessage(null);
    // Optimistic update — instantané côté UI, reconcilié après fetch refresh.
    setValidatedPanels((value) => ({ ...value, [panelId]: validated }));
    const response = await fetch(`/api/scene-images/${panelId}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ validated }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string; ok?: boolean };
    if (!response.ok) {
      setValidatedPanels((value) => ({ ...value, [panelId]: !validated }));
      setActionMessage(data.message ?? data.error ?? "La validation a échoué.");
      return;
    }
    setActionMessage(validated ? `Case ${panelId} validée (protégée des regens globales).` : `Validation retirée pour ${panelId}.`);
  }

  function getRerollModeFromAction(recommendedAction: string | null | undefined): RetryMode {
    return REROLL_MODE_MAP[recommendedAction ?? ""] ?? "character";
  }

  async function completeReview() {
    setActionMessage(null);
    setReviewError(null);
    try {
      const response = await fetch(`/api/projects/${input.projectId}/chapters/${input.chapterId}/review/complete`, {
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string; details?: unknown };
      if (response.ok) {
        setReviewError(null);
        setActionMessage("Revue clôturée.");
      } else {
        setReviewError(data.message ?? data.error ?? "La clôture de review a échoué.");
      }
    } catch {
      setReviewError("Impossible de joindre le serveur. Réessaie dans un instant.");
    }
    await refresh();
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3 text-base">
            <span>{input.projectTitle} · {input.chapterTitle}</span>
            <QualityScoreBadge score={report?.chapterScore ?? null} />
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-5">
          <div data-testid="review-minimum-images"><p className="text-muted-foreground">Minimum</p><p>{report?.imageCounts.minimumImages ?? "-"}</p></div>
          <div data-testid="review-accepted-images"><p className="text-muted-foreground">Acceptées</p><p>{report?.imageCounts.acceptedImages ?? "-"}</p></div>
          <div data-testid="review-missing-images"><p className="text-muted-foreground">Manquantes</p><p>{report?.imageCounts.missingImages ?? "-"}</p></div>
          <div><p className="text-muted-foreground">Critiques sans QA</p><p>{report?.criticalPanelsMissingQA ?? "-"}</p></div>
          <div className="flex flex-col items-end justify-end gap-1">
            <Button data-testid="review-complete-button" onClick={completeReview} disabled={loading}>Clôturer la review</Button>
            {reviewError ? (
              <p data-testid="review-complete-error" className="max-w-[min(100%,20rem)] text-right text-xs text-destructive">
                {reviewError}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <QAResultCard report={report ?? undefined} />

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Filtres review</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-4">
          <label className="space-y-1">
            <span className="text-muted-foreground">Statut</span>
            <select className="w-full rounded-md border bg-background px-3 py-2" value={filters.status} onChange={(event) => setFilters((value) => ({ ...value, status: event.target.value as FilterState["status"] }))}>
              <option value="all">Tous</option>
              <option value="completed">Acceptés</option>
              <option value="blocked">Bloqués</option>
              <option value="failed">Échoués</option>
              <option value="pending">En attente</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-muted-foreground">Criticité</span>
            <select className="w-full rounded-md border bg-background px-3 py-2" value={filters.criticality} onChange={(event) => setFilters((value) => ({ ...value, criticality: event.target.value as FilterState["criticality"] }))}>
              <option value="all">Toutes</option>
              <option value="critical">Critiques</option>
              <option value="non_critical">Non critiques</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-muted-foreground">QA visuelle</span>
            <select className="w-full rounded-md border bg-background px-3 py-2" value={filters.qa} onChange={(event) => setFilters((value) => ({ ...value, qa: event.target.value as FilterState["qa"] }))}>
              <option value="all">Toutes</option>
              <option value="missing">QA manquante</option>
              <option value="executed">QA exécutée</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-muted-foreground">Score</span>
            <select className="w-full rounded-md border bg-background px-3 py-2" value={filters.score} onChange={(event) => setFilters((value) => ({ ...value, score: event.target.value as FilterState["score"] }))}>
              <option value="all">Tous</option>
              <option value="weak">Panels faibles (&lt; 0.72)</option>
            </select>
          </label>
        </CardContent>
      </Card>

      {actionMessage ? (
        <p data-testid="review-action-message" className="text-sm text-muted-foreground">{actionMessage}</p>
      ) : null}

      <div className="grid gap-4">
        {loading ? (
          <Card className="border-border/60 bg-card/40">
            <CardContent className="py-6 text-sm text-muted-foreground">Chargement du rapport QA…</CardContent>
          </Card>
        ) : filteredPanels.length === 0 ? (
          <Card className="border-border/60 bg-card/40">
            <CardContent className="py-6 text-sm text-muted-foreground">Aucun panel ne correspond aux filtres.</CardContent>
          </Card>
        ) : filteredPanels.map((panel) => (
          <Card key={panel.panelId} className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3 text-base">
                <span>Panel {panel.panelNumber}</span>
                <span className="text-xs text-muted-foreground">
                  {panel.status} · {panel.critical ? "critique" : "standard"} · score {Math.round(panel.score * 100)}%
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-4">
                <div><p className="text-muted-foreground">Fidélité</p><p>{Math.round(panel.axisScores.characterFidelity * 100)}%</p></div>
                <div><p className="text-muted-foreground">Narration</p><p>{Math.round(panel.axisScores.narrativeRelevance * 100)}%</p></div>
                <div><p className="text-muted-foreground">Composition</p><p>{Math.round(panel.axisScores.compositionReadability * 100)}%</p></div>
                <div><p className="text-muted-foreground">Décor</p><p>{Math.round(panel.axisScores.environmentConsistency * 100)}%</p></div>
              </div>
              {/* Premium contractual scores */}
              {(panel.axisScores.propComplianceScore !== undefined ||
                panel.axisScores.subjectFocusScore !== undefined ||
                panel.axisScores.enemyPresenceScore !== undefined ||
                panel.axisScores.dialogueAnchorScore !== undefined ||
                panel.axisScores.populationScore !== undefined ||
                panel.axisScores.cutawayComplianceScore !== undefined) && (
                <div className="grid gap-2 sm:grid-cols-5 rounded-lg border border-border/40 bg-muted/20 p-2 text-xs">
                  {panel.axisScores.propComplianceScore !== undefined && (
                    <div>
                      <p className="text-muted-foreground">Props</p>
                      <p className={panel.axisScores.propComplianceScore < 0.7 ? "text-red-500 font-semibold" : "text-green-500"}>
                        {Math.round(panel.axisScores.propComplianceScore * 100)}%
                      </p>
                    </div>
                  )}
                  {panel.axisScores.subjectFocusScore !== undefined && (
                    <div>
                      <p className="text-muted-foreground">Focus</p>
                      <p className={panel.axisScores.subjectFocusScore < 0.7 ? "text-red-500 font-semibold" : "text-green-500"}>
                        {Math.round(panel.axisScores.subjectFocusScore * 100)}%
                      </p>
                    </div>
                  )}
                  {panel.axisScores.enemyPresenceScore !== undefined && (
                    <div>
                      <p className="text-muted-foreground">Ennemi</p>
                      <p className={panel.axisScores.enemyPresenceScore < 0.7 ? "text-red-500 font-semibold" : "text-green-500"}>
                        {Math.round(panel.axisScores.enemyPresenceScore * 100)}%
                      </p>
                    </div>
                  )}
                  {panel.axisScores.dialogueAnchorScore !== undefined && (
                    <div>
                      <p className="text-muted-foreground">Dialogue</p>
                      <p className={panel.axisScores.dialogueAnchorScore < 0.7 ? "text-yellow-500 font-semibold" : "text-green-500"}>
                        {Math.round(panel.axisScores.dialogueAnchorScore * 100)}%
                      </p>
                    </div>
                  )}
                  {panel.axisScores.populationScore !== undefined && (
                    <div>
                      <p className="text-muted-foreground">PNJ</p>
                      <p className={panel.axisScores.populationScore < 0.7 ? "text-yellow-500 font-semibold" : "text-green-500"}>
                        {Math.round(panel.axisScores.populationScore * 100)}%
                      </p>
                    </div>
                  )}
                  {panel.axisScores.cutawayComplianceScore !== undefined && (
                    <div>
                      <p className="text-muted-foreground">Cutaway</p>
                      <p className={
                        panel.axisScores.cutawayComplianceScore < 0.7
                          ? "text-red-500 font-semibold"
                          : panel.axisScores.cutawayComplianceScore < 0.85
                            ? "text-yellow-500"
                            : "text-green-500"
                      }>
                        {Math.round(panel.axisScores.cutawayComplianceScore * 100)}%
                      </p>
                    </div>
                  )}
                </div>
              )}
              <p className="text-muted-foreground">
                Catégorie {panel.panelCategory ?? "?"} · refs {panel.referencePolicy ?? "?"} · raisons critiques {panel.criticalityReasons.join(", ") || "aucune"}
              </p>
              <p className={panel.qaWasRequired && !panel.qaWasExecuted ? "text-red-500" : "text-muted-foreground"}>
                QA visuelle: {panel.qaWasExecuted ? "exécutée" : panel.qaWasRequired ? `manquante (${panel.qaFailureReason ?? "indisponible"})` : `non requise (${panel.qaBypassReason ?? "panel non critique"})`}
              </p>
              {panel.driftSeverity ? (
                <div className={`rounded-lg border p-2 text-xs space-y-1 ${panel.driftSeverity === "high" || panel.driftSeverity === "critical" ? "border-amber-500/40 bg-amber-500/5 text-amber-600" : "border-border/40 text-muted-foreground"}`}>
                  <p className="font-medium">
                    Drift visuel: {panel.driftSeverity} {panel.driftScore !== null ? `(${Math.round(panel.driftScore)}%)` : ""}
                    {panel.chapterLookMismatch ? " · LOOK MISMATCH" : ""}
                    {panel.continuityRisk ? " · RISQUE CONTINUITÉ" : ""}
                  </p>
                  {(panel.styleDriftScore !== null && panel.styleDriftScore !== undefined) || (panel.characterDriftScore !== null && panel.characterDriftScore !== undefined) || (panel.beatAlignmentScore !== null && panel.beatAlignmentScore !== undefined) ? (
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
                    <p>Action recommandée: <strong>{panel.recommendedAction}</strong></p>
                  ) : null}
                  {panel.driftReasons.length ? (
                    <p>{panel.driftReasons.slice(0, 2).join(", ")}</p>
                  ) : null}
                  {panel.preservedConstraints && panel.preservedConstraints.length > 0 ? (
                    <p className="text-green-600">Préservé au reroll: {panel.preservedConstraints.join(", ")}</p>
                  ) : null}
                  {panel.relaxedConstraints && panel.relaxedConstraints.length > 0 ? (
                    <p className="text-muted-foreground">Relâché: {panel.relaxedConstraints.join(", ")}</p>
                  ) : null}
                </div>
              ) : null}
              {panel.autoAppliedPatches && panel.autoAppliedPatches.length > 0 ? (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-2 text-xs space-y-1">
                  <p className="font-medium text-blue-600">Patches auto-appliqués ({panel.autoAppliedPatches.length})</p>
                  {panel.autoAppliedPatches.map((patch, index) => (
                    <p key={index} className="text-muted-foreground">· {patch.type}: {patch.description}</p>
                  ))}
                </div>
              ) : null}
              {/* P0.4 — prompt final réellement envoyé (packet canonique si dispo), fallback legacy */}
              {panel.promptDebug?.finalPrompt ? (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-primary/80">
                    Prompt final envoyé
                    {panel.promptDebug.usedPacket ? " (canonique)" : " (legacy)"}
                    {panel.promptDebug.origin ? ` · ${panel.promptDebug.origin}` : ""}
                    {panel.promptDebug.retryMode ? ` · retry=${panel.promptDebug.retryMode}` : ""}
                  </p>
                  <p className="text-xs text-foreground">{panel.promptDebug.finalPrompt}</p>
                  {panel.promptDebug.finalNegativePrompt ? (
                    <p className="text-[10px] text-destructive/90">
                      <span className="font-semibold">Negative:</span> {panel.promptDebug.finalNegativePrompt}
                    </p>
                  ) : null}
                  <p className="text-[10px] text-muted-foreground">
                    {[
                      panel.promptDebug.provider && panel.promptDebug.model
                        ? `${panel.promptDebug.provider}/${panel.promptDebug.model}`
                        : null,
                      panel.promptDebug.referencePolicy ? `ref=${panel.promptDebug.referencePolicy}` : null,
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
                      panel.promptDebug.packetVersion ? `packet=${panel.promptDebug.packetVersion}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold">Prompt source :</span>{" "}
                {panel.prompt ?? "Aucun prompt source."}
              </p>
              {panel.promptDebug?.promptWarnings?.length ? (
                <p className="text-xs text-amber-500">Warnings: {panel.promptDebug.promptWarnings.join(", ")}</p>
              ) : null}
              {/* P0.4 — audit packet canonique + QA packet-aware */}
              {panel.canonicalPacket ? (
                <details className="rounded-lg border border-border/50 bg-muted/30 p-2 text-[11px]">
                  <summary className="cursor-pointer font-semibold text-foreground">
                    Canonical packet · {panel.canonicalPacket.imageIntentType ?? "?"}
                    {panel.canonicalPacket.heroPresenceMode
                      ? ` · hero=${panel.canonicalPacket.heroPresenceMode}`
                      : ""}
                    {panel.canonicalPacket.contentRating
                      ? ` · ${panel.canonicalPacket.contentRating}`
                      : ""}
                  </summary>
                  <div className="mt-2 space-y-1">
                    {panel.canonicalPacket.modelRoutingDecision ? (
                      <p>
                        <span className="font-semibold">Routing:</span>{" "}
                        {String(panel.canonicalPacket.modelRoutingDecision.modelId ?? "?")}{" "}
                        · policy={String(panel.canonicalPacket.modelRoutingDecision.referencePolicy ?? "?")}
                        {panel.canonicalPacket.modelRoutingDecision.reason
                          ? ` · reason=${String(panel.canonicalPacket.modelRoutingDecision.reason)}`
                          : ""}
                      </p>
                    ) : null}
                    {/* P1.5 — providerPayload : ce qui est réellement parti côté FAL */}
                    {panel.canonicalPacket.providerPayload ? (
                      <details className="mt-1 rounded border border-border/40 bg-background/40 p-1">
                        <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-muted-foreground">
                          Provider payload
                        </summary>
                        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-[10px] leading-tight">
                          {JSON.stringify(panel.canonicalPacket.providerPayload, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                    {panel.canonicalPacket.finalEnglishStructuredPrompt ? (
                      <details className="mt-1 rounded border border-border/40 bg-background/40 p-1">
                        <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-muted-foreground">
                          Prompt EN structure
                        </summary>
                        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-[10px] leading-tight">
                          {panel.canonicalPacket.finalEnglishStructuredPrompt}
                        </pre>
                        {panel.canonicalPacket.negativePromptEnglish ? (
                          <div className="mt-1 text-[10px] text-destructive">
                            <span className="font-semibold">NEG:</span>{" "}
                            {panel.canonicalPacket.negativePromptEnglish}
                          </div>
                        ) : null}
                      </details>
                    ) : null}
                    {panel.canonicalPacket.buildWarnings.length > 0 ? (
                      <p className="text-amber-600">
                        Build warnings: {panel.canonicalPacket.buildWarnings.join(", ")}
                      </p>
                    ) : null}
                    {panel.canonicalPacketValidation &&
                    panel.canonicalPacketValidation.valid === false ? (
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
                              attempt={String(plan.attempt)} · {String(plan.reason ?? plan.reasonNotes ?? "?")}
                              {plan.origin ? ` · ${plan.origin}` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null}
              {panel.imageUrl ? (
                <div className={`grid gap-3 ${comparePanels[panel.panelId] && panel.previousImageUrl ? "md:grid-cols-2" : ""}`}>
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Version actuelle</p>
                      <Image src={panel.imageUrl} alt={`Panel ${panel.panelNumber} actuel`} width={600} height={900} unoptimized className="w-full rounded-xl border border-border/60 bg-background/40 object-cover" />
                  </div>
                  {comparePanels[panel.panelId] && panel.previousImageUrl ? (
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Version précédente</p>
                      <Image src={panel.previousImageUrl} alt={`Panel ${panel.panelNumber} précédent`} width={600} height={900} unoptimized className="w-full rounded-xl border border-border/60 bg-background/40 object-cover" />
                    </div>
                  ) : null}
                </div>
              ) : null}
              <ul className="space-y-1 text-muted-foreground">
                {panel.rejectionReasons.length > 0 ? panel.rejectionReasons.map((issue, index) => (
                  <li key={`${panel.panelId}-${index}`}>- {issue}</li>
                )) : <li>- Aucun problème majeur détecté</li>}
              </ul>
              <div className="flex flex-wrap justify-end gap-2">
                {panel.status === "completed" ? (
                  <Button
                    data-testid={`validate-panel-${panel.panelId}`}
                    variant={validatedPanels[panel.panelId] ? "default" : "secondary"}
                    size="sm"
                    className={validatedPanels[panel.panelId]
                      ? "border-green-500/40 bg-green-500/15 text-green-700 hover:bg-green-500/20"
                      : "border-green-500/30 text-green-600 hover:bg-green-500/10"}
                    onClick={() => validatePanel(panel.panelId, !validatedPanels[panel.panelId])}
                  >
                    {validatedPanels[panel.panelId] ? "✓ Validée" : "Accepter"}
                  </Button>
                ) : null}
                {panel.previousImageUrl ? (
                  <Button
                    data-testid={`compare-panel-${panel.panelId}`}
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setComparePanels((value) => ({
                        ...value,
                        [panel.panelId]: !value[panel.panelId],
                      }))
                    }
                  >
                    {comparePanels[panel.panelId] ? "Masquer" : "Comparer"}
                  </Button>
                ) : null}
                {panel.recommendedAction && panel.recommendedAction !== "keep" ? (
                  <Button
                    data-testid={`reroll-recommended-${panel.panelId}`}
                    variant="default"
                    size="sm"
                    onClick={() => rerollPanel(panel.panelId, getRerollModeFromAction(panel.recommendedAction))}
                  >
                    Reroll {panel.recommendedAction === "style_reroll" ? "style" : panel.recommendedAction === "character_reroll" ? "personnage" : "ciblé"}
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" onClick={() => rerollPanel(panel.panelId, "environment")}>
                  Reroll décor
                </Button>
                <Button variant="outline" size="sm" onClick={() => rerollPanel(panel.panelId, "character")}>
                  Reroll perso
                </Button>
                <Button variant="ghost" size="sm" onClick={() => rerollPanel(panel.panelId, "style")}>
                  Reroll style
                </Button>
                {/* Premium specialized reroll buttons */}
                {panel.axisScores.propComplianceScore !== undefined && panel.axisScores.propComplianceScore < 0.7 && (
                  <Button
                    data-testid={`reroll-prop-${panel.panelId}`}
                    variant="outline"
                    size="sm"
                    className="border-orange-500/40 text-orange-600 hover:bg-orange-500/10"
                    onClick={() => rerollPanel(panel.panelId, "prop")}
                  >
                    Reroll prop
                  </Button>
                )}
                {panel.axisScores.enemyPresenceScore !== undefined && panel.axisScores.enemyPresenceScore < 0.7 && (
                  <Button
                    data-testid={`reroll-enemy-${panel.panelId}`}
                    variant="outline"
                    size="sm"
                    className="border-red-500/40 text-red-600 hover:bg-red-500/10"
                    onClick={() => rerollPanel(panel.panelId, "enemy_presence")}
                  >
                    Reroll ennemi
                  </Button>
                )}
                {panel.axisScores.dialogueAnchorScore !== undefined && panel.axisScores.dialogueAnchorScore < 0.7 && (
                  <Button
                    data-testid={`reroll-speaker-${panel.panelId}`}
                    variant="outline"
                    size="sm"
                    className="border-blue-500/40 text-blue-600 hover:bg-blue-500/10"
                    onClick={() => rerollPanel(panel.panelId, "speaker")}
                  >
                    Reroll speaker
                  </Button>
                )}
                {panel.axisScores.subjectFocusScore !== undefined && panel.axisScores.subjectFocusScore < 0.7 && (
                  <Button
                    data-testid={`reroll-focus-${panel.panelId}`}
                    variant="outline"
                    size="sm"
                    className="border-purple-500/40 text-purple-600 hover:bg-purple-500/10"
                    onClick={() => rerollPanel(panel.panelId, "subject_focus")}
                  >
                    Reroll focus
                  </Button>
                )}
                {panel.axisScores.populationScore !== undefined && panel.axisScores.populationScore < 0.7 && (
                  <Button
                    data-testid={`reroll-population-${panel.panelId}`}
                    variant="outline"
                    size="sm"
                    className="border-teal-500/40 text-teal-600 hover:bg-teal-500/10"
                    onClick={() => rerollPanel(panel.panelId, "npc_population")}
                  >
                    Reroll PNJ
                  </Button>
                )}
                {panel.axisScores.cutawayComplianceScore !== undefined && panel.axisScores.cutawayComplianceScore < 0.7 && (
                  <Button
                    data-testid={`reroll-cutaway-${panel.panelId}`}
                    variant="outline"
                    size="sm"
                    className="border-slate-500/40 text-slate-400 hover:bg-slate-500/10"
                    onClick={() => rerollPanel(panel.panelId, "cutaway")}
                  >
                    Reroll cutaway
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
