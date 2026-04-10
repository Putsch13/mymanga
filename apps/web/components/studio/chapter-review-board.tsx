"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { QualityScoreBadge } from "./quality-score-badge";
import { QAResultCard } from "./qa-result-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
      };
      rejectionReasons: string[];
      repairSuggestions: string[];
      rerollCount: number;
      promptDebug: { finalPrompt?: string; promptWarnings?: string[] };
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
  const [comparePanels, setComparePanels] = useState<Record<string, boolean>>({});
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

  async function rerollPanel(panelId: string) {
    setActionMessage(null);
    const response = await fetch(`/api/scene-images/${panelId}/retry?mode=character`, { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string; ok?: boolean };
    setActionMessage(response.ok ? `Reroll lancé pour ${panelId}.` : data.message ?? data.error ?? "Le reroll a échoué.");
    await refresh();
  }

  async function completeReview() {
    setActionMessage(null);
    const response = await fetch(`/api/projects/${input.projectId}/chapters/${input.chapterId}/review/complete`, {
      method: "POST",
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string; details?: unknown };
    if (response.ok) {
      setActionMessage("Revue clôturée.");
    } else {
      setActionMessage(data.message ?? data.error ?? "La clôture de review a échoué.");
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
          <div className="flex items-end justify-end">
            <Button data-testid="review-complete-button" onClick={completeReview} disabled={loading}>Clôturer la review</Button>
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
              <p className="text-muted-foreground">
                Catégorie {panel.panelCategory ?? "?"} · refs {panel.referencePolicy ?? "?"} · raisons critiques {panel.criticalityReasons.join(", ") || "aucune"}
              </p>
              <p className={panel.qaWasRequired && !panel.qaWasExecuted ? "text-red-500" : "text-muted-foreground"}>
                QA visuelle: {panel.qaWasExecuted ? "exécutée" : panel.qaWasRequired ? `manquante (${panel.qaFailureReason ?? "indisponible"})` : `non requise (${panel.qaBypassReason ?? "panel non critique"})`}
              </p>
              <p>{panel.prompt ?? "Aucun prompt."}</p>
              {panel.promptDebug?.finalPrompt ? (
                <p className="rounded-lg bg-background/50 p-2 text-xs text-muted-foreground">{panel.promptDebug.finalPrompt}</p>
              ) : null}
              {panel.promptDebug?.promptWarnings?.length ? (
                <p className="text-xs text-amber-500">Warnings: {panel.promptDebug.promptWarnings.join(", ")}</p>
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
              <div className="flex justify-end gap-2">
                {panel.previousImageUrl ? (
                  <Button
                    data-testid={`compare-panel-${panel.panelId}`}
                    variant="secondary"
                    onClick={() =>
                      setComparePanels((value) => ({
                        ...value,
                        [panel.panelId]: !value[panel.panelId],
                      }))
                    }
                  >
                    {comparePanels[panel.panelId] ? "Masquer comparaison" : "Comparer avec la version précédente"}
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => rerollPanel(panel.panelId)}>
                  Reroll panel
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
