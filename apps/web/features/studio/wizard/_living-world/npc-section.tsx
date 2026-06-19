import type {
  ChapterEntities,
  ChapterWorldNpcContract,
} from "@manga-ai-studio/core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  entities: ChapterEntities;
  onChange: (next: ChapterEntities) => void;
}

export function NpcSection({ entities, onChange }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground">PNJ / foules</p>
      {entities.npcs.map((n, i) => (
        <div
          key={n.id}
          className="rounded-lg border border-border/40 bg-background/30 p-3 space-y-2"
        >
          <div className="flex justify-between gap-2">
            <Input
              className="h-8 text-xs"
              value={n.label}
              onChange={(e) => {
                const npcs = [...entities.npcs];
                npcs[i] = { ...n, label: e.target.value };
                onChange({ ...entities, npcs });
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
                  npcs: entities.npcs.filter((_, j) => j !== i),
                })
              }
            >
              Retirer
            </Button>
          </div>
          <Textarea
            rows={2}
            className="text-xs"
            placeholder="Rôle narratif, apparence, comportement…"
            value={[n.narrativeRole, n.appearance, n.behavior]
              .filter(Boolean)
              .join("\n")}
            onChange={(e) => {
              const lines = e.target.value.split("\n");
              const npcs = [...entities.npcs];
              npcs[i] = {
                ...n,
                narrativeRole: lines[0] ?? null,
                appearance: lines[1] ?? null,
                behavior: lines.slice(2).join("\n") || null,
              };
              onChange({ ...entities, npcs });
            }}
          />
          <div className="flex flex-wrap gap-2 items-center">
            <Label className="text-[10px] text-muted-foreground">Récurrence</Label>
            <select
              className="h-7 rounded-md border border-input bg-background px-2 text-xs"
              value={n.recurrence}
              onChange={(e) => {
                const npcs = [...entities.npcs];
                npcs[i] = {
                  ...n,
                  recurrence: e.target.value as ChapterWorldNpcContract["recurrence"],
                };
                onChange({ ...entities, npcs });
              }}
            >
              <option value="one_shot">Ponctuel</option>
              <option value="recurring">Récurrent</option>
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}
