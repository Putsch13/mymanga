import type { ChapterEntities } from "@manga-ai-studio/core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  entities: ChapterEntities;
  onChange: (next: ChapterEntities) => void;
}

export function VehicleSection({ entities, onChange }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground">Véhicules</p>
      {entities.vehicles.map((v, i) => (
        <div
          key={v.id}
          className="rounded-lg border border-border/40 bg-background/30 p-3 space-y-2"
        >
          <div className="flex justify-between gap-2">
            <Input
              className="h-8 text-xs"
              value={v.label}
              onChange={(e) => {
                const vehicles = [...entities.vehicles];
                vehicles[i] = { ...v, label: e.target.value };
                onChange({ ...entities, vehicles });
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
                  vehicles: entities.vehicles.filter((_, j) => j !== i),
                })
              }
            >
              Retirer
            </Button>
          </div>
          <Textarea
            rows={2}
            className="text-xs"
            placeholder="Type, design, propriétaire, état, rôle dans la scène…"
            value={[v.type, v.design, v.ownerLabel, v.condition, v.sceneFunction]
              .filter(Boolean)
              .join("\n")}
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
              onChange({ ...entities, vehicles });
            }}
          />
        </div>
      ))}
    </div>
  );
}
