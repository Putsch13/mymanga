import type { ChapterEntities } from "@manga-ai-studio/core";

import { Button } from "@/components/ui/button";

import {
  createCreature,
  createFaction,
  createNpc,
  createProp,
  createVehicle,
} from "./factories";

interface Props {
  entities: ChapterEntities;
  hasIntentRequirements: boolean;
  localCount: number;
  onChange: (next: ChapterEntities) => void;
  onImportFromIntent: () => void;
  onSyncVisualWorld: () => void;
}

export function LivingWorldToolbar({
  entities,
  hasIntentRequirements,
  localCount,
  onChange,
  onImportFromIntent,
  onSyncVisualWorld,
}: Props) {
  return (
    <>
      {hasIntentRequirements ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onImportFromIntent}
          >
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
            onChange({ ...entities, npcs: [...entities.npcs, createNpc()] })
          }
        >
          + PNJ
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            onChange({
              ...entities,
              creatures: [...entities.creatures, createCreature()],
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
            onChange({ ...entities, props: [...entities.props, createProp()] })
          }
        >
          + Prop
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            onChange({
              ...entities,
              vehicles: [...entities.vehicles, createVehicle()],
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
            onChange({
              ...entities,
              factions: [...entities.factions, createFaction()],
            })
          }
        >
          + Faction
        </Button>
        <Button
          type="button"
          size="sm"
          variant="default"
          disabled={localCount === 0}
          onClick={onSyncVisualWorld}
        >
          Synchroniser → monde visuel
        </Button>
      </div>
    </>
  );
}
