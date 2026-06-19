import type { PanelContract } from "@manga-ai-studio/core";
import type { StoryboardPanel } from "@manga-ai-studio/ai";
import type { PanelContractInput } from "../build-panel-contract";
import { uniq } from "./utils";

export function extractMustShow(
  panel: StoryboardPanel,
  sceneContext: PanelContractInput["sceneContext"],
): string[] {
  const desc = `${panel.prompt ?? ""} ${panel.caption ?? ""} ${sceneContext.location} ${sceneContext.atmosphere ?? ""}`;
  const needles = [
    "sword", "gun", "pendant", "artifact", "weapon", "book", "letter", "ring", "crown",
    "terminal", "console", "neon", "ruins", "flowers", "altar", "throne", "mask", "key",
    "mirror", "bridge", "market stall", "crowd", "rain", "fog", "blood", "vines", "lantern",
    "laboratory glass", "surveillance camera", "banner", "gate", "window", "staircase",
  ];
  const inferred = [
    /(lycée|lycee|école|ecole|school|campus)/i.test(desc) ? "school architecture" : "",
    /(cour du lycée|school courtyard|cour|playground)/i.test(desc) ? "open school courtyard" : "",
    /(élèves|eleves|students|student crowd|friends surrounding|amis autour)/i.test(desc) ? "visible students around the main action" : "",
    /(humili|ridicul|moque|raillerie)/i.test(desc) ? "public humiliation context" : "",
  ];
  return uniq([
    ...needles.filter((needle) => desc.toLowerCase().includes(needle.toLowerCase())),
    ...inferred,
  ]);
}

export function determineReservedZones(
  shotType: PanelContract["shotType"],
  dialogueCount: number,
): PanelContract["textBoxPlan"]["reservedZones"] {
  const zones: PanelContract["textBoxPlan"]["reservedZones"] = [];
  if (shotType === "closeup" || shotType === "extreme_closeup") {
    zones.push("bottom-left", "bottom-right");
  }
  if (shotType === "wide") {
    zones.push("top-left");
  }
  if (dialogueCount >= 3) {
    zones.push("center");
  }
  return zones;
}

export function determineAspectRatio(shotType: PanelContract["shotType"]): string {
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

export function extractInteractionBeat(text: string, purpose: PanelContract["purpose"]) {
  if (/(touch|grab|hold|push|ouvre|attrape|s'appuie|se confie|regarde)/i.test(text)) {
    return "environment and character interaction must remain readable";
  }
  if (/(humili|ridicul|moque|entouré de ses amis|crowd|students)/i.test(text)) {
    return "social pressure and surrounding crowd must remain visible around the protagonists";
  }
  if (purpose === "dialogue") return "spatial relation between speakers must remain clear";
  if (purpose === "action") return "movement must react to terrain and obstacles";
  return null;
}
