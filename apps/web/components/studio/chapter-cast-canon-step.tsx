"use client";

import { useEffect, useState } from "react";
import type { ChapterReadinessIssue, ChapterStudioData } from "@manga-ai-studio/core";
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
  onIssueAction,
  onUpdateDraft,
  onContinue,
}: {
  draft: ChapterStudioData;
  issues: ChapterReadinessIssue[];
  warningItems: ChapterReadinessIssue[];
  characterCatalog?: CharacterCatalogEntry[];
  projectId: string;
  onIssueAction: (issue: ChapterReadinessIssue) => void | Promise<void>;
  onUpdateDraft: (next: ChapterStudioData, step?: "characters" | "canon") => void;
  onContinue: () => void;
}) {
  const catalog = characterCatalog ?? [];
  const heroes = catalog.filter((c) => /hero|protagon|main_char/i.test(c.roleType ?? ""));
  const antagonists = catalog.filter((c) => /antagon|villain/i.test(c.roleType ?? ""));
  const mainChars = catalog.filter((c) => /hero|protagon|support|main/i.test(c.roleType ?? ""));

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
    onUpdateDraft({
      ...draft,
      characterSelection: {
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
      },
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
          universe: "fantasy",
          tone: "épique",
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
        setResolvedNpcs(prev => [
          ...prev,
          {
            label: data.topMatch!.label,
            promptFragment:
              data.visualPromptFragment
              ?? data.promptFragment
              ?? data.topMatch!.visualCues.slice(0, 2).join(", "),
            narrativeHook: data.narrativeHook ?? data.topMatch!.interactionHooks[0] ?? "",
            strategy: data.strategy ?? "catalog_match",
          },
        ]);
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
          <CardTitle className="text-base">Cohérence du chapitre</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label>Décor principal</Label>
                <FieldTooltip
                  text="Le lieu dominant de la scène. Utilisé pour les backgrounds."
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
                <Label>Continuité essentielle</Label>
                <FieldTooltip
                  text="Notes essentielles de continuité avec les chapitres précédents."
                  example="Ryuu porte son katana brisé"
                />
              </div>
              <TagInput
                values={draft.chapterCanon?.continuityNotes ?? []}
                onChange={(v) => updateCanon({ continuityNotes: v })}
                placeholder="Ex : Ryuu porte son katana brisé"
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

            {resolvedNpcs.length > 0 && (
              <div className="space-y-2">
                {resolvedNpcs.map((npc, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg border border-border/40 bg-background/30 p-3">
                    <div className="flex-1 space-y-1">
                      <p className="text-xs font-medium">{npc.label}</p>
                      <p className="text-[11px] text-muted-foreground italic">{npc.narrativeHook}</p>
                      <p className="text-[11px] text-muted-foreground">Visuels : {npc.promptFragment}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setResolvedNpcs(prev => prev.filter((_, j) => j !== i))}
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
