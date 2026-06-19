import type { MangaPanelText } from "../types/manga-dialogue";

/**
 * Plan de mise en page du texte (bulles / narration / SFX) par panel.
 * Vivant dans le core pour une seule source de vérité avec le plan canonique
 * (`reserveTextArea` aligné sur la densité réelle du texte).
 */
export interface PanelDialogueTextPlannerInput {
  sceneId: string;
  layout?: "A" | "B" | "C" | "D" | "E" | "F";
  panels: Array<{
    panelId: string;
    action?: string;
    mood?: string;
    characters?: string[];
  }>;
  dialogue?: MangaPanelText[];
  maxBubblesPerPanel?: number;
  maxCharsPerBubble?: number;
}

export interface PanelDialogueTextPlan {
  panelId: string;
  bubbles: MangaPanelText["bubbles"];
  narration: string[];
  sfx: string[];
  pauseWeight: number;
  density: "empty" | "light" | "medium" | "heavy";
  readingOrderFinal: number[];
  textScale: "normal" | "compact" | "micro";
  /** Réserver une zone lisible pour overlays (bulles / légendes) — propagée aux prompts de rendu. */
  reserveTextArea: boolean;
}

const MAX_BUBBLES_DEFAULT = 3;
const MAX_CHARS_DEFAULT = 90;

const PANEL_AREA_WEIGHTS: Record<NonNullable<PanelDialogueTextPlannerInput["layout"]>, number[]> = {
  A: [1.2, 1.1, 1.4, 1.0, 0.95, 0.95],
  B: [1.3, 1.1, 1.4, 0.95, 0.95, 1.1],
  C: [1.35, 1.0, 1.15, 0.95, 1.0],
  D: [1.35, 1.0, 1.5, 0.95, 0.95, 1.1],
  E: [1.3, 0.9, 1.0, 1.2, 1.0],
  F: [1.1, 1.1, 1.0, 1.0],
};

function getPanelWeight(layout: PanelDialogueTextPlannerInput["layout"], panelIndex: number) {
  if (!layout) return 1;
  return PANEL_AREA_WEIGHTS[layout]?.[panelIndex] ?? 1;
}

function trimText(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(8, maxChars - 1)).trimEnd() + "…";
}

function computeReserveTextArea(plan: {
  density: PanelDialogueTextPlan["density"];
  bubbles: PanelDialogueTextPlan["bubbles"];
  narration: string[];
  sfx: string[];
}): boolean {
  if (plan.density === "empty") return false;
  if (plan.density === "heavy" || plan.density === "medium") return true;
  return plan.bubbles.length > 0 || plan.narration.length > 0 || plan.sfx.length > 0;
}

/**
 * Planifie et normalise le texte par panel (densité, troncature, ordre de lecture).
 */
export function planPanelDialogueText(input: PanelDialogueTextPlannerInput): PanelDialogueTextPlan[] {
  const maxBubbles = input.maxBubblesPerPanel ?? MAX_BUBBLES_DEFAULT;
  const maxChars = input.maxCharsPerBubble ?? MAX_CHARS_DEFAULT;

  return input.panels.map((panel, panelIndex) => {
    const panelWeight = getPanelWeight(input.layout, panelIndex);
    const panelMaxBubbles = Math.max(1, Math.min(maxBubbles, panelWeight >= 1.2 ? 3 : panelWeight >= 0.9 ? 2 : 1));
    const panelMaxChars = Math.max(24, Math.round(maxChars * (panelWeight >= 1.3 ? 1 : panelWeight >= 1 ? 0.82 : 0.58)));
    const narrationMaxChars = Math.max(28, Math.round(panelMaxChars * 1.2));
    const textScale: PanelDialogueTextPlan["textScale"] =
      panelWeight >= 1.2 ? "normal" : panelWeight >= 0.9 ? "compact" : "micro";
    const dialoguePanel = input.dialogue?.find((d) => d.panelId === panel.panelId);
    const rawBubbles = dialoguePanel?.bubbles ?? [];
    const rawNarration = dialoguePanel?.narration ?? [];
    const rawSfx = dialoguePanel?.sfx ?? [];

    const bubbles = rawBubbles
      .slice(0, panelMaxBubbles)
      .map((b, i) => ({
        ...b,
        text: trimText(b.text, panelMaxChars),
        readingOrder: i + 1,
      }));

    const totalElements = bubbles.length + rawNarration.length + rawSfx.length;
    const density: PanelDialogueTextPlan["density"] =
      totalElements === 0
        ? "empty"
        : totalElements <= 1
          ? "light"
          : totalElements <= 3
            ? "medium"
            : "heavy";

    const pauseWeight =
      density === "empty" ? 1.0 : density === "light" ? 0.7 : density === "medium" ? 0.4 : 0.2;

    const readingOrderFinal = bubbles.map((b) => b.readingOrder);

    const narration = rawNarration.slice(0, panelWeight >= 1 ? 2 : 1).map((item) => trimText(item, narrationMaxChars));
    const sfx = rawSfx.slice(0, panelWeight >= 1 ? 2 : 1);

    const effectiveDensity: PanelDialogueTextPlan["density"] = bubbles.length === 0 ? "empty" : density;

    return {
      panelId: panel.panelId,
      bubbles,
      narration,
      sfx,
      pauseWeight,
      density: effectiveDensity,
      readingOrderFinal,
      textScale,
      reserveTextArea: computeReserveTextArea({
        density: effectiveDensity,
        bubbles,
        narration,
        sfx,
      }),
    };
  });
}
