import type { ChapterEntities } from "@manga-ai-studio/core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/studio/tag-input";

interface Props {
  entities: ChapterEntities;
  onChange: (next: ChapterEntities) => void;
}

export function FactionSection({ entities, onChange }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground">
        Factions / organisations
      </p>
      {entities.factions.map((f, i) => (
        <div
          key={f.id}
          className="rounded-lg border border-border/40 bg-background/30 p-3 space-y-2"
        >
          <div className="flex justify-between gap-2">
            <Input
              className="h-8 text-xs"
              value={f.name}
              onChange={(e) => {
                const factions = [...entities.factions];
                factions[i] = { ...f, name: e.target.value };
                onChange({ ...entities, factions });
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
                  factions: entities.factions.filter((_, j) => j !== i),
                })
              }
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
              onChange({ ...entities, factions });
            }}
          />
          <Textarea
            rows={2}
            className="text-xs"
            placeholder="Uniforme, rôle dans l’histoire, membres visibles…"
            value={[f.uniform, f.storyRole, f.visibleMembersNote]
              .filter(Boolean)
              .join("\n")}
            onChange={(e) => {
              const lines = e.target.value.split("\n");
              const factions = [...entities.factions];
              factions[i] = {
                ...f,
                uniform: lines[0] ?? null,
                storyRole: lines[1] ?? null,
                visibleMembersNote: lines.slice(2).join("\n") || null,
              };
              onChange({ ...entities, factions });
            }}
          />
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Couleurs (tags)
            </Label>
            <TagInput
              values={f.colors}
              onChange={(v) => {
                const factions = [...entities.factions];
                factions[i] = { ...f, colors: v };
                onChange({ ...entities, factions });
              }}
              placeholder="rouge sombre, or…"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
