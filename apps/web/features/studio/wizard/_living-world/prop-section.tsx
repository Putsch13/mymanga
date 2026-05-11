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

export function PropSection({ entities, onChange }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground">Objets importants</p>
      {entities.props.map((p, i) => (
        <div
          key={p.id}
          className="rounded-lg border border-border/40 bg-background/30 p-3 space-y-2"
        >
          <div className="flex justify-between gap-2">
            <Input
              className="h-8 text-xs"
              value={p.name}
              onChange={(e) => {
                const props = [...entities.props];
                props[i] = { ...p, name: e.target.value };
                onChange({ ...entities, props });
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
                  props: entities.props.filter((_, j) => j !== i),
                })
              }
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
              onChange({ ...entities, props });
            }}
          />
          <Textarea
            rows={2}
            className="text-xs"
            placeholder="Description visuelle, fonction narrative…"
            value={[p.visualDescription, p.narrativeFunction]
              .filter(Boolean)
              .join("\n")}
            onChange={(e) => {
              const lines = e.target.value.split("\n");
              const props = [...entities.props];
              props[i] = {
                ...p,
                visualDescription: lines[0] ?? null,
                narrativeFunction: lines.slice(1).join("\n") || null,
              };
              onChange({ ...entities, props });
            }}
          />
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Règles de continuité (tags)
            </Label>
            <TagInput
              values={p.continuityRules}
              onChange={(v) => {
                const props = [...entities.props];
                props[i] = { ...p, continuityRules: v };
                onChange({ ...entities, props });
              }}
              placeholder="ne jamais perdre l’objet…"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
