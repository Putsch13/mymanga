"use client";

import { useState } from "react";
import type { ChapterStudioData } from "@manga-ai-studio/core";
import { PREMIUM_PANEL_RANGE } from "@manga-ai-studio/core";
import { Film, MessageSquareText, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type PanelBp = Record<string, unknown>;

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function joinSceneText(panels: PanelBp[]): string {
  const parts: string[] = [];
  for (const bp of panels) {
    for (const k of ["purpose", "subjectFocus", "shotType", "cameraAngle", "secondaryFocus"]) {
      const v = bp[k];
      if (typeof v === "string" && v.trim()) parts.push(v);
    }
    const notes = bp.notes;
    if (Array.isArray(notes)) {
      for (const n of notes) {
        if (typeof n === "string" && n.trim()) parts.push(n);
      }
    }
  }
  return parts.join(" ").toLowerCase();
}

function haystackIncludes(needle: string, haystack: string): boolean {
  const n = norm(needle);
  if (n.length < 2) return false;
  return haystack.includes(n);
}

function collectCharacterRefs(bp: PanelBp): string[] {
  const out = new Set<string>();
  for (const key of ["requiredCharacterIds", "mustShowCharacterIds", "requiredCharacters", "mayShowCharacterIds"]) {
    const arr = bp[key];
    if (!Array.isArray(arr)) continue;
    for (const x of arr) {
      if (typeof x === "string" && x.trim()) out.add(x.trim());
    }
  }
  return [...out];
}

function locationHints(bp: PanelBp): string[] {
  const sig = bp.requiredLocationSignals;
  if (!Array.isArray(sig)) return [];
  return sig.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 4);
}

function dialoguePreviewForPanel(bp: PanelBp): string | null {
  const dl = bp.dialogueLines;
  if (!Array.isArray(dl) || dl.length === 0) return null;
  for (const line of dl) {
    if (!line || typeof line !== "object") continue;
    const t = (line as { text?: string }).text;
    if (typeof t === "string" && t.trim()) return t.trim().slice(0, 120);
  }
  return null;
}

function sfxPreview(bp: PanelBp): string | null {
  const cues = bp.sfxCues;
  if (!Array.isArray(cues) || cues.length === 0) return null;
  const first = cues[0];
  if (typeof first === "string" && first.trim()) return first.trim();
  if (first && typeof first === "object" && "label" in first && typeof (first as { label?: string }).label === "string") {
    return (first as { label: string }).label.trim();
  }
  return null;
}

const REWRITE_PRESETS: ReadonlyArray<{ label: string; prompt: string }> = [
  { label: "Plus d’action", prompt: "Renforcer l’action et le rythme visuel." },
  { label: "Plus d’émotion", prompt: "Monter l’émotion et l’enjeu personnel du héros." },
  { label: "Décor clair", prompt: "Clarifier le décor et l’ancrage spatial." },
  { label: "Moins de dialogues", prompt: "Réduire les dialogues au profit du visuel." },
];

/**
 * P1.1 — Vue synthétique du plan par beat/scène : panels, présences, intention (must include/avoid).
 * Régénération d’un temps : réutilise l’autofill `rewrite_beat` (même pipeline que « Réécrire »).
 */
