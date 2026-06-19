"use client";

/**
 * READ-PREMIUM — Slide-panel "Inspecter" du reader.
 *
 * Extrait de `manga-book-reader.tsx` pour réduire la taille du composant
 * principal (1175 lignes → ~940 lignes après extraction). C'est un drawer
 * latéral droit qui regroupe trois sections :
 *   1. "Mémoire & statut" : narrativeSummary, image stats, contrôles de
 *      créativité, qualityReport release.
 *   2. "Debug rendu" : le `panelDebug` détaillé (release/background/style/
 *      vision scores, warnings, retry par mode environment/character/
 *      composition).
 *   3. "État canonique" + "Fils narratifs ouverts" : worldState, character
 *      states, openThreads et continuityWarnings.
 *
 * Aucune logique métier ici — uniquement du rendu et du dispatch d'actions
 * passées en props (`onClose`, `onRetryPanel`).
 */

import { SlidersHorizontal, X } from "lucide-react";
import { cn } from "@manga-ai-studio/ui";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CanonStateData, ReaderResponse } from "./reader-types";

export type RetryPanelMode = "environment" | "character" | "composition";

export interface ReaderInspectDrawerProps {
  open: boolean;
  onClose: () => void;
  memorySummary: string | null;
  degradedReaderWarning: string | null;
  imageStats: ReaderResponse["imageStats"];
  activeJob: ReaderResponse["activeJob"];
  generationDiagnostics: ReaderResponse["generationDiagnostics"];
  canonState: CanonStateData | null;
  retryingPanel: string | null;
  onRetryPanel: (panelId: string, mode: RetryPanelMode) => void;
}

