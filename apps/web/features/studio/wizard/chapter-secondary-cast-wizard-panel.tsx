"use client";

import type { ChapterStudioData } from "@manga-ai-studio/core";
import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CharacterPicker } from "@/components/studio/character-picker";
import {
  resolveCharacterLabelsToIds,
  type ProjectCharacterForLabelResolution,
} from "@/lib/characters/resolve-character-labels";

type CatalogEntry = { id: string; name: string; roleType?: string | null; imageUrl?: string | null };

function catalogToRefs(catalog: CatalogEntry[]): ProjectCharacterForLabelResolution[] {
  return catalog.map((c) => ({
    id: c.id,
    name: c.name,
    displayName: null,
    roleType: c.roleType ?? null,
  }));
}

export function ChapterSecondaryCastWizardPanel({
  projectId,
  chapterId,
  draft,
  characterCatalog,
  onPatchCharacterSelection,
}: {
  projectId: string;
  chapterId: string;
  draft: ChapterStudioData;
  characterCatalog: CatalogEntry[];
  onPatchCharacterSelection: (patch: Partial<NonNullable<ChapterStudioData["characterSelection"]>>) => void;
}) {
  const sel = draft.characterSelection;
  const heroId = sel?.heroCharacterId?.trim() ?? "";
  const catalog = characterCatalog;
  const withoutHero = useMemo(
    () => (heroId ? catalog.filter((c) => c.id !== heroId) : catalog),
    [catalog, heroId],
  );

  const intentResolution = useMemo(() => {
    const ic = draft.chapterIntentContract;
    if (!ic) {
      return {
        unresolvedLabels: [] as string[],
        suggestions: [] as { label: string; possibleCharacterIds: string[] }[],
      };
    }
    const labels = [...ic.requiredCharacters, ...ic.requiredNpcs].filter(Boolean);
    const refs = catalogToRefs(catalog);
    return resolveCharacterLabelsToIds({ labels, projectCharacters: refs });
  }, [catalog, draft.chapterIntentContract]);

  const returnTo = `/projects/${projectId}/chapters/${chapterId}/edit`;
  const newCharHref = `/projects/${projectId}/characters/new?onboarding=1&returnTo=${encodeURIComponent(returnTo)}`;

  const coreSansHero = useMemo(() => {
    const core = sel?.coreCastCharacterIds ?? [];
    if (!heroId) return core;
    return core.filter((id) => id !== heroId);
  }, [heroId, sel?.coreCastCharacterIds]);

  function mergeActive(ids: string[]) {
    const cur = sel?.activeCharacterIds ?? [];
    return [...new Set([...cur, ...ids])];
  }

  function associateSuggestion(characterId: string) {
    const curActive = sel?.activeCharacterIds ?? [];
    const curCore = sel?.coreCastCharacterIds ?? [];
    onPatchCharacterSelection({
      activeCharacterIds: [...new Set([...curActive, characterId])],
      coreCastCharacterIds: heroId ? [...new Set([heroId, ...curCore, characterId])] : [...new Set([...curCore, characterId])],
    });
  }

  return (
    <Card className="border-violet-500/25 bg-card/50" data-testid="chapter-secondary-cast-wizard-panel" data-studio-field="studio-wizard-secondary-cast">
      <CardHeader>
        <CardTitle className="text-base">Qui apparaît dans ce chapitre ?</CardTitle>
        <p className="text-sm text-muted-foreground">
          Chapitre 1 — structure le cast autour du héros : co-héros, antagonistes, rival, personnages clés, verrouillage
          visuel. Les noms détectés dans ton intention sont rappelés ci-dessous pour les relier à des personnages du projet.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {intentResolution.unresolvedLabels.length > 0 ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm space-y-2">
            <p className="font-medium text-foreground">Depuis l&apos;intention — à relier à un personnage (ID)</p>
            <ul className="space-y-2">
              {intentResolution.suggestions
                .filter((s) => intentResolution.unresolvedLabels.includes(s.label))
                .map((s) => (
                  <li key={s.label} className="flex flex-col gap-1 border-b border-border/40 pb-2 last:border-0 last:pb-0">
                    <span className="text-muted-foreground">&quot;{s.label}&quot;</span>
                    {s.possibleCharacterIds.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {s.possibleCharacterIds.map((cid) => {
                          const name = catalog.find((c) => c.id === cid)?.name ?? cid;
                          return (
                            <Button
                              key={`${s.label}-${cid}`}
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-7 text-xs"
                              onClick={() => associateSuggestion(cid)}
                            >
                              Associer → {name}
                            </Button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" asChild>
                          <Link href={newCharHref}>Créer un personnage</Link>
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <CharacterPicker
            label="Co-héros / co-protagoniste"
            characters={withoutHero}
            value={sel?.secondaryHeroCharacterId ?? null}
            onChange={(v) => {
              const id = typeof v === "string" ? v : null;
              if (id && id === heroId) return;
              onPatchCharacterSelection({ secondaryHeroCharacterId: id });
            }}
            multiple={false}
            placeholder="Optionnel…"
            dataStudioField="wizard-secondary-hero"
          />
          <CharacterPicker
            label="Rival / déuteragoniste"
            characters={withoutHero.filter((c) => c.id !== (sel?.secondaryHeroCharacterId ?? ""))}
            value={sel?.deuteragonistCharacterId ?? null}
            onChange={(v) => {
              const id = typeof v === "string" ? v : null;
              if (id && (id === heroId || id === sel?.secondaryHeroCharacterId)) return;
              onPatchCharacterSelection({ deuteragonistCharacterId: id });
            }}
            multiple={false}
            placeholder="Optionnel…"
            dataStudioField="wizard-deuteragonist"
          />
          <div className="lg:col-span-2">
            <CharacterPicker
              label="Antagoniste(s)"
              characters={withoutHero}
              value={sel?.antagonistCharacterIds ?? []}
              onChange={(v) => {
                const ids = Array.isArray(v) ? v : v ? [v] : [];
                const filtered = ids.filter((id) => id !== heroId);
                onPatchCharacterSelection({ antagonistCharacterIds: filtered });
              }}
              multiple
              placeholder="Ajouter un ou plusieurs antagonistes…"
              dataStudioField="wizard-antagonists"
            />
          </div>
          <div className="lg:col-span-2">
            <CharacterPicker
              label="Personnages clés (allié, mentor, figure importante…)"
              characters={withoutHero}
              value={coreSansHero}
              onChange={(v) => {
                const ids = Array.isArray(v) ? v : v ? [v] : [];
                const cleaned = ids.filter((id) => id && id !== heroId);
                const core = heroId ? [...new Set([heroId, ...cleaned])] : [...new Set(cleaned)];
                onPatchCharacterSelection({
                  coreCastCharacterIds: core,
                  activeCharacterIds: mergeActive(cleaned),
                });
              }}
              multiple
              placeholder="Sélectionne les rôles forts du chapitre…"
              dataStudioField="wizard-core-cast"
            />
          </div>
          <div className="lg:col-span-2">
            <CharacterPicker
              label="Visibles à l&apos;écran (cast actif)"
              characters={catalog}
              value={sel?.activeCharacterIds ?? []}
              onChange={(v) => {
                const ids = Array.isArray(v) ? v : v ? [v] : [];
                onPatchCharacterSelection({ activeCharacterIds: [...new Set(ids.filter(Boolean))] });
              }}
              multiple
              placeholder="Tous les personnages qui apparaissent dans les cases…"
              dataStudioField="wizard-active-cast"
            />
          </div>
          <div className="lg:col-span-2">
            <CharacterPicker
              label="Verrouillage visuel (références stables)"
              characters={catalog}
              value={sel?.lockedCharacterIds ?? []}
              onChange={(v) => {
                const ids = Array.isArray(v) ? v : v ? [v] : [];
                const next = [...new Set(ids.filter(Boolean))];
                const ensured = heroId ? [...new Set([heroId, ...next])] : next;
                onPatchCharacterSelection({ lockedCharacterIds: ensured });
              }}
              multiple
              placeholder="Le héros est verrouillé par défaut — ajoute d&apos;autres rôles critiques…"
              dataStudioField="wizard-locked-cast"
            />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Les figurants récurrents du projet restent disponibles plus bas (PNJ récurrents). Pour un personnage rapide hors
          intention, utilise « Créer un personnage » puis reviens ici pour l&apos;ajouter au cast actif.
        </p>
      </CardContent>
    </Card>
  );
}
