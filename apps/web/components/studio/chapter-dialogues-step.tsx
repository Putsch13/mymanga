"use client";

/**
 * P0 (mai 2026) — Étape wizard "Script & Dialogues".
 *
 * Permet à l'utilisateur de :
 *   1. générer les dialogues IA AVANT le launch (POST /dialogue-draft)
 *   2. visualiser les bulles par scène/panel
 *   3. corriger un speaker / éditer un texte
 *   4. relancer la QA dialogue premium
 *
 * Persistance : la route /dialogue-draft écrit déjà le snapshot studio
 * (productionPlan.panelBlueprints + chapterDialogueContract). Les éditions
 * locales appellent `onUpdateDraft` qui passe par la route /studio (PATCH).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  MessageSquareText,
  Pencil,
  Sparkles,
  Wand2,
} from "lucide-react";
import type {
  ChapterStudioData,
  DialogueContract,
  DialogueContractValidationResult,
  PanelBlueprintPremium,
} from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ChapterDialoguesCharacterOption = {
  id: string;
  name: string;
  roleType?: string | null;
};

type DialogueDraftPanelView = {
  panelId: string;
  pageNumber: number | null;
  panelNumber: number | null;
  speakerId: string | null;
  speakerName: string | null;
  text: string;
  speakerVisible: boolean;
};

type DialogueDraftResponse = {
  ok: boolean;
  contract: DialogueContract;
  validation: DialogueContractValidationResult;
  panels: DialogueDraftPanelView[];
  premiumErrors: string[];
  persisted: boolean;
  panelBlueprints?: PanelBlueprintPremium[];
};

function asArray<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

function panelLabel(view: DialogueDraftPanelView): string {
  const page = view.pageNumber ? `p.${view.pageNumber}` : "";
  const panel = view.panelNumber ? `case ${view.panelNumber}` : view.panelId;
  return [page, panel].filter(Boolean).join(" · ");
}

function viewsFromDraft(draft: ChapterStudioData): DialogueDraftPanelView[] {
  const blueprints = asArray(
    (draft.productionPlan?.panelBlueprints as PanelBlueprintPremium[] | null | undefined) ?? null,
  );
  if (blueprints.length === 0) return [];
  const out: DialogueDraftPanelView[] = [];
  for (const bp of blueprints) {
    const lines = asArray(
      bp.dialogueLines as Array<{ speaker?: string; text?: string; characterId?: string | null }> | null,
    );
    if (lines.length === 0) continue;
    for (const dl of lines) {
      out.push({
        panelId: bp.panelId,
        pageNumber: bp.pageNumber ?? null,
        panelNumber: bp.panelNumber ?? null,
        speakerId: typeof dl.characterId === "string" && dl.characterId.length > 0 ? dl.characterId : null,
        speakerName: typeof dl.speaker === "string" ? dl.speaker : null,
        text: typeof dl.text === "string" ? dl.text : "",
        speakerVisible: true,
      });
    }
  }
  return out;
}

export function ChapterDialoguesStep({
  projectId,
  chapterId,
  draft,
  characterCatalog,
  onUpdateDraft,
  onContinue,
}: {
  projectId: string;
  chapterId: string;
  draft: ChapterStudioData;
  characterCatalog?: ChapterDialoguesCharacterOption[];
  onUpdateDraft: (next: ChapterStudioData) => void;
  onContinue: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [premiumErrors, setPremiumErrors] = useState<string[]>([]);
  const [response, setResponse] = useState<DialogueDraftResponse | null>(null);
  const [editingPanelId, setEditingPanelId] = useState<string | null>(null);

  const catalog = useMemo(() => characterCatalog ?? [], [characterCatalog]);
  const planReady = (draft.productionPlan?.panelBlueprints?.length ?? 0) > 0;
  const persistedDraftViews = useMemo(() => viewsFromDraft(draft), [draft]);
  const views: DialogueDraftPanelView[] = response?.panels ?? persistedDraftViews;

  const groupedByPage = useMemo(() => {
    const map = new Map<string | number, DialogueDraftPanelView[]>();
    for (const v of views) {
      const key = v.pageNumber ?? "—";
      const arr = map.get(key) ?? [];
      arr.push(v);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      const an = typeof a === "number" ? a : Number.MAX_SAFE_INTEGER;
      const bn = typeof b === "number" ? b : Number.MAX_SAFE_INTEGER;
      return an - bn;
    });
  }, [views]);

  // AUDIT-V8 — refs tenues à jour pour éviter de recréer `handleGenerate`
  // à chaque frappe (sinon useCallback réclame `draft` et `onUpdateDraft`
  // dans deps, ce qui invalide la stabilité de la callback).
  const draftRef = useRef(draft);
  const onUpdateDraftRef = useRef(onUpdateDraft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    onUpdateDraftRef.current = onUpdateDraft;
  }, [onUpdateDraft]);

  const handleGenerate = useCallback(async () => {
    if (!planReady) return;
    setGenerating(true);
    setError(null);
    setPremiumErrors([]);
    try {
      const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/dialogue-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = (await res.json()) as DialogueDraftResponse & { error?: string; code?: string };
      if (!res.ok) {
        setError(data.error ?? "La génération des dialogues IA a échoué.");
        if (Array.isArray(data.premiumErrors)) setPremiumErrors(data.premiumErrors);
        return;
      }
      setResponse(data);
      setPremiumErrors(data.premiumErrors ?? []);

      // Resync draft with server-persisted blueprints so that autosave and
      // tab-switches don't overwrite the dialogues with the old draft.
      if (data.persisted && Array.isArray(data.panelBlueprints) && data.panelBlueprints.length > 0) {
        const currentDraft = draftRef.current;
        onUpdateDraftRef.current({
          ...currentDraft,
          productionPlan: {
            ...currentDraft.productionPlan!,
            panelBlueprints: data.panelBlueprints as never,
          },
          chapterDialogueContract: data.contract as never,
        });
      }
    } catch {
      setError("Impossible de joindre le serveur. Réessaie.");
    } finally {
      setGenerating(false);
    }
  }, [chapterId, planReady, projectId]);

  const handleEditLine = useCallback(
    (panelId: string, patch: { speakerId?: string | null; text?: string }) => {
      const blueprints = asArray(
        (draft.productionPlan?.panelBlueprints as PanelBlueprintPremium[] | null | undefined) ?? null,
      );
      if (blueprints.length === 0) return;

      const nextBlueprints = blueprints.map((bp) => {
        if (bp.panelId !== panelId) return bp;
        const lines = asArray(
          bp.dialogueLines as Array<{ speaker?: string; text?: string; characterId?: string | null }> | null,
        );
        if (lines.length === 0) return bp;
        const speakerName =
          typeof patch.speakerId === "string" && catalog.find((c) => c.id === patch.speakerId)?.name;
        const nextLines = lines.map((dl, idx) =>
          idx === 0
            ? {
                ...dl,
                text: typeof patch.text === "string" ? patch.text : dl.text,
                characterId:
                  patch.speakerId !== undefined ? patch.speakerId ?? null : dl.characterId,
                speaker: speakerName ?? dl.speaker,
              }
            : dl,
        );
        const next: PanelBlueprintPremium = {
          ...bp,
          dialogueLines: nextLines as PanelBlueprintPremium["dialogueLines"],
        };
        if (patch.speakerId) {
          next.speakerAnchorCharacterId = patch.speakerId;
        }
        return next;
      });

      onUpdateDraft({
        ...draft,
        productionPlan: {
          ...(draft.productionPlan!),
          panelBlueprints: nextBlueprints,
        },
      });
    },
    [catalog, draft, onUpdateDraft],
  );

  const totalLines = views.length;
  const unresolved = views.filter((v) => !v.speakerId).length;
  const validation = response?.validation;

  return (
    <div data-studio-section="dialogues" className="max-w-3xl space-y-6">
      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquareText className="size-4 text-primary" />
            Script & Dialogues
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Génère les dialogues IA avant la mise en images. Tu pourras relire chaque bulle, corriger
            le speaker et le texte, puis verrouiller l’étape avant le launch.
          </p>

          {!planReady ? (
            <div className="rounded-md border border-amber-200/60 bg-amber-50/10 p-3 text-sm text-amber-200">
              Le plan du chapitre est vide. Reviens à l’étape « Plan » pour générer les blueprints,
              puis reviens ici.
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={handleGenerate} disabled={!planReady || generating}>
              {generating ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Dialoguiste IA en cours…
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 size-4" /> Générer les dialogues IA
                </>
              )}
            </Button>
            <span className="text-xs text-muted-foreground">
              {totalLines > 0
                ? `${totalLines} bulles · ${unresolved} sans speaker identifié`
                : "Aucun dialogue pour l’instant"}
            </span>
          </div>

          {error ? (
            <div className="rounded-md border border-red-300/40 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {premiumErrors.length > 0 ? (
            <div className="rounded-md border border-red-300/40 bg-red-500/10 p-3 text-sm text-red-200 space-y-1">
              <p className="font-medium">QA dialogue premium — bloquant :</p>
              <ul className="list-disc list-inside text-xs">
                {premiumErrors.slice(0, 8).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {validation && validation.issues.length > 0 ? (
            <div className="rounded-md border border-amber-300/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              <p className="font-medium mb-1">Avertissements QA ({validation.issues.length})</p>
              <ul className="space-y-0.5">
                {validation.issues.slice(0, 6).map((iss, idx) => (
                  <li key={`${iss.code}-${idx}`}>
                    [{iss.severity}] {iss.code} — panel {iss.panelId ?? "?"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {groupedByPage.length === 0 ? null : (
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="text-base">Bulles ({totalLines})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {groupedByPage.map(([pageKey, items]) => (
              <div key={String(pageKey)} className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {typeof pageKey === "number" ? `Page ${pageKey}` : "Hors page"}
                </p>
                <div className="space-y-2">
                  {items.map((view) => {
                    const isEditing = editingPanelId === view.panelId;
                    const speakerOption = view.speakerId
                      ? catalog.find((c) => c.id === view.speakerId)
                      : null;
                    return (
                      <div
                        key={`${view.panelId}-${view.text.slice(0, 8)}`}
                        className="rounded-md border border-border/40 bg-background/30 p-3 text-sm space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">{panelLabel(view)}</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingPanelId(isEditing ? null : view.panelId)}
                          >
                            <Pencil className="size-3.5 mr-1" />
                            {isEditing ? "Fermer" : "Éditer"}
                          </Button>
                        </div>

                        {isEditing ? (
                          <div className="space-y-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Speaker</Label>
                              <select
                                value={view.speakerId ?? ""}
                                onChange={(e) =>
                                  handleEditLine(view.panelId, { speakerId: e.target.value || null })
                                }
                                className="w-full rounded-md border border-border/50 bg-background px-2 py-1 text-xs"
                              >
                                <option value="">— Non identifié —</option>
                                {catalog.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                    {c.roleType ? ` (${c.roleType})` : ""}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Texte</Label>
                              <Textarea
                                rows={2}
                                value={view.text}
                                onChange={(e) =>
                                  handleEditLine(view.panelId, { text: e.target.value })
                                }
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-xs font-medium">
                              {speakerOption?.name ?? view.speakerName ?? (
                                <span className="text-red-300">??? speaker non identifié</span>
                              )}
                            </p>
                            <p className="text-sm">{view.text}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={onContinue}
                disabled={generating || (premiumErrors.length > 0 && totalLines === 0)}
              >
                <Wand2 className="mr-2 size-4" /> Continuer vers la génération
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {planReady && totalLines === 0 && !generating ? (
        <p className="text-xs text-muted-foreground">
          Aucune bulle pour l’instant. Clique sur « Générer les dialogues IA » pour que le dialoguiste
          IA propose une première version, puis ajuste avant le launch.
        </p>
      ) : null}
    </div>
  );
}
