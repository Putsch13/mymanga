/* eslint-disable @typescript-eslint/no-explicit-any -- TODO(Sprint 4 / TASK-4.1): typer après split de narrative-pass.ts. */
/**
 * legacy-scene-panel-dialogue.ts
 *
 * Helper privé extrait de `narrative-pass.ts` (LEGACY FALLBACK ONLY).
 *
 * PR9 — Aligne le dialogue du chemin scène legacy avec celui du
 * storyboard / render-spec : on passe par
 * `legacyDialogueLinesFromStoryboardPanelLike` qui synthétise un
 * `PanelTextContract` cohérent.
 *
 * Suppression à prévoir en même temps que `runNarrativePass` quand le
 * legacy sera complètement retiré (premium-only).
 */
import {
  legacyDialogueLinesFromStoryboardPanelLike,
  legacyDialogueLinesFromBlueprintPremium,
  type PanelBlueprintPremium,
} from "@manga-ai-studio/core";

export function legacyScenePanelUnifiedDialogue(
  panel: Record<string, any>,
  blueprint: Record<string, unknown> | undefined,
): Array<{ speaker: string; text: string }> {
  const bp = blueprint ?? {};
  const pid = String(panel.panelId ?? panel.panelNumber ?? "panel");
  const normalizedDialogueLines = Array.isArray(bp.dialogueLines)
    ? (bp.dialogueLines as Array<{ speaker?: string; text: string }>).map((l) => ({
        speaker:
          typeof l.speaker === "string" && l.speaker.trim().length > 0
            ? l.speaker.trim()
            : "unknown",
        text: typeof l.text === "string" ? l.text : "",
      }))
    : undefined;
  const fromBpLines = legacyDialogueLinesFromBlueprintPremium({
    panelId: typeof bp.panelId === "string" ? bp.panelId : pid,
    dialogueLines: normalizedDialogueLines,
    textContract: bp.textContract as PanelBlueprintPremium["textContract"],
    panelTextBundle:
      typeof bp.panelTextBundle === "object" &&
      bp.panelTextBundle !== null &&
      !Array.isArray(bp.panelTextBundle)
        ? (bp.panelTextBundle as PanelBlueprintPremium["panelTextBundle"])
        : null,
    narrationText: typeof bp.narrationText === "string" ? bp.narrationText : null,
    sfxCues: Array.isArray(bp.sfxCues) ? (bp.sfxCues as string[]) : undefined,
  });
  const fromPanel =
    Array.isArray(panel.dialogues) && panel.dialogues.length > 0
      ? (panel.dialogues as Array<{ speaker?: string; text?: string }>)
      : panel.dialogue && typeof panel.dialogue === "object"
        ? [panel.dialogue as { speaker?: string; text?: string }]
        : null;
  const dialogueLines = fromBpLines.length > 0 ? fromBpLines : fromPanel;
  const dialogueForContract = dialogueLines?.length
    ? dialogueLines
        .map((row) => ({
          speaker: row.speaker,
          text: String(row.text ?? "").trim(),
        }))
        .filter((row) => row.text.length > 0)
    : null;
  const sfxRaw = panel.sfx;
  const sfx = Array.isArray(sfxRaw)
    ? sfxRaw
    : sfxRaw != null && sfxRaw !== ""
      ? [String(sfxRaw)]
      : null;
  const bundle =
    (typeof bp.panelTextBundle === "object" && bp.panelTextBundle !== null
      ? bp.panelTextBundle
      : null) ??
    (typeof panel.panelTextBundle === "object" && panel.panelTextBundle !== null
      ? panel.panelTextBundle
      : null);
  return legacyDialogueLinesFromStoryboardPanelLike({
    panelId: String(panel.panelId ?? panel.panelNumber ?? "panel"),
    dialogue: dialogueForContract?.length ? dialogueForContract : null,
    narration: typeof panel.narration === "string" ? panel.narration : null,
    sfx,
    panelTextBundle: bundle as never,
  });
}
