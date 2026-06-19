import type { StoryboardPanel, StoryboardPlan } from "@manga-ai-studio/ai/contracts";
import { getPanelPromptFingerprint } from "./panel-prompt-fingerprint";

const SHOT_VARIATIONS = [
  "wide establishing shot",
  "medium character shot",
  "close-up emotional reaction",
  "over-the-shoulder composition",
  "insert shot of hands or meaningful object",
  "side profile shot",
  "foreground-background depth composition",
  "low angle dramatic shot",
  "high angle vulnerable shot",
  "silent reaction panel",
  "movement-focused panel",
  "environmental transition shot",
] as const;

/**
 * Dédoublonne les empreintes actionLine/purpose (QA pré-rendu) en préfixant
 * chaque panel d’un groupe sur-représenté (>2 occurrences) par un marqueur
 * unique (panelId + variation de cadrage).
 */
export function repairStoryboardPlanRepeatedPromptFingerprints(plan: StoryboardPlan): void {
  const panels = plan.pages.flatMap((p) => p.panels);
  const fpToPanels = new Map<string, StoryboardPanel[]>();

  for (const panel of panels) {
    const fp = getPanelPromptFingerprint(panel as unknown as Record<string, unknown>);
    const list = fpToPanels.get(fp) ?? [];
    list.push(panel);
    fpToPanels.set(fp, list);
  }

  for (const [, group] of fpToPanels) {
    if (group.length <= 2) continue;
    group.forEach((panel, idx) => {
      const variation = SHOT_VARIATIONS[idx % SHOT_VARIATIONS.length];
      const marker = `[#${panel.panelId} · ${variation}] `;
      if (!panel.actionLine.includes(`[#${panel.panelId}`)) {
        panel.actionLine = `${marker}${panel.actionLine}`.trim();
      }
    });
  }
}
