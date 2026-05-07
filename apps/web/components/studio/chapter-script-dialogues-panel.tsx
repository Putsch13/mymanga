"use client";

import { useCallback, useMemo } from "react";
import type { ChapterStudioData } from "@manga-ai-studio/core";
import {
  normalizePremiumBlueprintTextViews,
  resolvePanelTextContractFromBlueprintPremium,
  runDialogueQaPremium,
  type PanelBlueprintPremium,
} from "@manga-ai-studio/core";
import { MessageSquareText, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ScriptDialoguesCharacterOption = {
  id: string;
  name: string;
  roleType?: string | null;
};

type BlueprintLoose = Record<string, unknown>;

function blueprintPick(bp: BlueprintLoose) {
  const panelId = typeof bp.panelId === "string" ? bp.panelId : String(bp.panelId ?? "panel");
  return {
    panelId,
    dialogueLines: (bp.dialogueLines as never) ?? null,
    textContract: bp.textContract as never,
    panelTextBundle: bp.panelTextBundle as never,
    narrationText: typeof bp.narrationText === "string" ? bp.narrationText : undefined,
    sfxCues: bp.sfxCues as never,
  };
}

function visibleIdsForBlueprint(bp: BlueprintLoose): string[] {
  if (Array.isArray(bp.mustShowCharacterIds) && (bp.mustShowCharacterIds as string[]).length > 0) {
    return bp.mustShowCharacterIds as string[];
  }
  if (Array.isArray(bp.requiredCharacterIds) && (bp.requiredCharacterIds as string[]).length > 0) {
    return bp.requiredCharacterIds as string[];
  }
  if (Array.isArray(bp.requiredCharacters)) {
    return bp.requiredCharacters as string[];
  }
  return [];
}

function offscreenIdsForBlueprint(bp: BlueprintLoose): string[] {
  if (bp.dialogueCarrier === "offscreen_allowed" && typeof bp.speakerAnchorCharacterId === "string") {
    return [bp.speakerAnchorCharacterId];
  }
  return [];
}

function runLocalDialogueQa(blueprints: BlueprintLoose[]) {
  const qaPanels: Parameters<typeof runDialogueQaPremium>[0]["panels"] = [];
  for (let i = 0; i < blueprints.length; i++) {
    const bp = blueprints[i]!;
    const pick = blueprintPick(bp);
    const resolved = resolvePanelTextContractFromBlueprintPremium(pick as never);
    qaPanels.push({
      panelNumber: typeof bp.panelNumber === "number" ? bp.panelNumber : i + 1,
      text: resolved,
      visibleCharacterIds: visibleIdsForBlueprint(bp),
      offscreenAllowedSpeakerIds: offscreenIdsForBlueprint(bp),
    });
  }
  return runDialogueQaPremium({ panels: qaPanels });
}

function normalizeAllBlueprints(bps: BlueprintLoose[]): PanelBlueprintPremium[] {
  return bps.map((bp) => normalizePremiumBlueprintTextViews(bp as unknown as PanelBlueprintPremium));
}

/**
 * P1.2 — Script & dialogues : lecture / édition par panel, normalisation texte (P0.16), aperçu QA locale.
 */
export function ChapterScriptDialoguesPanel({
  draft,
  characterCatalog,
  onUpdateDraft,
}: {
  draft: ChapterStudioData;
  characterCatalog: ScriptDialoguesCharacterOption[];
  onUpdateDraft: (next: ChapterStudioData) => void;
}) {
  const rawBlueprints = draft.productionPlan?.panelBlueprints;
  const blueprints = useMemo(
    () => (Array.isArray(rawBlueprints) ? (rawBlueprints as BlueprintLoose[]) : []),
    [rawBlueprints],
  );

  const beatLabels = useMemo(() => {
    const m = new Map<string, string>();
    const beats = (draft.productionOutline?.beats ?? []) as Array<{
      beatId?: string;
      label?: string;
      summary?: string;
    }>;
    for (const b of beats) {
      const id = typeof b.beatId === "string" ? b.beatId : "";
      if (!id) continue;
      m.set(
        id,
        typeof b.label === "string" && b.label.trim()
          ? b.label.trim()
          : typeof b.summary === "string"
            ? b.summary.trim().slice(0, 80)
            : id,
      );
    }
    return m;
  }, [draft.productionOutline?.beats]);

  const qa = useMemo(() => (blueprints.length > 0 ? runLocalDialogueQa(blueprints) : null), [blueprints]);

  const pushDraft = useCallback(
    (nextBps: BlueprintLoose[]) => {
      const normalized = normalizeAllBlueprints(nextBps);
      const prev = draft.productionPlan;
      if (!prev) return;
      onUpdateDraft({
        ...draft,
        productionPlan: {
          ...prev,
          panelBlueprints: normalized as never,
        },
      });
    },
    [draft, onUpdateDraft],
  );

  const updateLine = useCallback(
    (panelId: string, lineIndex: number, patch: { text?: string; characterId?: string | null; speaker?: string }) => {
      const next = blueprints.map((bp) => {
        if ((typeof bp.panelId === "string" ? bp.panelId : "") !== panelId) return bp;
        const lines = [...(Array.isArray(bp.dialogueLines) ? (bp.dialogueLines as Array<Record<string, unknown>>) : [])];
        const cur = lines[lineIndex];
        if (!cur) return bp;
        const name =
          patch.characterId && characterCatalog.find((c) => c.id === patch.characterId)
            ? (characterCatalog.find((c) => c.id === patch.characterId)!.name)
            : typeof patch.speaker === "string"
              ? patch.speaker
              : (cur.speaker as string) ?? "";
        lines[lineIndex] = {
          ...cur,
          ...patch,
          speaker: name || cur.speaker,
        };
        const merged = { ...bp, dialogueLines: lines };
        return normalizePremiumBlueprintTextViews(merged as PanelBlueprintPremium) as unknown as BlueprintLoose;
      });
      pushDraft(next);
    },
    [blueprints, characterCatalog, pushDraft],
  );

  const updateNarration = useCallback(
    (panelId: string, narration: string) => {
      const next = blueprints.map((bp) => {
        if ((typeof bp.panelId === "string" ? bp.panelId : "") !== panelId) return bp;
        const merged = { ...bp, narrationText: narration };
        return normalizePremiumBlueprintTextViews(merged as PanelBlueprintPremium) as unknown as BlueprintLoose;
      });
      pushDraft(next);
    },
    [blueprints, pushDraft],
  );

  const addLine = useCallback(
    (panelId: string) => {
      const next = blueprints.map((bp) => {
        if ((typeof bp.panelId === "string" ? bp.panelId : "") !== panelId) return bp;
        const lines = [...(Array.isArray(bp.dialogueLines) ? (bp.dialogueLines as Array<Record<string, unknown>>) : [])];
        const heroId = draft.characterSelection?.heroCharacterId?.trim();
        const defaultSpeakerId = heroId && characterCatalog.some((c) => c.id === heroId) ? heroId : "";
        const defaultName =
          defaultSpeakerId && characterCatalog.find((c) => c.id === defaultSpeakerId)
            ? characterCatalog.find((c) => c.id === defaultSpeakerId)!.name
            : "Personnage";
        lines.push({
          speaker: defaultName,
          text: "",
          ...(defaultSpeakerId ? { characterId: defaultSpeakerId } : {}),
        });
        const merged = { ...bp, dialogueLines: lines };
        return normalizePremiumBlueprintTextViews(merged as PanelBlueprintPremium) as unknown as BlueprintLoose;
      });
      pushDraft(next);
    },
    [blueprints, characterCatalog, draft.characterSelection?.heroCharacterId, pushDraft],
  );

  const shortenLine = useCallback(
    (panelId: string, lineIndex: number, max = 120) => {
      const bp = blueprints.find((b) => (typeof b.panelId === "string" ? b.panelId : "") === panelId);
      const lines = bp?.dialogueLines as Array<{ text?: string }> | undefined;
      const t = typeof lines?.[lineIndex]?.text === "string" ? lines[lineIndex]!.text!.trim() : "";
      if (!t) return;
      const cut = t.length > max ? `${t.slice(0, max - 1)}…` : t;
      updateLine(panelId, lineIndex, { text: cut });
    },
    [blueprints, updateLine],
  );

  if (blueprints.length === 0) return null;

  return (
    <Card className="border-border/60 bg-card/40" data-studio-field="studio-chapter-dialogues">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-muted-foreground" />
          Script &amp; dialogues
        </CardTitle>
        <p className="text-xs text-muted-foreground font-normal leading-relaxed">
          Édite les bulles ici : chaque modification réaligne le{" "}
          <span className="font-medium text-foreground/90">PanelTextContract</span> et les champs legacy (P0.16). Les
          changements sont autosauvegardés comme le reste du studio.
        </p>
        {qa ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span
              className={
                qa.valid
                  ? "rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-emerald-200"
                  : "rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-amber-100"
              }
            >
              QA locale : {qa.valid ? "OK" : "À corriger"} · {qa.issues.filter((i) => i.severity === "error").length}{" "}
              bloquant(s) · {qa.issues.filter((i) => i.severity === "warning").length} avertissement(s)
            </span>
            <span className="text-muted-foreground">
              Lisibilité manga{" "}
              <span className="tabular-nums text-foreground/90">{Math.round(qa.scores.mangaReadabilityScore * 100)}%</span>
            </span>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3 max-h-[min(70vh,720px)] overflow-y-auto pr-1">
        {blueprints.map((bp) => {
          const panelId = typeof bp.panelId === "string" ? bp.panelId : String(bp.panelId ?? "");
          const beatId = typeof bp.beatId === "string" ? bp.beatId : "";
          const beatTitle = beatLabels.get(beatId) ?? (beatId || "—");
          const num = typeof bp.panelNumber === "number" ? bp.panelNumber : "?";
          const lines = (Array.isArray(bp.dialogueLines) ? bp.dialogueLines : []) as Array<{
            speaker?: string;
            text?: string;
            characterId?: string;
          }>;
          const narration = typeof bp.narrationText === "string" ? bp.narrationText : "";

          return (
            <details
              key={panelId}
              className="rounded-lg border border-border/45 bg-background/30 px-3 py-2 text-xs open:border-violet-500/25"
            >
              <summary className="cursor-pointer list-none font-medium text-foreground/95">
                <span className="text-muted-foreground">#{num}</span> · {beatTitle}
                <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                  {lines.filter((l) => (l.text ?? "").trim()).length} bulle(s)
                  {narration.trim() ? " · narration" : ""}
                </span>
              </summary>
              <div className="mt-3 space-y-3 border-t border-border/35 pt-3" onClick={(e) => e.stopPropagation()}>
                {lines.length === 0 ? (
                  <p className="text-muted-foreground">Aucune réplique — tu peux en ajouter une.</p>
                ) : null}
                {lines.map((line, idx) => (
                  <div key={`${panelId}-dl-${idx}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:items-end">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Texte · panel {num}</Label>
                      <Textarea
                        rows={2}
                        className="text-xs"
                        value={line.text ?? ""}
                        onChange={(e) => updateLine(panelId, idx, { text: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Personnage (ID)</Label>
                      <select
                        className="h-9 w-full rounded-md border border-border/60 bg-background/80 px-2 text-xs"
                        value={typeof line.characterId === "string" ? line.characterId : ""}
                        onChange={(e) => {
                          const id = e.target.value;
                          const nm = id ? characterCatalog.find((c) => c.id === id)?.name ?? "" : "";
                          updateLine(panelId, idx, {
                            characterId: id || null,
                            speaker: nm || line.speaker || "",
                          });
                        }}
                      >
                        <option value="">— Choisir —</option>
                        {characterCatalog.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.roleType ? ` (${c.roleType})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-1 sm:flex-col sm:pb-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 gap-1 text-[10px]"
                        onClick={() => shortenLine(panelId, idx)}
                      >
                        <Scissors className="h-3 w-3" />
                        Raccourcir
                      </Button>
                    </div>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" className="text-xs" onClick={() => addLine(panelId)}>
                  + Ajouter une bulle
                </Button>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Narration (optionnel)</Label>
                  <Textarea
                    rows={2}
                    className="text-xs"
                    value={narration}
                    onChange={(e) => updateNarration(panelId, e.target.value)}
                    placeholder="Texte hors bulle…"
                  />
                </div>
              </div>
            </details>
          );
        })}
      </CardContent>
    </Card>
  );
}
