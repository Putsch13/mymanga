/**
 * Utilitaires légers pour dédoublonner / contextualiser les répliques
 * (sans persistance DB — prêt à être injecté dans des prompts ou garde-fous).
 */

import { legacyDialogueLinesFromBlueprintPremium, type PanelBlueprintPremium } from "@manga-ai-studio/core";

export function normalizeDialogueSnippet(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96);
}

/** Snippets uniques, ordre de parcours des blueprints (PR9 : priorité `textContract`). */
export function collectDialogueSnippetsFromBlueprints(
  blueprints: Pick<
    PanelBlueprintPremium,
    "panelId" | "dialogueLines" | "textContract" | "panelTextBundle" | "narrationText" | "sfxCues"
  >[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const bp of blueprints) {
    for (const line of legacyDialogueLinesFromBlueprintPremium(bp)) {
      const n = normalizeDialogueSnippet(line.text);
      if (n.length === 0 || seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}
