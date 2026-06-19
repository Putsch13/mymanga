import type {
  ChapterEntities,
  ChapterWorldCreatureContract,
} from "@manga-ai-studio/core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  entities: ChapterEntities;
  onChange: (next: ChapterEntities) => void;
}

export function CreatureSection({ entities, onChange }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground">Créatures</p>
      {entities.creatures.map((c, i) => (
        <div
          key={c.id}
          className="rounded-lg border border-border/40 bg-background/30 p-3 space-y-2"
        >
          <div className="flex justify-between gap-2">
            <Input
              className="h-8 text-xs"
              value={c.label}
              onChange={(e) => {
                const creatures = [...entities.creatures];
                creatures[i] = { ...c, label: e.target.value };
                onChange({ ...entities, creatures });
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 shrink-0 text-destructive"
              onClick={() =>
                onChange({
                  ...entities,
                  creatures: entities.creatures.filter((_, j) => j !== i),
                })
              }
            >
              Retirer
            </Button>
          </div>
          <Textarea
            rows={2}
            className="text-xs"
            placeholder="Espèce, taille, silhouette, pouvoirs, comportement, moment de révélation…"
            value={[
              c.species,
              c.sizeLabel,
              c.silhouette,
              c.powers,
              c.behavior,
              c.revealMoment,
            ]
              .filter(Boolean)
              .join("\n")}
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
              onChange({ ...entities, creatures });
            }}
          />
          <div className="flex flex-wrap gap-2 items-center">
            <Label className="text-[10px] text-muted-foreground">Menace</Label>
            <select
              className="h-7 rounded-md border border-input bg-background px-2 text-xs"
              value={c.threatLevel}
              onChange={(e) => {
                const creatures = [...entities.creatures];
                creatures[i] = {
                  ...c,
                  threatLevel:
                    e.target.value as ChapterWorldCreatureContract["threatLevel"],
                };
                onChange({ ...entities, creatures });
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
                creatures[i] = {
                  ...c,
                  recurrence:
                    e.target.value as ChapterWorldCreatureContract["recurrence"],
                };
                onChange({ ...entities, creatures });
              }}
            >
              <option value="unique">Unique</option>
              <option value="recurring">Récurrente</option>
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}
