import type {
  PanelContract,
  PanelBlueprintPremium,
  BeatNarrativeContract,
} from "@manga-ai-studio/core";
import { legacyDialogueLinesFromStoryboardPanelLike } from "@manga-ai-studio/core";
import type { StoryboardPanel } from "@manga-ai-studio/ai";

const VALID_PURPOSES = new Set<PanelContract["purpose"]>([
  "establishing",
  "reaction",
  "dialogue",
  "action",
  "reveal",
  "aftermath",
]);

/**
 * Resolves the panel `purpose` in a strict priority order:
 *   1. `panelBlueprint.purpose` — authoritative value from the premium chapter contract.
 *   2. `beatNarrativeContract.storyFunction` — mapped without promoting to `action`
 *      unless the beat itself is explicitly in a combat envelope.
 *   3. Structural signals on the panel (dialogue lines, narration).
 *   4. Last-resort keyword heuristic — deliberately won't return `action`.
 */
export function deducePurpose(
  panel: StoryboardPanel,
  opts: {
    panelBlueprint?: PanelBlueprintPremium;
    beatNarrativeContract?: BeatNarrativeContract;
    panelId?: string;
    legacyDialogueLines: (panel: StoryboardPanel, panelId: string) => unknown[];
  },
): PanelContract["purpose"] {
  const bpPurpose = opts.panelBlueprint?.purpose;
  if (bpPurpose && VALID_PURPOSES.has(bpPurpose as PanelContract["purpose"])) {
    return bpPurpose as PanelContract["purpose"];
  }

  const beat = opts.beatNarrativeContract;
  if (beat) {
    switch (beat.storyFunction) {
      case "setup":
        return "establishing";
      case "aftermath":
        return "aftermath";
      case "revelation":
      case "discovery":
        return "reveal";
      case "dialogue_tension":
      case "decision":
      case "investigation":
        return "dialogue";
      case "movement":
        if (
          beat.actionEnvelope === "combat_light" ||
          beat.actionEnvelope === "combat_full"
        ) {
          return "action";
        }
        return "dialogue";
      case "transition":
        return "establishing";
    }
  }

  const pid = opts.panelId?.trim() || `panel-${panel.panelNumber}`;
  if (opts.legacyDialogueLines(panel, pid).length > 0) {
    return "dialogue";
  }

  const desc = `${panel.caption ?? ""} ${panel.camera ?? ""} ${panel.prompt ?? ""}`.toLowerCase();
  if (desc.includes("wide") || desc.includes("establish") || desc.includes("location")) {
    return "establishing";
  }
  if (desc.includes("react") || desc.includes("expression") || desc.includes("face")) {
    return "reaction";
  }
  if (desc.includes("aftermath") || desc.includes("retomb") || desc.includes("après le choc")) {
    return "aftermath";
  }
  if (desc.includes("reveal")) {
    return "reveal";
  }

  return "dialogue";
}

export function deduceShotType(panel: StoryboardPanel): PanelContract["shotType"] {
  const desc = `${panel.camera ?? ""} ${panel.caption ?? ""} ${panel.prompt ?? ""}`.toLowerCase();
  if (/(wide shot|establishing|panorama|full environment|vue d'ensemble)/.test(desc)) return "wide";
  if (/(extreme close|extreme closeup|micro détail|sur les yeux)/.test(desc)) return "extreme_closeup";
  if (/(close-up|closeup|close up|portrait|gros plan)/.test(desc)) return "closeup";
  if (/(over shoulder|over-shoulder|par-dessus l'épaule|par dessus l'épaule)/.test(desc)) return "over_shoulder";
  console.warn(
    `[panel-contract] shotType fallback="medium" panel=${panel.panelNumber} camera="${panel.camera ?? ""}" caption="${(panel.caption ?? "").slice(0, 60)}"`,
  );
  return "medium";
}

export function deduceCameraAngle(panel: StoryboardPanel): PanelContract["cameraAngle"] {
  const desc = `${panel.camera ?? ""} ${panel.caption ?? ""}`.toLowerCase();
  if (/(low angle|from below|contre-plongée|contre plongee)/.test(desc)) return "low_angle";
  if (/(high angle|from above|plongée|plongee|bird's eye)/.test(desc)) return "high_angle";
  if (/(dutch|tilted|oblique)/.test(desc)) return "dutch";
  return "eye_level";
}