export function ReaderInspectDrawer({
  open,
  onClose,
  memorySummary,
  degradedReaderWarning,
  imageStats,
  activeJob,
  generationDiagnostics,
  canonState,
  retryingPanel,
  onRetryPanel,
}: ReaderInspectDrawerProps) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 z-[70] transition-opacity duration-200",
        open ? "opacity-100" : "opacity-0",
      )}
      aria-hidden={!open}
    >
      <div
        className={cn(
          "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200",
          open ? "pointer-events-auto opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-border/60 bg-card shadow-2xl transition-transform duration-300 ease-out",
          open ? "pointer-events-auto translate-x-0" : "translate-x-full",
        )}
        role="dialog"
        aria-label="Inspecter le chapitre"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border/60 bg-card/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold">Inspecter le chapitre</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4 p-4">
          <Card className="border-border/60 bg-card/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Mémoire & statut</CardTitle>
              <CardDescription className="text-xs">
                Ce qui nourrit les chapitres suivants.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted-foreground">
              <p>{memorySummary ?? "Aucun résumé mémoire disponible pour l'instant."}</p>
              {degradedReaderWarning ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-amber-200">
                  {degradedReaderWarning}
                </div>
              ) : null}
              {imageStats ? (
                <div className="flex flex-wrap gap-2">
                  <span>
                    {imageStats.completed}/{imageStats.total} images prêtes
                  </span>
                  {imageStats.pending ? <span>· {imageStats.pending} en attente</span> : null}
                  {imageStats.failed ? <span>· {imageStats.failed} en échec</span> : null}
                </div>
              ) : null}
              <p>Job actif : {activeJob ? activeJob.status : "aucun"}</p>
              {generationDiagnostics?.creativityControls ? (
                <p>
                  Contrôles : N {generationDiagnostics.creativityControls.noveltyLevel ?? "?"}
                  {" · "}W {generationDiagnostics.creativityControls.worldStrictness ?? "?"}
                  {" · "}X {generationDiagnostics.creativityControls.visualExoticism ?? "?"}
                  {" · "}PNJ {generationDiagnostics.creativityControls.npcVariety ?? "?"}
                  {" · "}Env {generationDiagnostics.creativityControls.environmentRichness ?? "?"}
                </p>
              ) : null}
              {generationDiagnostics?.qualityReport ? (
                <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/10 px-3 py-2 text-cyan-100">
                  Release{" "}
                  {(Number(generationDiagnostics.qualityReport.averageReleaseScore ?? 0) * 100).toFixed(0)}
                  /100
                  {" · "}Seuil{" "}
                  {(Number(generationDiagnostics.qualityReport.releaseThreshold ?? 0) * 100).toFixed(0)}
                  /100
                  {" · "}
                  {generationDiagnostics.qualityReport.premiumReleaseAccepted
                    ? "Premium OK"
                    : "Release dégradée"}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {generationDiagnostics?.panelDebug && generationDiagnostics.panelDebug.length > 0 ? (
            <Card className="border-border/60 bg-card/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Debug rendu</CardTitle>
                <CardDescription className="text-xs">
                  Diagnostic de tous les panels ({generationDiagnostics.panelDebug.length}).
                </CardDescription>
              </CardHeader>
              <CardContent className="max-h-96 space-y-2 overflow-y-auto">
                {generationDiagnostics.panelDebug.map((panel) => (
                  <div
                    key={panel.panelId}
                    className="rounded border border-stone-800/80 bg-black/20 p-2 text-[11px]"
                  >
                    <p className="font-medium text-stone-100">
                      Panel {panel.panelNumber} · {panel.status ?? "?"} · {panel.provider ?? "?"}
                    </p>
                    <p className="text-muted-foreground">
                      R {(panel.releaseScore ?? 0).toFixed(2)} · F{" "}
                      {(panel.backgroundPresenceScore ?? 0).toFixed(2)} · I{" "}
                      {(panel.interactionScore ?? 0).toFixed(2)} · S{" "}
                      {(panel.styleConsistencyScore ?? 0).toFixed(2)} · V{" "}
                      {panel.visionEnabled ? (panel.visionScore ?? 0).toFixed(2) : "off"} · rerolls{" "}
                      {panel.rerollCount}
                    </p>
                    {panel.promptDebug?.promptWarnings?.length ? (
                      <p className="text-[10px] text-amber-500">
                        warnings : {panel.promptDebug.promptWarnings.join(", ")}
                      </p>
                    ) : null}
                    {panel.issues.length > 0 ? (
                      <p className="mt-1 text-[10px] text-amber-300/80">
                        {panel.issues
                          .slice(0, 2)
                          .map((issue) => issue.message ?? issue.type ?? "issue")
                          .join(" | ")}
                      </p>
                    ) : null}
                    {panel.visionEnabled && panel.visionFindings.length > 0 ? (
                      <p className="mt-1 text-[10px] text-cyan-300/80">
                        Vision : {panel.visionFindings.slice(0, 2).join(" | ")}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px]"
                        disabled={retryingPanel !== null}
                        onClick={() => onRetryPanel(panel.panelId, "environment")}
                      >
                        {retryingPanel === `${panel.panelId}:environment` ? "…" : "Décor"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px]"
                        disabled={retryingPanel !== null}
                        onClick={() => onRetryPanel(panel.panelId, "character")}
                      >
                        {retryingPanel === `${panel.panelId}:character` ? "…" : "Personnage"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px]"
                        disabled={retryingPanel !== null}
                        onClick={() => onRetryPanel(panel.panelId, "composition")}
                      >
                        {retryingPanel === `${panel.panelId}:composition` ? "…" : "Composition"}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {canonState?.hasCanonState ? (
            <Card className="border-violet-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">État canonique</CardTitle>
                <CardDescription className="text-xs">
                  Monde et personnages à la fin du chapitre.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {canonState.worldState ? (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold text-violet-400">Monde</h4>
                    {canonState.worldState.activeLocations.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Lieux : {canonState.worldState.activeLocations.join(", ")}
                      </p>
                    ) : null}
                    {canonState.worldState.activeThreats.length > 0 ? (
                      <p className="text-xs text-orange-400/80">
                        Menaces : {canonState.worldState.activeThreats.join(", ")}
                      </p>
                    ) : null}
                    {canonState.worldState.activeMysteries.length > 0 ? (
                      <p className="text-xs text-purple-400/80">
                        Mystères : {canonState.worldState.activeMysteries.join(", ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {canonState.characterStates && canonState.characterStates.length > 0 ? (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold text-violet-400">Personnages</h4>
                    <div className="space-y-2">
                      {canonState.characterStates.slice(0, 5).map((cs, idx) => (
                        <div
                          key={idx}
                          className="rounded border border-stone-800 bg-stone-950/30 p-2"
                        >
                          <p className="text-xs font-medium">{cs.characterName}</p>
                          {cs.currentState.location ? (
                            <p className="text-[10px] text-muted-foreground">
                              Lieu : {cs.currentState.location}
                            </p>
                          ) : null}
                          {cs.currentState.emotion ? (
                            <p className="text-[10px] text-blue-400/80">
                              État : {cs.currentState.emotion}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {canonState.continuityWarnings && canonState.continuityWarnings.length > 0 ? (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold text-red-400">Alertes cohérence</h4>
                    <ul className="list-inside list-disc space-y-1 text-[10px] text-red-300/80">
                      {canonState.continuityWarnings.slice(0, 10).map((warning, idx) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {canonState?.hasCanonState &&
          canonState.openThreads &&
          canonState.openThreads.length > 0 ? (
            <Card className="border-amber-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Fils narratifs ouverts</CardTitle>
                <CardDescription className="text-xs">Intrigues à résoudre.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {canonState.openThreads.slice(0, 8).map((thread, idx) => (
                  <div
                    key={idx}
                    className="rounded border border-amber-800/50 bg-amber-950/20 p-2"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium">{thread.label}</p>
                      <span
                        className={cn(
                          "text-[9px] font-bold uppercase",
                          thread.priority === "high"
                            ? "text-red-400"
                            : thread.priority === "medium"
                              ? "text-amber-400"
                              : "text-muted-foreground",
                        )}
                      >
                        {thread.priority}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {thread.description}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
