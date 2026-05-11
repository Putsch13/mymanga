import type { PanelBlueprintPremium } from "../../types/narrative-facts";
import type { ContractCharacter, PanelNarrativeRole } from "../chapter-generation-contract";
import {
  buildPanelTextContractFromFragments,
  type PanelTextContract,
} from "../panel-text-contract";

export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

export function padMicroAction(purpose: string): string {
  const t = purpose.trim();
  if (t.length >= 10) return t;
  return `${t} — scène manga premium`.slice(0, 120);
}

export function mapRole(
  charId: string,
  heroId: string | null,
  focusIds: string[],
): ContractCharacter["role"] {
  if (heroId && charId === heroId) return "hero";
  if (focusIds.includes(charId)) return "support";
  return "npc";
}

export function mapPanelNarrativeRole(bp: PanelBlueprintPremium): PanelNarrativeRole {
  const hasBlueprintDialogue =
    Array.isArray(bp.dialogueLines) && bp.dialogueLines.some((d) => d.text?.trim());
  const bundleDialogues = bp.panelTextBundle?.dialogues;
  const hasBundleDialogue =
    Array.isArray(bundleDialogues) && bundleDialogues.some((d) => d.text?.trim());
  const hasNarration =
    Boolean(bp.narrationText?.trim()) || Boolean(bp.panelTextBundle?.narration?.trim());
  if (hasBlueprintDialogue || hasBundleDialogue) return "dialogue";
  if (hasNarration) return "emotion";
  if (bp.cutawayType && bp.cutawayType !== "none") return "insert";
  if (bp.subjectFocus === "environment") return "establishing";
  return "action";
}

export function panelTextFromBlueprint(
  panelId: string,
  bp: PanelBlueprintPremium,
): PanelTextContract {
  return buildPanelTextContractFromFragments({
    panelId,
    dialogueLines: bp.dialogueLines ?? null,
    narration: bp.narrationText ?? null,
    panelTextBundle: bp.panelTextBundle ?? null,
  });
}
