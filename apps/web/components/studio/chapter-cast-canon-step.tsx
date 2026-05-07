"use client";

import { useEffect, useState } from "react";
import {
  type ChapterReadinessIssue,
  type ChapterStudioData,
  applyHeroInvariant,
  isAntagonistRole,
  isHeroRole,
  isSupportingRole,
} from "@manga-ai-studio/core";
import { Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FieldTooltip } from "@/components/ui/field-tooltip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CharacterPicker } from "./character-picker";
import { TagInput } from "./tag-input";
import { StudioInlineIssues } from "./studio-inline-issues";
import { ChapterHeroWizardPanel } from "@/features/studio/wizard/chapter-hero-wizard-panel";
import { ChapterSecondaryCastWizardPanel } from "@/features/studio/wizard/chapter-secondary-cast-wizard-panel";
import { ChapterLocationsWizardPanel } from "@/features/studio/wizard/chapter-locations-wizard-panel";
import { ChapterLivingWorldWizardPanel } from "@/features/studio/wizard/chapter-living-world-wizard-panel";
import { ChapterVisualStyleWizardPanel } from "@/features/studio/wizard/chapter-visual-style-wizard-panel";
import type { HeroWizardReadiness } from "@/features/studio/wizard/chapter-wizard-model";

type CharacterCatalogEntry = {
  id: string;
  name: string;
  roleType?: string | null;
  imageUrl?: string | null;
};

