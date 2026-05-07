"use client";

import type {
  ChapterEntities,
  ChapterStudioData,
  ChapterWorldCreatureContract,
  ChapterWorldNpcContract,
} from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/studio/tag-input";
import { syncChapterEntitiesToVisualWorld } from "@/lib/chapter-studio/sync-chapter-entities-to-visual-world";

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `ent-${Date.now()}`;
}

function emptyEntities(): ChapterEntities {
  return { npcs: [], creatures: [], props: [], vehicles: [], factions: [] };
}

export function ChapterLivingWorldWizardPanel({
  chapterId,
  draft,
  onUpdateDraft,
}: {
  chapterId: string;
  draft: ChapterStudioData;
  onUpdateDraft: (next: ChapterStudioData, step?: "characters" | "canon") => void;
}) {
  const entities = draft.chapterEntities ?? emptyEntities();
  const ic = draft.chapterIntentContract;

  function replace(next: ChapterEntities) {
    onUpdateDraft({ ...draft, chapterEntities: next }, "canon");
  }

  function runSyncVisualWorld() {
    const nextVw = syncChapterEntitiesToVisualWorld({
      chapterId,
      draft: { ...draft, chapterEntities: entities },
    });
    onUpdateDraft({ ...draft, chapterEntities: entities, visualWorldContract: nextVw }, "canon");
  }

  function importFromIntent() {
    if (!ic) return;
    const next = { ...entities };
    const pushUniqueNpc = (label: string) =>
      !next.npcs.some((x) => x.label.toLowerCase() === label.toLowerCase());
    const pushUniqueCreature = (label: string) =>
      !next.creatures.some((x) => x.label.toLowerCase() === label.toLowerCase());
    const pushUniqueProp = (name: string) => !next.props.some((x) => x.name.toLowerCase() === name.toLowerCase());

    for (const label of ic.requiredNpcs ?? []) {
      if (!label.trim() || !pushUniqueNpc(label.trim())) continue;
      const row: ChapterWorldNpcContract = {
        id: newId(),
        label: label.trim(),
        narrativeRole: null,
        appearance: null,
        behavior: null,
        panelMoments: [],
        recurrence: "one_shot",
      };
      next.npcs = [...next.npcs, row];
    }
    for (const label of ic.requiredCreatures ?? []) {
      if (!label.trim() || !pushUniqueCreature(label.trim())) continue;
      next.creatures = [
        ...next.creatures,
        {
          id: newId(),
          label: label.trim(),
          species: null,
          sizeLabel: null,
          silhouette: null,
          powers: null,
          behavior: null,
          threatLevel: "medium",
          revealMoment: null,
          recurrence: "unique",
        },
      ];
    }
    for (const label of ic.requiredProps ?? []) {
      if (!label.trim() || !pushUniqueProp(label.trim())) continue;
      next.props = [
        ...next.props,
        {
          id: newId(),
          name: label.trim(),
          ownerCharacterId: null,
          ownerLabel: null,
          visualDescription: null,
          narrativeFunction: null,
          momentHints: [],
          continuityRules: [],
        },
      ];
    }
    replace(next);
  }

  const vw = draft.visualWorldContract;
  const vwCount =
    (vw?.npcGroups?.length ?? 0)
    + (vw?.creatures?.length ?? 0)
    + (vw?.props?.length ?? 0)
    + (vw?.vehicles?.length ?? 0)
    + (vw?.factions?.length ?? 0);
  const localCount =
    entities.npcs.length + entities.creatures.length + entities.props.length + entities.vehicles.length + entities.factions.length;

  return (
    <Card
      className="border-violet-500/25 bg-card/50"
      data-testid="chapter-living-world-wizard-panel"
      data-studio-field="studio-wizard-living-world"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Monde vivant</CardTitle>
        <p className="text-xs text-muted-foreground">
          PNJ, créatures, objets importants, véhicules et factions. Synchronise vers le contrat monde visuel pour le pipeline
          premium.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {ic && (ic.requiredNpcs?.length || ic.requiredCreatures?.length || ic.requiredProps?.length) ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={importFromIntent}>
              Importer depuis l&apos;intention
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              replace({
                ...entities,
                npcs: [
                  ...entities.npcs,
                  {
                    id: newId(),
                    label: "Nouveau PNJ",
                    narrativeRole: null,
                    appearance: null,
                    behavior: null,
                    panelMoments: [],
                    recurrence: "one_shot",
                  },
                ],
              })
            }
          >
            + PNJ
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              replace({
                ...entities,
                creatures: [
                  ...entities.creatures,
                  {
                    id: newId(),
                    label: "Nouvelle créature",
                    species: null,
                    sizeLabel: null,
                    silhouette: null,
                    powers: null,
                    behavior: null,
                    threatLevel: "medium",
                    revealMoment: null,
                    recurrence: "unique",
                  },
                ],
              })
            }
          >
            + Créature
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              replace({
                ...entities,
                props: [
                  ...entities.props,
                  {
                    id: newId(),
                    name: "Nouvel objet",
                    ownerCharacterId: null,
                    ownerLabel: null,
                    visualDescription: null,
                    narrativeFunction: null,
                    momentHints: [],
                    continuityRules: [],
                  },
                ],
              })
            }
          >
            + Prop
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              replace({
                ...entities,
                vehicles: [
                  ...entities.vehicles,
                  {
                    id: newId(),
                    label: "Nouveau véhicule",
                    type: null,
                    design: null,
                    ownerLabel: null,
                    condition: null,
                    sceneFunction: null,
                  },
                ],
              })
            }
          >
            + Véhicule
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              replace({
                ...entities,
                factions: [
                  ...entities.factions,
                  {
                    id: newId(),
                    name: "Nouvelle faction",
                    symbol: null,
                    uniform: null,
                    colors: [],
                    storyRole: null,
                    visibleMembersNote: null,
                  },
                ],
              })
            }
          >
            + Faction
          </Button>
          <Button type="button" size="sm" variant="default" disabled={localCount === 0} onClick={runSyncVisualWorld}>
            Synchroniser → monde visuel
          </Button>
        </div>

        {vwCount > 0 ? (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
            Monde visuel : {vwCount} entité(s) liée(s) (lieux exclus).
          </p>
        ) : localCount > 0 ? (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            Entités locales — clique « Synchroniser » pour alimenter le contrat monde visuel.
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Aucune entité — optionnel sauf si ton intention exige des PNJ, créatures ou objets marquants.
          </p>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">PNJ / foules</p>
          {entities.npcs.map((n, i) => (
            <div key={n.id} className="rounded-lg border border-border/40 bg-background/30 p-3 space-y-2">
              <div className="flex justify-between gap-2">
                <Input
                  className="h-8 text-xs"
                  value={n.label}
                  onChange={(e) => {
                    const npcs = [...entities.npcs];
                    npcs[i] = { ...n, label: e.target.value };
                    replace({ ...entities, npcs });
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 shrink-0 text-destructive"
                  onClick={() => replace({ ...entities, npcs: entities.npcs.filter((_, j) => j !== i) })}
                >
                  Retirer
                </Button>
              </div>
              <Textarea
                rows={2}
                className="text-xs"
                placeholder="Rôle narratif, apparence, comportement…"
                value={[n.narrativeRole, n.appearance, n.behavior].filter(Boolean).join("\n")}
                onChange={(e) => {
                  const lines = e.target.value.split("\n");
                  const npcs = [...entities.npcs];
                  npcs[i] = {
                    ...n,
                    narrativeRole: lines[0] ?? null,
                    appearance: lines[1] ?? null,
                    behavior: lines.slice(2).join("\n") || null,
                  };
                  replace({ ...entities, npcs });
                }}
              />
              <div className="flex flex-wrap gap-2 items-center">
                <Label className="text-[10px] text-muted-foreground">Récurrence</Label>
                <select
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                  value={n.recurrence}
                  onChange={(e) => {
                    const npcs = [...entities.npcs];
                    npcs[i] = { ...n, recurrence: e.target.value as ChapterWorldNpcContract["recurrence"] };
                    replace({ ...entities, npcs });
                  }}
                >
                  <option value="one_shot">Ponctuel</option>
                  <option value="recurring">Récurrent</option>
                </select>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Créatures</p>
          {entities.creatures.map((c, i) => (
            <div key={c.id} className="rounded-lg border border-border/40 bg-background/30 p-3 space-y-2">
              <div className="flex justify-between gap-2">
                <Input
                  className="h-8 text-xs"
                  value={c.label}
                  onChange={(e) => {
                    const creatures = [...entities.creatures];
                    creatures[i] = { ...c, label: e.target.value };
                    replace({ ...entities, creatures });
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 shrink-0 text-destructive"
                  onClick={() => replace({ ...entities, creatures: entities.creatures.filter((_, j) => j !== i) })}
                >
                  Retirer
                </Button>
              </div>
              <Textarea
                rows={2}
                className="text-xs"
                placeholder="Espèce, taille, silhouette, pouvoirs, comportement, moment de révélation…"
                value={[c.species, c.sizeLabel, c.silhouette, c.powers, c.behavior, c.revealMoment].filter(Boolean).join("\n")}
                onChange={(e) => {
                  const lines = e.target.value.split("\n");
                  const creatures = [...entities.creatures];
                  creatures[i] = {
                    ...c,
                    species: lines[0] ?? null,
                    sizeLabel: lines[1] ?? null,
                    silhouette: lines[2] ?? null,
                    powers: lines[3] ?? null,
                    behavior: lines[4] ?? null,
                    revealMoment: lines.slice(5).join("\n") || null,
                  };
                  replace({ ...entities, creatures });
                }}
              />
              <div className="flex flex-wrap gap-2 items-center">
                <Label className="text-[10px] text-muted-foreground">Menace</Label>
                <select
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                  value={c.threatLevel}
                  onChange={(e) => {
                    const creatures = [...entities.creatures];
                    creatures[i] = { ...c, threatLevel: e.target.value as ChapterWorldCreatureContract["threatLevel"] };
                    replace({ ...entities, creatures });
                  }}
                >
                  <option value="none">Aucune</option>
                  <option value="low">Faible</option>
                  <option value="medium">Moyenne</option>
                  <option value="high">Haute</option>
                </select>
                <Label className="text-[10px] text-muted-foreground">Récurrence</Label>
                <select
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                  value={c.recurrence}
                  onChange={(e) => {
                    const creatures = [...entities.creatures];
                    creatures[i] = { ...c, recurrence: e.target.value as ChapterWorldCreatureContract["recurrence"] };
                    replace({ ...entities, creatures });
                  }}
                >
                  <option value="unique">Unique</option>
                  <option value="recurring">Récurrente</option>
                </select>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Objets importants</p>
          {entities.props.map((p, i) => (
            <div key={p.id} className="rounded-lg border border-border/40 bg-background/30 p-3 space-y-2">
              <div className="flex justify-between gap-2">
                <Input
                  className="h-8 text-xs"
                  value={p.name}
                  onChange={(e) => {
                    const props = [...entities.props];
                    props[i] = { ...p, name: e.target.value };
                    replace({ ...entities, props });
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 shrink-0 text-destructive"
                  onClick={() => replace({ ...entities, props: entities.props.filter((_, j) => j !== i) })}
                >
                  Retirer
                </Button>
              </div>
              <Input
                className="h-8 text-xs"
                placeholder="Propriétaire (nom ou ID perso)"
                value={p.ownerLabel ?? ""}
                onChange={(e) => {
                  const props = [...entities.props];
                  props[i] = { ...p, ownerLabel: e.target.value || null };
                  replace({ ...entities, props });
                }}
              />
              <Textarea
                rows={2}
                className="text-xs"
                placeholder="Description visuelle, fonction narrative…"
                value={[p.visualDescription, p.narrativeFunction].filter(Boolean).join("\n")}
                onChange={(e) => {
                  const lines = e.target.value.split("\n");
                  const props = [...entities.props];
                  props[i] = {
                    ...p,
                    visualDescription: lines[0] ?? null,
                    narrativeFunction: lines.slice(1).join("\n") || null,
                  };
                  replace({ ...entities, props });
                }}
              />
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Règles de continuité (tags)</Label>
                <TagInput
                  values={p.continuityRules}
                  onChange={(v) => {
                    const props = [...entities.props];
                    props[i] = { ...p, continuityRules: v };
                    replace({ ...entities, props });
                  }}
                  placeholder="ne jamais perdre l’objet…"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Véhicules</p>
          {entities.vehicles.map((v, i) => (
            <div key={v.id} className="rounded-lg border border-border/40 bg-background/30 p-3 space-y-2">
              <div className="flex justify-between gap-2">
                <Input
                  className="h-8 text-xs"
                  value={v.label}
                  onChange={(e) => {
                    const vehicles = [...entities.vehicles];
                    vehicles[i] = { ...v, label: e.target.value };
                    replace({ ...entities, vehicles });
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 shrink-0 text-destructive"
                  onClick={() => replace({ ...entities, vehicles: entities.vehicles.filter((_, j) => j !== i) })}
                >
                  Retirer
                </Button>
              </div>
              <Textarea
                rows={2}
                className="text-xs"
                placeholder="Type, design, propriétaire, état, rôle dans la scène…"
                value={[v.type, v.design, v.ownerLabel, v.condition, v.sceneFunction].filter(Boolean).join("\n")}
                onChange={(e) => {
                  const lines = e.target.value.split("\n");
                  const vehicles = [...entities.vehicles];
                  vehicles[i] = {
                    ...v,
                    type: lines[0] ?? null,
                    design: lines[1] ?? null,
                    ownerLabel: lines[2] ?? null,
                    condition: lines[3] ?? null,
                    sceneFunction: lines.slice(4).join("\n") || null,
                  };
                  replace({ ...entities, vehicles });
                }}
              />
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Factions / organisations</p>
          {entities.factions.map((f, i) => (
            <div key={f.id} className="rounded-lg border border-border/40 bg-background/30 p-3 space-y-2">
              <div className="flex justify-between gap-2">
                <Input
                  className="h-8 text-xs"
                  value={f.name}
                  onChange={(e) => {
                    const factions = [...entities.factions];
                    factions[i] = { ...f, name: e.target.value };
                    replace({ ...entities, factions });
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 shrink-0 text-destructive"
                  onClick={() => replace({ ...entities, factions: entities.factions.filter((_, j) => j !== i) })}
                >
                  Retirer
                </Button>
              </div>
              <Input
                className="h-8 text-xs"
                placeholder="Symbole / emblème"
                value={f.symbol ?? ""}
                onChange={(e) => {
                  const factions = [...entities.factions];
                  factions[i] = { ...f, symbol: e.target.value || null };
                  replace({ ...entities, factions });
                }}
              />
              <Textarea
                rows={2}
                className="text-xs"
                placeholder="Uniforme, rôle dans l’histoire, membres visibles…"
                value={[f.uniform, f.storyRole, f.visibleMembersNote].filter(Boolean).join("\n")}
                onChange={(e) => {
                  const lines = e.target.value.split("\n");
                  const factions = [...entities.factions];
                  factions[i] = {
                    ...f,
                    uniform: lines[0] ?? null,
                    storyRole: lines[1] ?? null,
                    visibleMembersNote: lines.slice(2).join("\n") || null,
                  };
                  replace({ ...entities, factions });
                }}
              />
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Couleurs (tags)</Label>
                <TagInput
                  values={f.colors}
                  onChange={(v) => {
                    const factions = [...entities.factions];
                    factions[i] = { ...f, colors: v };
                    replace({ ...entities, factions });
                  }}
                  placeholder="rouge sombre, or…"
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