export function PremiumPlanSceneOverview({
  draft,
  onRewriteBeat,
  rewritingBeat,
}: {
  draft: ChapterStudioData;
  onRewriteBeat?: (beatId: string, instructions: string) => void | Promise<void>;
  rewritingBeat?: boolean;
}) {
  const [sceneInstructions, setSceneInstructions] = useState<Record<string, string>>({});
  const plan = draft.productionPlan;
  const blueprints = Array.isArray(plan?.panelBlueprints) ? (plan!.panelBlueprints! as PanelBp[]) : [];
  if (blueprints.length === 0) return null;

  const beats = (draft.productionOutline?.beats ?? []) as Array<{
    beatId?: string;
    label?: string;
    summary?: string;
  }>;
  const beatLabel = new Map<string, string>();
  for (const b of beats) {
    const id = typeof b.beatId === "string" ? b.beatId : "";
    if (!id) continue;
    const label =
      typeof b.label === "string" && b.label.trim()
        ? b.label.trim()
        : typeof b.summary === "string" && b.summary.trim()
          ? b.summary.trim().slice(0, 100)
          : id;
    beatLabel.set(id, label);
  }

  const byBeat = new Map<string, PanelBp[]>();
  for (const bp of blueprints) {
    const bid = typeof bp.beatId === "string" && bp.beatId.trim() ? bp.beatId : "_unassigned";
    if (!byBeat.has(bid)) byBeat.set(bid, []);
    byBeat.get(bid)!.push(bp);
  }

  const orderedBeatIds = beats.map((b) => (typeof b.beatId === "string" ? b.beatId : "")).filter(Boolean);
  const sceneKeys = [...new Set([...orderedBeatIds, ...byBeat.keys()])].filter((k) => k !== "_unassigned" || byBeat.has("_unassigned"));

  const intent = draft.chapterIntentContract;
  const mustInclude =
    intent?.mustInclude?.filter((s): s is string => typeof s === "string" && s.trim().length > 1) ?? [];
  const mustAvoid =
    intent?.mustAvoid?.filter((s): s is string => typeof s === "string" && s.trim().length > 1) ?? [];

  const chapterHaystack = joinSceneText(blueprints);

  const inRange =
    blueprints.length >= PREMIUM_PANEL_RANGE.min && blueprints.length <= PREMIUM_PANEL_RANGE.max;

  return (
    <Card className="border-border/60 bg-card/40" data-studio-field="studio-plan-contract-overview">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Film className="h-4 w-4 text-muted-foreground" />
          Plan par scène
        </CardTitle>
        <p className="text-xs text-muted-foreground font-normal leading-relaxed">
          {blueprints.length} panels
          {!inRange ? (
            <span className="text-amber-600">
              {" "}
              — hors plage premium ({PREMIUM_PANEL_RANGE.min}–{PREMIUM_PANEL_RANGE.max}) : régénère le plan.
            </span>
          ) : (
            <span> — plage premium OK.</span>
          )}{" "}
          Tu peux aussi régénérer un temps précis ci-dessous (même moteur que « Réécrire » dans le découpage).
        </p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {(mustInclude.length > 0 || mustAvoid.length > 0) && (
          <div className="rounded-lg border border-border/50 bg-muted/15 px-3 py-2 space-y-2 text-xs">
            <p className="font-medium text-foreground">Couverture intention (heuristique texte du plan)</p>
            {mustInclude.length > 0 ? (
              <ul className="space-y-1 text-muted-foreground">
                {mustInclude.map((line) => (
                  <li key={`inc-${line}`} className="flex gap-2">
                    <span className={haystackIncludes(line, chapterHaystack) ? "text-emerald-600" : "text-amber-600"}>
                      {haystackIncludes(line, chapterHaystack) ? "✓" : "○"}
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {mustAvoid.length > 0 ? (
              <ul className="space-y-1 text-muted-foreground">
                {mustAvoid.map((line) => (
                  <li key={`av-${line}`} className="flex gap-2">
                    <span className={!haystackIncludes(line, chapterHaystack) ? "text-emerald-600" : "text-red-500"}>
                      {!haystackIncludes(line, chapterHaystack) ? "✓ (absent)" : "⚠ présent"}
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        <div className="space-y-2">
          {sceneKeys.map((beatId) => {
            const panels = byBeat.get(beatId) ?? [];
            if (panels.length === 0) return null;
            const title = beatLabel.get(beatId) ?? (beatId === "_unassigned" ? "Panels sans beatId" : beatId);
            const sceneHaystack = joinSceneText(panels);
            const withDialogue = panels.filter((p) => dialoguePreviewForPanel(p)).length;
            const sample = panels.slice(0, 3);

            return (
              <details
                key={beatId}
                className="rounded-lg border border-border/40 bg-background/30 px-3 py-2"
              >
                <summary className="cursor-pointer list-none flex flex-wrap items-baseline justify-between gap-2 text-sm font-medium">
                  <span className="min-w-0 truncate">{title}</span>
                  <span className="text-xs font-normal text-muted-foreground tabular-nums shrink-0">
                    {panels.length} panels
                    {withDialogue > 0 ? ` · ${withDialogue} avec dialogue` : ""}
                  </span>
                </summary>
                <div className="mt-2 space-y-2 border-t border-border/30 pt-2 text-xs text-muted-foreground">
                  <p>
                    <span className="text-foreground/80">Aperçu panels :</span>{" "}
                    {sample.map((p, i) => {
                      const num = typeof p.panelNumber === "number" ? p.panelNumber : i + 1;
                      const purp = typeof p.purpose === "string" ? p.purpose.slice(0, 90) : "—";
                      return (
                        <span key={`${beatId}-s-${i}`}>
                          {i > 0 ? " · " : null}
                          <span className="text-foreground/90">#{num}</span> {purp}
                          {purp.length >= 90 ? "…" : ""}
                        </span>
                      );
                    })}
                    {panels.length > 3 ? " …" : ""}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <span>
                      Personnages (IDs/refs) :{" "}
                      <span className="text-foreground/90">
                        {[
                          ...new Set(panels.flatMap((p) => collectCharacterRefs(p))),
                        ].slice(0, 8).join(", ") || "—"}
                        {panels.flatMap((p) => collectCharacterRefs(p)).length > 8 ? "…" : ""}
                      </span>
                    </span>
                    <span>
                      Signaux lieu :{" "}
                      <span className="text-foreground/90">
                        {[...new Set(panels.flatMap((p) => locationHints(p)))].slice(0, 6).join(", ") || "—"}
                      </span>
                    </span>
                  </div>
                  {mustInclude.length > 0 ? (
                    <p className="text-[11px]">
                      Intention (ce temps) :{" "}
                      {mustInclude
                        .map((m) => (haystackIncludes(m, sceneHaystack) ? `✓ ${m}` : null))
                        .filter(Boolean)
                        .join(" · ") || "— (aucun must-include détecté dans ce temps)"}
                    </p>
                  ) : null}
                  {panels.some((p) => dialoguePreviewForPanel(p) || sfxPreview(p)) ? (
                    <div className="space-y-1 rounded-md bg-muted/25 px-2 py-1.5">
                      <p className="flex items-center gap-1 text-[11px] font-medium text-foreground/85">
                        <MessageSquareText className="h-3 w-3" />
                        Dialogue / SFX (extraits)
                      </p>
                      <ul className="list-inside list-disc space-y-0.5">
                        {panels
                          .map((p) => {
                            const d = dialoguePreviewForPanel(p);
                            const s = sfxPreview(p);
                            if (!d && !s) return null;
                            const num = typeof p.panelNumber === "number" ? p.panelNumber : "?";
                            return (
                              <li key={`${beatId}-dlg-${String(p.panelId ?? num)}`}>
                                <span className="text-foreground/80">#{num}</span>
                                {d ? ` « ${d}${d.length >= 120 ? "…" : ""} »` : ""}
                                {s ? ` · SFX: ${s}` : ""}
                              </li>
                            );
                          })
                          .filter(Boolean)
                          .slice(0, 6)}
                      </ul>
                    </div>
                  ) : null}
                  {onRewriteBeat && beatId !== "_unassigned" ? (
                    <div
                      className="space-y-2 rounded-md border border-violet-500/25 bg-violet-500/5 p-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                        <Wand2 className="h-3 w-3 text-violet-400" />
                        Régénérer ce temps (IA)
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {REWRITE_PRESETS.map(({ label, prompt }) => (
                          <Button
                            key={label}
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="h-7 px-2 text-[10px] leading-tight"
                            disabled={rewritingBeat}
                            onClick={(e) => {
                              e.preventDefault();
                              void onRewriteBeat(beatId, prompt);
                            }}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Instructions libres</Label>
                        <textarea
                          className="w-full min-h-[52px] rounded-md border border-border/60 bg-background/80 p-2 text-[11px] text-foreground"
                          rows={2}
                          maxLength={500}
                          placeholder="Ex. ajouter un rebondissement, préciser la menace…"
                          value={sceneInstructions[beatId] ?? ""}
                          disabled={rewritingBeat}
                          onChange={(e) =>
                            setSceneInstructions((prev) => ({ ...prev, [beatId]: e.target.value }))
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="w-full sm:w-auto gap-1"
                        disabled={rewritingBeat}
                        onClick={(e) => {
                          e.preventDefault();
                          void onRewriteBeat(beatId, (sceneInstructions[beatId] ?? "").trim());
                        }}
                      >
                        {rewritingBeat ? "Réécriture…" : "Lancer la régénération"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
