import {
  resolveStoryboardTextContractForPersistence,
  textContractToLegacyDialogue,
  type PanelTextBundle,
} from "@manga-ai-studio/core";
import type { StoryboardPanelV3 as StoryboardPanel } from "@manga-ai-studio/ai";
import type { V3RenderedPanelRecord } from "./types";

export interface ResolvedPanelTextContract {
  textContract: ReturnType<typeof resolveStoryboardTextContractForPersistence>;
  legacyDialogueLines: ReturnType<typeof textContractToLegacyDialogue>;
  narrationPersist: string | null;
  sfxPersist: string[];
}

export function resolvePanelTextContract(
  panel: StoryboardPanel,
  record: V3RenderedPanelRecord,
): ResolvedPanelTextContract {
  const panelTextBundle =
    typeof (panel as { panelTextBundle?: unknown }).panelTextBundle === "object"
    && (panel as { panelTextBundle?: unknown }).panelTextBundle !== null
      ? ((panel as { panelTextBundle?: PanelTextBundle | null }).panelTextBundle ?? null)
      : null;

  const pExt = panel as StoryboardPanel & {
    textContract?: unknown;
    dialogues?: Array<{ speaker: string; text: string }> | null;
  };

  /**
   * PR9 — Contrat texte : priorité au `textContract` studio sur le panel ;
   * `panelTextPayload` du spec ne l’écrase que s’il n’y a pas de contrat persisté.
   */
  const textContract = resolveStoryboardTextContractForPersistence(
    {
      panelId: panel.panelId,
      textContract: pExt.textContract,
      dialogue: Array.isArray(panel.dialogue) && panel.dialogue.length > 0 ? panel.dialogue : null,
      dialogues:
        (!panel.dialogue || panel.dialogue.length === 0)
        && Array.isArray(pExt.dialogues)
        && pExt.dialogues.length > 0
          ? pExt.dialogues
          : null,
      narration: panel.narration ?? null,
      sfx: panel.sfx ?? null,
      panelTextBundle,
    },
    { specPanelTextPayload: record.spec.panelTextPayload ?? null },
  );

  return {
    textContract,
    legacyDialogueLines: textContractToLegacyDialogue(textContract),
    narrationPersist: textContract.narration ?? null,
    sfxPersist: textContract.sfx.map((entry) => entry.text),
  };
}
