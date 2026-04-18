"use client";

/**
 * P5.2 — Carte "Violations du contrat premium".
 *
 * Consomme l'endpoint `/api/projects/:id/chapters/:chapterId/chapter-health`
 * (P5.1) et groupe les panels cassés par type d'échec (focus, cutaway, props,
 * ennemi, PNJ, dialogue, héros collapsé).
 *
 * L'utilisateur voit immédiatement quels panels doivent être réparés et peut
 * déclencher une auto-réparation ciblée via un callback `onRepair(sceneImageId,
 * repairMode)` fourni par le parent (typiquement un hook qui POST sur le flow
 * de retry avec le bon `mode` premium).
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type PremiumRepairMode =
  | "prop"
  | "subject_focus"
  | "speaker"
  | "enemy_presence"
  | "npc_population"
  | "cutaway"
  | "environment";

type PanelRow = {
  sceneImageId: string;
  panelNumber: number;
  status: string;
  hasContract: boolean;
  contractualCritical: boolean;
  breaches: Array<{ type: string; repairMode: PremiumRepairMode }>;
  heroCollapsed: boolean;
  propMissing: boolean;
  crowdExpectedButEmpty: boolean;
};

type ChapterHealthResponse = {
  summary: {
    totalPanels: number;
    breachedPanels: number;
    breachRatio: number;
    contractualCriticalBreached: number;
    panelsWithoutContract: number;
    heroCollapsedPanels: number;
    propMissingPanels: number;
    crowdMissingPanels: number;
  };
  rows: PanelRow[];
  grouped: {
    focus: PanelRow[];
    cutaway: PanelRow[];
    props: PanelRow[];
    enemy: PanelRow[];
    npc: PanelRow[];
    dialogue: PanelRow[];
    heroCollapsed: PanelRow[];
    noContract: PanelRow[];
  };
};

const CATEGORY_LABELS: Record<keyof ChapterHealthResponse["grouped"], string> = {
  focus: "Sujet mal cadré",
  cutaway: "Cutaway non respecté",
  props: "Props / armes invisibles",
  enemy: "Ennemi manquant",
  npc: "Foule / PNJ manquants",
  dialogue: "Locuteur absent",
  heroCollapsed: "Collapse sur le héros",
  noContract: "Panel sans contrat",
};

const CATEGORY_TO_REPAIR_MODE: Record<
  keyof ChapterHealthResponse["grouped"],
  PremiumRepairMode | null
> = {
  focus: "subject_focus",
  cutaway: "cutaway",
  props: "prop",
  enemy: "enemy_presence",
  npc: "npc_population",
  dialogue: "speaker",
  heroCollapsed: "subject_focus",
  noContract: null,
};

export type ContractViolationsCardProps = {
  projectId: string;
  chapterId: string;
  onRepair?: (sceneImageId: string, repairMode: PremiumRepairMode) => void | Promise<void>;
};

export function ContractViolationsCard({ projectId, chapterId, onRepair }: ContractViolationsCardProps) {
  const [data, setData] = useState<ChapterHealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/chapters/${chapterId}/chapter-health`,
        );
        if (!res.ok) throw new Error(`Chapter health ${res.status}`);
        const json = (await res.json()) as ChapterHealthResponse;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "unknown");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, chapterId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Contrat premium — santé du chapitre</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Analyse en cours…
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Contrat premium — santé du chapitre</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-destructive">
          {error ?? "Impossible de charger la santé du chapitre."}
        </CardContent>
      </Card>
    );
  }

  const { summary, grouped } = data;
  const hasAnyViolation = summary.breachedPanels > 0 || summary.panelsWithoutContract > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Contrat premium — santé du chapitre</span>
          <span className="text-sm text-muted-foreground font-normal">
            {summary.breachedPanels}/{summary.totalPanels} panels violés
            {summary.contractualCriticalBreached > 0
              ? ` (${summary.contractualCriticalBreached} critiques)`
              : ""}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasAnyViolation ? (
          <p className="text-sm text-muted-foreground">
            Tous les panels respectent leur contrat premium.
          </p>
        ) : (
          (Object.keys(grouped) as Array<keyof typeof grouped>).map((key) => {
            const panels = grouped[key];
            if (!panels || panels.length === 0) return null;
            const repairMode = CATEGORY_TO_REPAIR_MODE[key];
            return (
              <div key={key} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {CATEGORY_LABELS[key]} ({panels.length})
                  </span>
                </div>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {panels.slice(0, 6).map((p) => (
                    <li key={p.sceneImageId} className="flex items-center justify-between gap-2">
                      <span>
                        Panel #{p.panelNumber}
                        {p.contractualCritical ? " · critique" : ""}
                        {p.breaches.length > 0
                          ? ` · ${p.breaches.map((b) => b.type).join(", ")}`
                          : ""}
                      </span>
                      {onRepair && repairMode ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onRepair(p.sceneImageId, repairMode)}
                        >
                          Réparer
                        </Button>
                      ) : null}
                    </li>
                  ))}
                  {panels.length > 6 ? (
                    <li className="italic">+ {panels.length - 6} autres panels concernés</li>
                  ) : null}
                </ul>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
