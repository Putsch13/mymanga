/**
 * COMP-3 — Dialogue Placer
 * Convertit les dialogues d'un panel en bulles positionnées dans la page.
 * Utilise textBoxPlan.reservedZones pour éviter les collisions.
 */

import type { DialogueBubble } from "./manga-page-compositor";

type TextZone = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";

export interface DialogueEntry {
  speaker: string;
  text: string;
  type?: "speech" | "thought" | "shout" | "whisper" | "narration";
}

export interface PanelTextBoxPlan {
  reservedZones?: TextZone[];
}

/**
 * Positionne les bulles de dialogue d'un panel dans la page composite.
 * Les zones sont déduites depuis textBoxPlan.reservedZones du PanelContract.
 */
export function placeDialogueBubbles(
  textBoxPlan: PanelTextBoxPlan | null | undefined,
  panelX: number,
  panelY: number,
  panelWidth: number,
  panelHeight: number,
  dialogues: DialogueEntry[],
): DialogueBubble[] {
  if (!dialogues.length) return [];

  const bubbles: DialogueBubble[] = [];
  const zones: TextZone[] = textBoxPlan?.reservedZones && textBoxPlan.reservedZones.length > 0
    ? textBoxPlan.reservedZones
    : inferDefaultZones(dialogues.length);

  dialogues.forEach((dialogue, idx) => {
    const zone = zones[idx] ?? (idx % 2 === 0 ? "top-left" : "top-right");
    const { bx, by } = zoneToCoords(zone, panelX, panelY, panelWidth, panelHeight);

    const bubbleType = dialogue.type ?? inferBubbleType(dialogue.text);
    const bubbleWidth = Math.min(Math.max(120, dialogue.text.length * 7), panelWidth * 0.75);

    bubbles.push({
      text: dialogue.text,
      speaker: dialogue.speaker,
      x: bx,
      y: by,
      width: bubbleWidth,
      type: bubbleType,
      tailDirection: zone.includes("left") ? "right" : zone.includes("right") ? "left" : "bottom",
    });
  });

  return bubbles;
}

/**
 * Positionne une bulle de narration (caption) en haut ou bas du panel.
 */
export function placeNarrationCaption(
  text: string,
  panelX: number,
  panelY: number,
  panelWidth: number,
  isTop = true,
): DialogueBubble {
  return {
    text,
    x: panelX + panelWidth / 2,
    y: panelY + (isTop ? 28 : -28),
    width: panelWidth * 0.9,
    type: "narration",
    tailDirection: "bottom",
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function zoneToCoords(
  zone: TextZone,
  panelX: number,
  panelY: number,
  panelWidth: number,
  panelHeight: number,
): { bx: number; by: number } {
  const margin = 55;
  switch (zone) {
    case "top-left":    return { bx: panelX + panelWidth * 0.25, by: panelY + margin };
    case "top-right":   return { bx: panelX + panelWidth * 0.75, by: panelY + margin };
    case "bottom-left": return { bx: panelX + panelWidth * 0.25, by: panelY + panelHeight - margin };
    case "bottom-right":return { bx: panelX + panelWidth * 0.75, by: panelY + panelHeight - margin };
    case "center":      return { bx: panelX + panelWidth / 2,    by: panelY + panelHeight / 2 };
    default:            return { bx: panelX + panelWidth * 0.25, by: panelY + margin };
  }
}

function inferDefaultZones(count: number): TextZone[] {
  const defaults: TextZone[] = ["top-left", "top-right", "bottom-left", "bottom-right", "center"];
  return Array.from({ length: count }, (_, i) => defaults[i % defaults.length]);
}

function inferBubbleType(text: string): DialogueBubble["type"] {
  if (text.endsWith("!") && text.length < 20) return "shout";
  if (text.startsWith("(") || text.startsWith("*")) return "thought";
  if (text.toUpperCase() === text && text.length < 15) return "shout";
  if (text.trim().length < 20 && text.toLowerCase().startsWith("...")) return "whisper";
  return "speech";
}
