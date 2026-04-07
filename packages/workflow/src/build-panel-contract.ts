/**
 * Construit un PanelContract strict avant la génération d'image.
 * Le panel n'est plus un prompt libre, c'est une spécification visuelle contrôlée.
 */

import type { PanelContract } from "@manga-ai-studio/core";
import type { StoryboardPanel } from "@manga-ai-studio/ai";

export interface PanelContractInput {
  panelId: string;
  pageNumber: number;
  panelNumber: number;
  panel: StoryboardPanel;
  sceneContext: {
    location: string;
    timeOfDay?: string;
    atmosphere?: string;
    presentCharacters: string[];
  };
  previousPanelId?: string;
  visualAnchorIds: string[];
}

/**
 * Construit un PanelContract depuis un StoryboardPanel.
 */
export async function buildPanelContract(input: PanelContractInput): Promise<PanelContract> {
  const panel = input.panel;
  
  // Déduire le purpose depuis le type de panel
  const purpose = deducePurpose(panel);
  
  // Déduire le shotType depuis la description
  const shotType = deduceShotType(panel);
  
  // Déduire le cameraAngle
  const cameraAngle = deduceCameraAngle(panel);

  // Extraire les personnages requis
  const requiredCharacters = panel.characters ?? [];
  const focusCharacters = requiredCharacters.slice(0, 2); // Max 2 focus

  // Extraire les éléments obligatoires depuis la description
  const mustShow = extractMustShow(panel);
  const mustNotShow: string[] = []; // À enrichir avec contraintes de continuité

  // Déterminer dialogueCount (supporte dialogue + dialogues)
  const dialogueCount =
    (panel.dialogues?.length ?? 0) + (panel.dialogue ? 1 : 0);

  // Plan de texte
  const textBoxPlan: PanelContract["textBoxPlan"] = {
    narration: Boolean(panel.narration),
    dialogueCount,
    sfx: panel.sfx ? [panel.sfx] : [],
    reservedZones: determineReservedZones(shotType, dialogueCount),
  };

  // Hints de rendu
  const renderHints: PanelContract["renderHints"] = {
    targetAspectRatio: determineAspectRatio(shotType),
    cropMode: shotType === "closeup" || shotType === "extreme_closeup" ? "contain" : "cover",
    focalPoint: shotType === "closeup" ? { x: 0.5, y: 0.4 } : undefined, // Légèrement vers le haut pour closeup
  };

  return {
    panelId: input.panelId,
    pageNumber: input.pageNumber,
    panelNumber: input.panelNumber,
    purpose,
    shotType,
    cameraAngle,
    focusCharacters,
    requiredCharacters,
    backgroundExtras: [], // À enrichir avec SceneExtrasRegistry
    mustShow,
    mustNotShow,
    continuityFromPanelId: input.previousPanelId,
    visualAnchorIds: input.visualAnchorIds,
    textBoxPlan,
    renderHints,
  };
}

function deducePurpose(panel: StoryboardPanel): PanelContract["purpose"] {
  const desc = `${panel.caption ?? ""} ${panel.camera ?? ""} ${panel.prompt ?? ""}`.toLowerCase();
  
  if (desc.includes("wide") || desc.includes("establish") || desc.includes("location")) {
    return "establishing";
  }
  if (desc.includes("react") || desc.includes("expression") || desc.includes("face")) {
    return "reaction";
  }
  if (panel.dialogue || (panel.dialogues?.length ?? 0) > 0) {
    return "dialogue";
  }
  if (desc.includes("action") || desc.includes("fight") || desc.includes("move")) {
    return "action";
  }
  if (desc.includes("reveal") || desc.includes("show")) {
    return "reveal";
  }
  
  return "dialogue"; // Défaut
}

function deduceShotType(panel: StoryboardPanel): PanelContract["shotType"] {
  const desc = `${panel.camera ?? ""} ${panel.caption ?? ""}`.toLowerCase();
  
  if (desc.includes("wide shot") || desc.includes("establishing")) return "wide";
  if (desc.includes("close-up") || desc.includes("closeup") || desc.includes("close up")) return "closeup";
  if (desc.includes("extreme close") || desc.includes("extreme closeup")) return "extreme_closeup";
  if (desc.includes("over shoulder") || desc.includes("over-shoulder")) return "over_shoulder";
  
  return "medium"; // Défaut
}

function deduceCameraAngle(panel: StoryboardPanel): PanelContract["cameraAngle"] {
  const desc = `${panel.camera ?? ""}`.toLowerCase();
  
  if (desc.includes("low angle") || desc.includes("from below")) return "low_angle";
  if (desc.includes("high angle") || desc.includes("from above")) return "high_angle";
  if (desc.includes("dutch") || desc.includes("tilted")) return "dutch";
  
  return "eye_level"; // Défaut
}

function extractMustShow(panel: StoryboardPanel): string[] {
  const desc = panel.prompt ?? "";
  const mustShow: string[] = [];
  
  // Patterns simples pour extraire éléments importants
  const propPatterns = /\b(sword|gun|pendant|artifact|weapon|book|letter|ring|crown)\b/gi;
  const matches = desc.matchAll(propPatterns);
  for (const match of matches) {
    if (match[0]) mustShow.push(match[0]);
  }
  
  return mustShow;
}

function determineReservedZones(
  shotType: PanelContract["shotType"],
  dialogueCount: number
): PanelContract["textBoxPlan"]["reservedZones"] {
  const zones: PanelContract["textBoxPlan"]["reservedZones"] = [];
  
  // Closeup: réserver bottom pour dialogues
  if (shotType === "closeup" || shotType === "extreme_closeup") {
    zones.push("bottom-left", "bottom-right");
  }
  
  // Wide: top pour narration
  if (shotType === "wide") {
    zones.push("top-left");
  }
  
  // Si beaucoup de dialogues, réserver center
  if (dialogueCount >= 3) {
    zones.push("center");
  }
  
  return zones;
}

function determineAspectRatio(shotType: PanelContract["shotType"]): string {
  switch (shotType) {
    case "wide":
      return "16:9";
    case "closeup":
    case "extreme_closeup":
      return "3:4";
    default:
      return "4:5";
  }
}
