import type { MangaPanelText } from "@manga-ai-studio/core";

export interface PanelTextPlannerInput {
  sceneId: string;
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
}

const MAX_BUBBLES_DEFAULT = 3;
const MAX_CHARS_DEFAULT = 60;

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
    const dialoguePanel = input.dialogue?.find((d) => d.panelId === panel.panelId);
    const rawBubbles = dialoguePanel?.bubbles ?? [];
    const rawNarration = dialoguePanel?.narration ?? [];
    const rawSfx = dialoguePanel?.sfx ?? [];

    // Limiter et tronquer les bulles
    const bubbles = rawBubbles
      .slice(0, maxBubbles)
      .map((b, i) => ({
        ...b,
        text: b.text.length > maxChars ? b.text.slice(0, maxChars - 1) + "…" : b.text,
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
    const finalBubbles = isHeavy && isEvenPanel ? bubbles.slice(0, 2) : bubbles;

    return {
      panelId: panel.panelId,
      bubbles: finalBubbles,
      narration: rawNarration.slice(0, 2),
      sfx: rawSfx.slice(0, 2),
      pauseWeight,
      density: finalBubbles.length === 0 ? "empty" : density,
      readingOrderFinal,
    };
  });
}
