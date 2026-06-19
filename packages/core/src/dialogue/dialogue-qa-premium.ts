/**
 * P0.15 — QA dialogues premium (heuristiques manga, sans LLM).
 */
import type { PanelTextContract } from "../generation/panel-text-contract";

export type DialogueQaPremiumIssue = {
  code: string;
  severity: "warning" | "error";
  panelNumber: number;
  message: string;
};

export type DialogueQaPremiumScores = {
  speakerAnchorScore: number;
  voiceConsistencyScore: number;
  bubbleLengthScore: number;
  expositionScore: number;
  repetitionScore: number;
  emotionalFitScore: number;
  mangaReadabilityScore: number;
};

export type DialogueQaPremiumResult = {
  valid: boolean;
  issues: DialogueQaPremiumIssue[];
  scores: DialogueQaPremiumScores;
};

export type DialogueQaPremiumPanelInput = {
  panelNumber: number;
  text: PanelTextContract;
  /** IDs personnages visibles dans le panel (ancrage speaker). */
  visibleCharacterIds?: string[];
  /** Speakers autorisés hors-champ (offscreen). */
  offscreenAllowedSpeakerIds?: string[];
};

const MAX_BUBBLE_CHARS = 220;
const EXPOSITION_PATTERN = /\b(parce que|en effet|tu sais que|il faut savoir|autrement dit|rappelons)\b/i;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Vérifie bulles, speakerId, longueur, exposition grossière.
 */
export function runDialogueQaPremium(input: {
  panels: DialogueQaPremiumPanelInput[];
  maxBubbleChars?: number;
}): DialogueQaPremiumResult {
  const maxBubble = input.maxBubbleChars ?? MAX_BUBBLE_CHARS;
  const issues: DialogueQaPremiumIssue[] = [];
  let bubbleLenHits = 0;
  let speakerIdHits = 0;
  let expositionHits = 0;
  let repetitionPairs = 0;
  const textsSeen = new Map<string, number>();

  for (const p of input.panels) {
    const vis = new Set(p.visibleCharacterIds ?? []);
    const off = new Set(p.offscreenAllowedSpeakerIds ?? []);

    for (const d of p.text.dialogues) {
      const t = d.text.trim();
      if (!t) continue;

      if (!d.speakerId?.trim()) {
        issues.push({
          code: "DIALOGUE_SPEAKER_ID_MISSING",
          severity: "error",
          panelNumber: p.panelNumber,
          message: `Réplique sans characterId ancré (panel ${p.panelNumber}, « ${d.speakerName} »).`,
        });
      } else {
        speakerIdHits += 1;
        const sid = d.speakerId.trim();
        if (vis.size > 0 && !vis.has(sid) && !off.has(sid)) {
          issues.push({
            code: "DIALOGUE_SPEAKER_NOT_VISIBLE",
            severity: "warning",
            panelNumber: p.panelNumber,
            message: `Speaker ${sid} non listé comme visible dans le panel ${p.panelNumber} (hors-champ non justifié).`,
          });
        }
      }

      if (t.length > maxBubble) {
        issues.push({
          code: "DIALOGUE_BUBBLE_TOO_LONG",
          severity: "warning",
          panelNumber: p.panelNumber,
          message: `Bulles trop longues (${t.length} > ${maxBubble}) sur le panel ${p.panelNumber}.`,
        });
        bubbleLenHits += 1;
      }

      if (EXPOSITION_PATTERN.test(t)) {
        issues.push({
          code: "DIALOGUE_EXPOSITION_HEAVY",
          severity: "warning",
          panelNumber: p.panelNumber,
          message: `Ton expositif possible sur le panel ${p.panelNumber}.`,
        });
        expositionHits += 1;
      }

      const norm = t.toLowerCase().replace(/\s+/g, " ");
      const prev = textsSeen.get(norm) ?? 0;
      if (prev > 0) repetitionPairs += 1;
      textsSeen.set(norm, prev + 1);
    }
  }

  const panelCount = Math.max(1, input.panels.length);
  const dialogueLines = input.panels.reduce((acc, p) => acc + p.text.dialogues.filter((d) => d.text.trim()).length, 0);

  const errors = issues.filter((i) => i.severity === "error").length;

  const speakerAnchorScore = clamp01(dialogueLines > 0 ? speakerIdHits / dialogueLines : 1);
  const voiceConsistencyScore = 0.75;
  const bubbleLengthScore = clamp01(1 - bubbleLenHits / Math.max(1, dialogueLines));
  const expositionScore = clamp01(1 - expositionHits / Math.max(1, dialogueLines));
  const repetitionScore = clamp01(1 - repetitionPairs / Math.max(1, dialogueLines));
  const emotionalFitScore = 0.7;
  const mangaReadabilityScore = clamp01(
    (speakerAnchorScore + bubbleLengthScore + expositionScore + repetitionScore) / 4,
  );

  return {
    valid: errors === 0,
    issues,
    scores: {
      speakerAnchorScore,
      voiceConsistencyScore,
      bubbleLengthScore,
      expositionScore,
      repetitionScore,
      emotionalFitScore,
      mangaReadabilityScore,
    },
  };
}
