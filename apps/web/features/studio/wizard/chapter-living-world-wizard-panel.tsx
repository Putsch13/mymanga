"use client";

import type {
  ChapterEntities,
  ChapterStudioData,
} from "@manga-ai-studio/core";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreatureSection } from "./_living-world/creature-section";
import { FactionSection } from "./_living-world/faction-section";
import { NpcSection } from "./_living-world/npc-section";
import { PropSection } from "./_living-world/prop-section";
import { LivingWorldToolbar } from "./_living-world/toolbar";
import {
  buildEntitiesFromIntent,
  countLocalEntities,
  emptyEntities,
  intentHasRequirements,
} from "./_living-world/utils";
import { VehicleSection } from "./_living-world/vehicle-section";

interface ChapterLivingWorldWizardPanelProps {
  chapterId: string;
  draft: ChapterStudioData;
  onUpdateDraft: (next: ChapterStudioData, step?: "characters" | "canon") => void;
}

export function ChapterLivingWorldWizardPanel({
  chapterId,
  draft,
  onUpdateDraft,
}: ChapterLivingWorldWizardPanelProps) {
  const entities = draft.chapterEntities ?? emptyEntities();
  const intent = draft.chapterIntentContract;

  function replace(next: ChapterEntities) {
    onUpdateDraft({ ...draft, chapterEntities: next }, "canon");
  }

  function importFromIntent() {
    if (!intent) return;
    replace(buildEntitiesFromIntent(entities, intent));
  }

  const localCount = countLocalEntities(entities);

  return (
    <Card
      className="border-violet-500/25 bg-card/50"
      data-testid="chapter-living-world-wizard-panel"
      data-studio-field="studio-wizard-living-world"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Monde vivant</CardTitle>
        <p className="text-xs text-muted-foreground">
          PNJ, créatures, objets importants, véhicules et factions.
          Synchronise vers le contrat monde visuel pour le pipeline premium.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <LivingWorldToolbar
          entities={entities}
          hasIntentRequirements={intentHasRequirements(intent)}
          localCount={localCount}
          onChange={replace}
          onImportFromIntent={importFromIntent}
        />

        {localCount > 0 ? (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
            {localCount} entité(s) — synchronisation automatique vers le contrat monde visuel.
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Aucune entité — optionnel sauf si ton intention exige des PNJ,
            créatures ou objets marquants.
          </p>
        )}

        <NpcSection entities={entities} onChange={replace} />
        <CreatureSection entities={entities} onChange={replace} />
        <PropSection entities={entities} onChange={replace} />
        <VehicleSection entities={entities} onChange={replace} />
        <FactionSection entities={entities} onChange={replace} />
      </CardContent>
    </Card>
  );
}
