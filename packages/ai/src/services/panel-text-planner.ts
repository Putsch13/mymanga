import type { MangaPanelText } from "@manga-ai-studio/core";

export interface PanelTextPlannerInput {
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

export interface PanelTextPlan {
  panelId: string;
  bubbles: MangaPanelText["bubbles"];
  narration: string[];
  sfx: string[];
  pauseWeight: number;
  density: "empty" | "light" | "medium" | "heavy";
  readingOrderFinal: number[];
  textScale: "normal" | "compact" | "micro";
}

const MAX_BUBBLES_DEFAULT = 3;
const MAX_CHARS_DEFAULT = 90;

const PANEL_AREA_WEIGHTS: Record<NonNullable<PanelTextPlannerInput["layout"]>, number[]> = {
  A: [1.2, 1.1, 1.4, 1.0, 0.95, 0.95],
  B: [1.3, 1.1, 1.4, 0.95, 0.95, 1.1],
  C: [1.35, 1.0, 1.15, 0.95, 1.0],
  D: [1.35, 1.0, 1.5, 0.95, 0.95, 1.1],
  E: [1.3, 0.9, 1.0, 1.2, 1.0],
  F: [1.1, 1.1, 1.0, 1.0],
};

function getPanelWeight(layout: PanelTextPlannerInput["layout"], panelIndex: number) {
  if (!layout) return 1;
  return PANEL_AREA_WEIGHTS[layout]?.[panelIndex] ?? 1;
}

function trimText(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(8, maxChars - 1)).trimEnd() + "…";
}

/**
 * Planifie et normalise le texte par panel :
 * - Limite la densité
 * - Tronque les bulles trop longues
 * - Calcule l'ordre de lecture
 * - Attribue un poids de pause (panels silencieux = plus de respiration)
 */
export function planPanelText(input: PanelTextPlannerInput): PanelTextPlan[] {
  const maxBubbles = input.maxBubblesPerPanel ?? MAX_BUBBLES_DEFAULT;
  const maxChars = input.maxCharsPerBubble ?? MAX_CHARS_DEFAULT;

  return input.panels.map((panel, panelIndex) => {
    const panelWeight = getPanelWeight(input.layout, panelIndex);
    const panelMaxBubbles = Math.max(1, Math.min(maxBubbles, panelWeight >= 1.2 ? 3 : panelWeight >= 0.9 ? 2 : 1));
    const panelMaxChars = Math.max(24, Math.round(maxChars * (panelWeight >= 1.3 ? 1 : panelWeight >= 1 ? 0.82 : 0.58)));
    const narrationMaxChars = Math.max(28, Math.round(panelMaxChars * 1.2));
    const textScale: PanelTextPlan["textScale"] =
      panelWeight >= 1.2 ? "normal" : panelWeight >= 0.9 ? "compact" : "micro";
    const dialoguePanel = input.dialogue?.find((d) => d.panelId === panel.panelId);
    const rawBubbles = dialoguePanel?.bubbles ?? [];
    const rawNarration = dialoguePanel?.narration ?? [];
    const rawSfx = dialoguePanel?.sfx ?? [];

    // Limiter et tronquer les bulles
    const bubbles = rawBubbles
      .slice(0, panelMaxBubbles)
      .map((b, i) => ({
        ...b,
        text: trimText(b.text, panelMaxChars),
        readingOrder: i + 1,
      }));

    // Calculer la densité
    const totalElements = bubbles.length + rawNarration.length + rawSfx.length;
    const density: PanelTextPlan["density"] =
      totalElements === 0
        ? "empty"
        : totalElements <= 1
        ? "light"
        : totalElements <= 3
        ? "medium"
        : "heavy";

    // Poids de pause : panels silencieux respirent plus
    const pauseWeight =
      density === "empty" ? 1.0 : density === "light" ? 0.7 : density === "medium" ? 0.4 : 0.2;

    // Ordre de lecture final
    const readingOrderFinal = bubbles.map((b) => b.readingOrder);

    // Alterner panels denses et silencieux si trop lourd
    const isHeavy = density === "heavy";
    const isEvenPanel = panelIndex % 2 === 0;
    const finalBubbles = bubbles;

    return {
      panelId: panel.panelId,
      bubbles: finalBubbles,
      narration: rawNarration.slice(0, panelWeight >= 1 ? 2 : 1).map((item) => trimText(item, narrationMaxChars)),
      sfx: rawSfx.slice(0, panelWeight >= 1 ? 2 : 1),
      pauseWeight,
      density: finalBubbles.length === 0 ? "empty" : density,
      readingOrderFinal,
      textScale,
    };
  });
}