export function ChapterCastCanonStep({
  draft,
  issues,
  warningItems,
  characterCatalog,
  projectId,
  chapterId,
  chapterNumber,
  onHeroReadinessChange,
  onIssueAction,
  onUpdateDraft,
  onContinue,
}: {
  draft: ChapterStudioData;
  issues: ChapterReadinessIssue[];
  warningItems: ChapterReadinessIssue[];
  characterCatalog?: CharacterCatalogEntry[];
  projectId: string;
  chapterId?: string;
  chapterNumber?: number | null;
  onHeroReadinessChange?: (readiness: HeroWizardReadiness | null) => void;
  onIssueAction: (issue: ChapterReadinessIssue) => void | Promise<void>;
  onUpdateDraft: (next: ChapterStudioData, step?: "characters" | "canon") => void;
  onContinue: () => void;
}) {
  const catalog = characterCatalog ?? [];
  const heroes = catalog.filter((c) => isHeroRole(c.roleType));
  const antagonists = catalog.filter((c) => isAntagonistRole(c.roleType));
  const mainChars = catalog.filter(
    (c) => isHeroRole(c.roleType) || isSupportingRole(c.roleType),
  );

  // Auto-sélection silencieuse du héros si heroCharacterId vide mais actifs contiennent un héros
  const autoHeroId =
    !draft.characterSelection?.heroCharacterId && heroes.length > 0
      ? (heroes.find((h) => draft.characterSelection?.activeCharacterIds?.includes(h.id)) ?? heroes[0])?.id ?? null
      : null;

  useEffect(() => {
    if (autoHeroId) {
      updateCharacterSelection({ heroCharacterId: autoHeroId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoHeroId]);

  function updateCharacterSelection(patch: Partial<NonNullable<ChapterStudioData["characterSelection"]>>) {
    const merged: NonNullable<ChapterStudioData["characterSelection"]> = {
      heroCharacterId: draft.characterSelection?.heroCharacterId ?? null,
      secondaryHeroCharacterId: draft.characterSelection?.secondaryHeroCharacterId ?? null,
      deuteragonistCharacterId: draft.characterSelection?.deuteragonistCharacterId ?? null,
      coreCastCharacterIds: draft.characterSelection?.coreCastCharacterIds ?? [],
      activeCharacterIds: draft.characterSelection?.activeCharacterIds ?? [],
      lockedCharacterIds: draft.characterSelection?.lockedCharacterIds ?? [],
      speakingCharacterIds: draft.characterSelection?.speakingCharacterIds ?? [],
      evolvingCharacterIds: draft.characterSelection?.evolvingCharacterIds ?? [],
      antagonistCharacterIds: draft.characterSelection?.antagonistCharacterIds ?? [],
      recurringNpcIds: draft.characterSelection?.recurringNpcIds ?? [],
      ...patch,
    };
    const hero = typeof merged.heroCharacterId === "string" ? merged.heroCharacterId.trim() : "";
    const finalSelection = hero ? applyHeroInvariant(merged, hero) : merged;
    onUpdateDraft({
      ...draft,
      characterSelection: finalSelection,
    }, "characters");
  }

  const [recurringNpcs, setRecurringNpcs] = useState<Array<{
    stableNpcId: string;
    label: string;
    shortVisualCore: string;
    appearanceCount: number;
    isPromotedToCharacter: boolean;
  }>>([]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/recurring-npcs`)
      .then(r => r.json())
      .then(data => setRecurringNpcs(data.npcs ?? []))
      .catch(() => {});
  }, [projectId]);

  async function handlePromoteNpc(stableNpcId: string, currentLabel: string) {
    const name = window.prompt("Nom de ce personnage dans la série :", currentLabel);
    if (!name) return;
    const res = await fetch(`/api/projects/${projectId}/recurring-npcs/${stableNpcId}/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (data.success) {
      const updated = await fetch(`/api/projects/${projectId}/recurring-npcs`).then(r => r.json());
      setRecurringNpcs(updated.npcs ?? []);
    }
  }

  const [npcRawDescription, setNpcRawDescription] = useState("");
  const [resolvingNpc, setResolvingNpc] = useState(false);
  const [npcResolveError, setNpcResolveError] = useState<string | null>(null);
  const [resolvedNpcs, setResolvedNpcs] = useState<Array<{
    label: string;
    promptFragment: string;
    narrativeHook: string;
    strategy: string;
  }>>([]);

  // P0 (mai 2026) — fusionne les PNJ persistés en draft (`chapterEntities.npcs`)
  // avec ceux qu'on vient juste de résoudre dans cette session, pour que la liste
  // affichée survive au refresh et que la suppression cible la bonne source.
  const persistedNpcRows = (draft.chapterEntities?.npcs ?? []).map((n) => ({
    source: "draft" as const,
    id: n.id,
    label: n.label,
    promptFragment: n.appearance ?? "",
    narrativeHook: n.narrativeRole ?? "",
    strategy: "draft_persisted",
  }));
  const sessionNpcRows = resolvedNpcs
    .filter(
      (r) =>
        !persistedNpcRows.some(
          (p) => p.label.trim().toLowerCase() === r.label.trim().toLowerCase(),
        ),
    )
    .map((r, idx) => ({
      source: "session" as const,
      id: `session_${idx}`,
      label: r.label,
      promptFragment: r.promptFragment,
      narrativeHook: r.narrativeHook,
      strategy: r.strategy,
    }));
  const allNpcRows = [...persistedNpcRows, ...sessionNpcRows];

  function removeNpcRow(row: { source: "draft" | "session"; id: string; label: string }) {
    if (row.source === "session") {
      setResolvedNpcs((prev) => prev.filter((r) => r.label !== row.label));
      return;
    }
    const remaining = (draft.chapterEntities?.npcs ?? []).filter((n) => n.id !== row.id);
    onUpdateDraft(
      {
        ...draft,
        chapterEntities: {
          npcs: remaining,
          creatures: draft.chapterEntities?.creatures ?? [],
          props: draft.chapterEntities?.props ?? [],
          vehicles: draft.chapterEntities?.vehicles ?? [],
          factions: draft.chapterEntities?.factions ?? [],
        },
      },
      "characters",
    );
  }

  async function handleResolveNpc() {
    if (!npcRawDescription.trim() || resolvingNpc) return;
    setResolvingNpc(true);
    setNpcResolveError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/npc-resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawDescription: npcRawDescription,
          universe: (draft.chapterIntentContract?.understoodPitch ?? "").slice(0, 200) || "manga",
          tone: draft.chapterIntentContract?.tone?.trim() || "dramatic",
        }),
      });
      const data = await res.json() as {
        error?: string;
        message?: string;
        code?: string;
        topMatch?: { label: string; visualCues: string[]; interactionHooks: string[] };
        // AUDIT COMMIT 6 — on consomme en priorité `visualPromptFragment` ;
        // `promptFragment` reste en back-compat court-terme.
        visualPromptFragment?: string;
        promptFragment?: string;
        narrativeHook?: string;
        strategy?: string;
      };
      if (!res.ok) {
        const msg =
          typeof data.message === "string" && data.message.trim().length > 0
            ? data.message
            : res.status === 503 || res.status === 502
              ? "La résolution PNJ par IA n’a pas abouti. Réessaie dans un instant ou vérifie la configuration OpenAI."
              : "La résolution PNJ a échoué.";
        setNpcResolveError(msg);
        return;
      }
      if (data.topMatch) {
        const resolved = {
          label: data.topMatch!.label,
          promptFragment:
            data.visualPromptFragment
            ?? data.promptFragment
            ?? data.topMatch!.visualCues.slice(0, 2).join(", "),
          narrativeHook: data.narrativeHook ?? data.topMatch!.interactionHooks[0] ?? "",
          strategy: data.strategy ?? "catalog_match",
        };
        setResolvedNpcs((prev) => [...prev, resolved]);

        // P0 (mai 2026) — persister le PNJ résolu dans le studio draft
        // (`chapterEntities.npcs`) afin qu'il survive au refresh et alimente le
        // VisualWorldContract sans rester en state local.
        const existingNpcs = draft.chapterEntities?.npcs ?? [];
        const npcId = `npc_${Math.random().toString(36).slice(2, 10)}`;
        const nextNpc = {
          id: npcId,
          label: resolved.label,
          narrativeRole: resolved.narrativeHook || null,
          appearance: resolved.promptFragment || null,
          behavior: null,
          panelMoments: [] as string[],
          recurrence: "one_shot" as const,
        };
        const alreadyPresent = existingNpcs.some(
          (n) => (n.label ?? "").trim().toLowerCase() === nextNpc.label.trim().toLowerCase(),
        );
        if (!alreadyPresent) {
          onUpdateDraft(
            {
              ...draft,
              chapterEntities: {
                npcs: [...existingNpcs, nextNpc],
                creatures: draft.chapterEntities?.creatures ?? [],
                props: draft.chapterEntities?.props ?? [],
                vehicles: draft.chapterEntities?.vehicles ?? [],
                factions: draft.chapterEntities?.factions ?? [],
              },
            },
            "characters",
          );
        }

        setNpcRawDescription("");
      }
    } catch {
      setNpcResolveError("Impossible de contacter le serveur. Réessaie.");
    } finally {
      setResolvingNpc(false);
    }
  }

  function updateCanon(patch: Partial<NonNullable<ChapterStudioData["chapterCanon"]>>) {
    onUpdateDraft({
      ...draft,
      chapterCanon: {
        heroOutfitId: draft.chapterCanon?.heroOutfitId ?? null,
        activeCharacters: draft.chapterCanon?.activeCharacters ?? [],
        allowedVisualChanges: draft.chapterCanon?.allowedVisualChanges ?? [],
        currentLocation: draft.chapterCanon?.currentLocation ?? null,
        weather: draft.chapterCanon?.weather ?? null,
        timeOfDay: draft.chapterCanon?.timeOfDay ?? null,
        injuries: draft.chapterCanon?.injuries ?? [],
        carriedObjects: draft.chapterCanon?.carriedObjects ?? [],
        continuityNotes: draft.chapterCanon?.continuityNotes ?? [],
        inheritedFromPreviousChapter: draft.chapterCanon?.inheritedFromPreviousChapter ?? true,
        universeConstraints: draft.chapterCanon?.universeConstraints ?? [],
        ...patch,
      },
    }, "canon");
  }

  return (
    <div data-studio-section="cast_canon" className="max-w-3xl space-y-6">
      {chapterNumber === 1 && chapterId && onHeroReadinessChange ? (
        <ChapterHeroWizardPanel
          projectId={projectId}
          chapterId={chapterId}
          draft={draft}
          characterCatalog={catalog}
          onUpdateDraft={onUpdateDraft}
          onHeroReadinessChange={onHeroReadinessChange}
        />
      ) : null}

      {chapterNumber === 1 && chapterId ? (
        <ChapterSecondaryCastWizardPanel
          projectId={projectId}
          chapterId={chapterId}
          draft={draft}
          characterCatalog={catalog}
          onPatchCharacterSelection={updateCharacterSelection}
        />
      ) : null}

      {chapterNumber === 1 && chapterId ? (
        <ChapterLocationsWizardPanel chapterId={chapterId} draft={draft} onUpdateDraft={onUpdateDraft} />
      ) : null}

      {chapterNumber === 1 && chapterId ? (
        <ChapterLivingWorldWizardPanel chapterId={chapterId} draft={draft} onUpdateDraft={onUpdateDraft} />
      ) : null}

      {chapterNumber === 1 ? <ChapterVisualStyleWizardPanel draft={draft} onUpdateDraft={onUpdateDraft} /> : null}

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Personnages du chapitre</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Quick actions si des personnages existent dans le projet */}
          {catalog.length > 0 && (
            <div className="rounded-xl border border-border/40 bg-background/30 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Remplissage rapide</p>
              <div className="flex flex-wrap gap-2">
                {heroes.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const hero = heroes[0];
                      if (!hero) return;
                      updateCharacterSelection({ heroCharacterId: hero.id });
                    }}
                  >
                    Héros principal
                  </Button>
                )}
                {mainChars.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      updateCharacterSelection({
                        activeCharacterIds: mainChars.map((c) => c.id),
                      });
                    }}
                  >
                    Personnages principaux
                  </Button>
                )}
                {antagonists.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      updateCharacterSelection({
                        antagonistCharacterIds: antagonists.map((c) => c.id),
                      });
                    }}
                  >
                    Antagonistes
                  </Button>
                )}
                {catalog.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const hero = heroes[0];
                      updateCharacterSelection({
                        heroCharacterId: hero?.id ?? null,
                        activeCharacterIds: catalog.map((c) => c.id),
                        antagonistCharacterIds: antagonists.map((c) => c.id),
                      });
                    }}
                  >
                    Tout le casting
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {catalog.length > 0 ? (
              <CharacterPicker
                label="Héros actif"
                characters={catalog}
                value={draft.characterSelection?.heroCharacterId ?? null}
                onChange={(v) => updateCharacterSelection({ heroCharacterId: typeof v === "string" ? v : null })}
                multiple={false}
                placeholder="Choisir le héros…"
                dataStudioField="studio-hero-character"
              />
            ) : (
              <div className="space-y-2">
                <Label>Héros actif</Label>
                <Input
                  data-testid="studio-hero-character"
                  data-studio-field="studio-hero-character"
                  value={draft.characterSelection?.heroCharacterId ?? ""}
                  onChange={(e) => updateCharacterSelection({ heroCharacterId: e.target.value || null })}
                  placeholder="ID ou nom du héros"
                />
              </div>
            )}

            {catalog.length > 0 ? (
              <CharacterPicker
                label="Héros 2 / co-protagoniste"
                characters={catalog}
                value={draft.characterSelection?.secondaryHeroCharacterId ?? null}
                onChange={(v) =>
                  updateCharacterSelection({ secondaryHeroCharacterId: typeof v === "string" ? v : null })}
                multiple={false}
                placeholder="Optionnel…"
                dataStudioField="studio-secondary-hero-character"
              />
            ) : (
              <div className="space-y-2">
                <Label>Héros 2 / co-protagoniste</Label>
                <Input
                  data-studio-field="studio-secondary-hero-character"
                  value={draft.characterSelection?.secondaryHeroCharacterId ?? ""}
                  onChange={(e) =>
                    updateCharacterSelection({ secondaryHeroCharacterId: e.target.value || null })}
                  placeholder="ID optionnel"
                />
              </div>
            )}

            {catalog.length > 0 ? (
              <CharacterPicker
                label="Déuteragoniste"
                characters={catalog}
                value={draft.characterSelection?.deuteragonistCharacterId ?? null}
                onChange={(v) =>
                  updateCharacterSelection({ deuteragonistCharacterId: typeof v === "string" ? v : null })}
                multiple={false}
                placeholder="Optionnel (distinct du héros 2)…"
                dataStudioField="studio-deuteragonist-character"
              />
            ) : (
              <div className="space-y-2">
                <Label>Déuteragoniste</Label>
                <Input
                  data-studio-field="studio-deuteragonist-character"
                  value={draft.characterSelection?.deuteragonistCharacterId ?? ""}
                  onChange={(e) =>
                    updateCharacterSelection({ deuteragonistCharacterId: e.target.value || null })}
                  placeholder="ID optionnel"
                />
              </div>
            )}

            {catalog.length > 0 ? (
              <CharacterPicker
                label="Personnages actifs"
                characters={catalog}
                value={draft.characterSelection?.activeCharacterIds ?? []}
                onChange={(v) => updateCharacterSelection({ activeCharacterIds: Array.isArray(v) ? v : (v ? [v] : []) })}
                multiple={true}
                placeholder="Ajouter des personnages…"
                dataStudioField="studio-active-characters"
              />
            ) : (
              <div className="space-y-2">
                <Label>Personnages actifs</Label>
                <TagInput
                  values={draft.characterSelection?.activeCharacterIds ?? []}
                  onChange={(v) => updateCharacterSelection({ activeCharacterIds: v })}
                  placeholder="Noms ou IDs des personnages"
                  dataStudioField="studio-active-characters"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Contexte de la scène</CardTitle>
          <p className="text-xs text-muted-foreground">
            Décris le cadre de ton chapitre. Ces informations alimentent directement les décors et le monde visuel.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label>Où se passe l&apos;action ?</Label>
                <FieldTooltip
                  text="Le lieu principal de la scène. Utilisé pour les backgrounds et le monde visuel."
                  example="Ruines d'une tour — nuit / Marché couvert"
                />
              </div>
              <Input
                data-testid="studio-location"
                data-studio-field="studio-location"
                value={draft.chapterCanon?.currentLocation ?? ""}
                onChange={(e) => updateCanon({ currentLocation: e.target.value })}
                placeholder="Ex : Dojo de l'académie, Toit de la tour…"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label>Ce que l&apos;IA ne doit pas inventer</Label>
                <FieldTooltip
                  text="Éléments importants de continuité ou interdictions pour l'IA."
                  example="Pas de combat, le héros porte son katana brisé"
                />
              </div>
              <TagInput
                values={draft.chapterCanon?.continuityNotes ?? []}
                onChange={(v) => updateCanon({ continuityNotes: v })}
                placeholder="Ex : Pas de combat dans ce chapitre"
                dataStudioField="studio-continuity-notes"
              />
            </div>
          </div>

          {recurringNpcs.length > 0 && (
            <div className="space-y-2 rounded-xl border border-border/60 bg-card/40 p-4">
              <p className="text-xs font-medium text-muted-foreground">PNJ récurrents du projet</p>
              {recurringNpcs.map(npc => (
                <div key={npc.stableNpcId} className="flex items-center justify-between rounded-lg border border-border/40 bg-background/30 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium">{npc.label}</p>
                    <p className="text-[11px] text-muted-foreground">{npc.shortVisualCore.slice(0, 60)}</p>
                  </div>
                  <span className="text-[10px] text-accent">{npc.appearanceCount}× apparu</span>
                  {!npc.isPromotedToCharacter && npc.appearanceCount >= 2 && (
                    <button
                      type="button"
                      onClick={() => handlePromoteNpc(npc.stableNpcId, npc.label)}
                      className="text-[10px] text-violet-400 hover:text-violet-300 underline"
                    >
                      → Personnage
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* PNJ libres — résolution IA */}
          <div className="space-y-3 rounded-xl border border-border/60 bg-card/40 p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <p className="text-sm font-medium">PNJ &amp; figurants</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Décris librement les personnages secondaires présents dans cette scène.
              L&apos;IA les mappe sur des archétypes cohérents avec ton univers.
            </p>
            <Textarea
              placeholder="Ex : un vieux gardien borgne qui cache quelque chose, une foule hostile, un enfant qui observe…"
              value={npcRawDescription}
              onChange={(e) => {
                setNpcRawDescription(e.target.value);
                setNpcResolveError(null);
              }}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void handleResolveNpc(); }}
              rows={2}
              className="resize-none text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleResolveNpc()}
              disabled={resolvingNpc || !npcRawDescription.trim()}
              className="gap-1.5"
            >
              {resolvingNpc
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Sparkles className="h-3 w-3" />}
              {resolvingNpc ? "Analyse…" : "Analyser"}
            </Button>
            {npcResolveError && (
              <p className="text-xs text-destructive" role="alert">
                {npcResolveError}
              </p>
            )}

            {allNpcRows.length > 0 && (
              <div className="space-y-2">
                {allNpcRows.map((npc) => (
                  <div
                    key={`${npc.source}_${npc.id}`}
                    className="flex items-start gap-2 rounded-lg border border-border/40 bg-background/30 p-3"
                  >
                    <div className="flex-1 space-y-1">
                      <p className="text-xs font-medium">
                        {npc.label}
                        {npc.source === "draft" ? (
                          <span className="ml-2 text-[10px] text-muted-foreground/70">(persisté)</span>
                        ) : null}
                      </p>
                      {npc.narrativeHook ? (
                        <p className="text-[11px] text-muted-foreground italic">{npc.narrativeHook}</p>
                      ) : null}
                      {npc.promptFragment ? (
                        <p className="text-[11px] text-muted-foreground">Visuels : {npc.promptFragment}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeNpcRow(npc)}
                      className="text-muted-foreground/50 hover:text-muted-foreground transition-colors mt-0.5"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <details className="rounded-xl border border-border/60 bg-background/30 p-4">
            <summary className="cursor-pointer text-sm font-medium">Mode expert</summary>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Météo</Label>
                <Input
                  data-studio-field="studio-weather"
                  value={draft.chapterCanon?.weather ?? ""}
                  onChange={(e) => updateCanon({ weather: e.target.value })}
                  placeholder="pluie, nuit étoilée…"
                />
              </div>
              <div className="space-y-2">
                <Label>Moment de la journée</Label>
                <Input
                  data-studio-field="studio-time-of-day"
                  value={draft.chapterCanon?.timeOfDay ?? ""}
                  onChange={(e) => updateCanon({ timeOfDay: e.target.value })}
                  placeholder="aube, crépuscule…"
                />
              </div>
              <div className="space-y-2">
                <Label>Contraintes d&apos;univers</Label>
                <TagInput
                  values={draft.chapterCanon?.universeConstraints ?? []}
                  onChange={(v) => updateCanon({ universeConstraints: v })}
                  placeholder="Ex : magie interdite dans cette zone"
                  dataStudioField="studio-universe-constraints"
                />
              </div>
            </div>
          </details>

          <div className="flex justify-end">
            <Button type="button" onClick={onContinue}>Continuer vers le plan</Button>
          </div>
        </CardContent>
      </Card>

      <StudioInlineIssues title="Blocants casting & canon" issues={issues} emptyLabel="Aucun blocant sur le casting et le canon." testIdPrefix={null} onAction={onIssueAction} />
      <StudioInlineIssues title="Points à surveiller" issues={warningItems} tone="neutral" testIdPrefix={null} onAction={onIssueAction} />
    </div>
  );
}
