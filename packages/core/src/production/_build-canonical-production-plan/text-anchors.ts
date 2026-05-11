import type {
  CanonicalChapterProductionPlan,
  PanelNarrativeMode,
} from "../canonical-production-plan";
import { PRODUCTION_RULES } from "../production-rules";

import { computeCanonicalProductionMetrics } from "./metrics";

/**
 * Garantit qu'aucun panel non-cutaway n'est « vide » : dialogue, narration,
 * pensée, SFX ou silence intentionnel (budget limité).
 */
export function assignPanelTextAnchors(
  plan: CanonicalChapterProductionPlan,
): CanonicalChapterProductionPlan {
  const beatById = new Map(plan.beats.map((b) => [b.beatId, b]));
  const actorDrivenPanels = plan.panels.filter((p) => p.isActorDriven && !p.isCutaway);
  const maxIntentional = Math.max(
    0,
    Math.floor(actorDrivenPanels.length * PRODUCTION_RULES.dialogue.maxSilentActorDrivenRatio),
  );
  let intentionalBudget = maxIntentional;

  const newPanels = plan.panels.map((panel) => {
    if (panel.isCutaway) return panel;
    if (panel.textPlan.mode !== "silent") return panel;

    const beat = beatById.get(panel.beatId);
    const storyHint = [beat?.dramaticChange, beat?.summary, panel.purpose]
      .filter(Boolean)
      .join(" ")
      .trim();

    if (intentionalBudget > 0 && (beat?.hasTension || beat?.hasEmotion)) {
      intentionalBudget -= 1;
      return {
        ...panel,
        purpose:
          panel.purpose?.trim() ||
          `Silence narratif — ${storyHint.slice(0, 120) || "tension"}`,
        textPlan: {
          ...panel.textPlan,
          panelId: panel.panelId,
          mode: "intentional_silence" as const satisfies PanelNarrativeMode,
          reserveTextArea: false,
        },
      };
    }

    if (beat?.hasDialogue) {
      return {
        ...panel,
        textPlan: {
          panelId: panel.panelId,
          mode: "dialogue" as const satisfies PanelNarrativeMode,
          anchor: {
            speakerId: beat.involvedCharacters[0],
            reserveBubbleSpace: true,
          },
          reserveTextArea: true,
        },
      };
    }

    if (beat?.hasAction) {
      return {
        ...panel,
        textPlan: {
          panelId: panel.panelId,
          mode: "sfx" as const satisfies PanelNarrativeMode,
          sfx: ["FWOOM"],
          reserveTextArea: true,
        },
      };
    }

    return {
      ...panel,
      textPlan: {
        panelId: panel.panelId,
        mode: "narration" as const satisfies PanelNarrativeMode,
        text: (beat?.summary || panel.purpose || "…").slice(0, 140),
        reserveTextArea: true,
      },
    };
  });

  const metrics = computeCanonicalProductionMetrics(newPanels);
  return { ...plan, panels: newPanels, metrics };
}
