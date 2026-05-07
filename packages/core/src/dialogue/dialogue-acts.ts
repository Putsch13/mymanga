/**
 * DialogueActs — structured representation of required dialogue interactions.
 *
 * Built from IntentNarrativeContract + outline beats, then verified against
 * the generated dialogue lines. Each act specifies who must say what to whom.
 */

import { z } from "zod";
import { zodLlmEnum } from "../utils/zod-llm";

export const dialogueActPurposeValues = [
  "warning",
  "reveal",
  "order",
  "question",
  "refusal",
  "emotional",
  "greeting",
  "threat",
  "explanation",
] as const;

export const dialogueActSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  beatId: z.string().min(1),
  speakerType: zodLlmEnum(["character", "npc_group"]),
  speakerId: z.string().min(1),
  targetCharacterIds: z.array(z.string()).default([]),
  purpose: zodLlmEnum([...dialogueActPurposeValues]),
  mustMention: z.array(z.string()).default([]),
  maxLines: z.number().int().min(1).default(3),
});

export type DialogueAct = z.infer<typeof dialogueActSchema>;

export type DialogueActsValidationResult = {
  ok: boolean;
  fulfilled: string[];
  unfulfilled: string[];
};

export type PanelTextForActCheck = {
  beatId: string;
  speakerId?: string | null;
  text: string;
};

/**
 * Verify that all required DialogueActs have at least one matching panel text.
 */
export function validateDialogueActs(
  acts: DialogueAct[],
  panelTexts: PanelTextForActCheck[],
): DialogueActsValidationResult {
  const fulfilled: string[] = [];
  const unfulfilled: string[] = [];

  for (const act of acts) {
    const match = panelTexts.some((pt) => {
      if (pt.beatId !== act.beatId) return false;
      if (pt.speakerId !== act.speakerId) return false;
      if (act.mustMention.length === 0) return true;
      const lower = pt.text.toLowerCase();
      return act.mustMention.every((term) => lower.includes(term.toLowerCase()));
    });
    if (match) {
      fulfilled.push(act.id);
    } else {
      unfulfilled.push(act.id);
    }
  }

  return {
    ok: unfulfilled.length === 0,
    fulfilled,
    unfulfilled,
  };
}
