/**
 * prompt-builder-core.ts
 *
 * Cœur du builder : assemble les blocs SUBJECT/ENV/SHOT/ACTION/STYLE
 * et le bloc négatif. Extrait de `minimal-panel-prompt-builder.ts`
 * (audit-v9).
 */

import type { PanelRenderSpec } from "../../contracts/panel-render-spec";
import {
  buildPromptActionBlock,
  buildPromptEnvironmentBlock,
  buildPromptShotBlock,
  buildPromptStyleBlock,
  buildPromptSubjectBlock,
} from "./prompt-blocks";
import { buildPromptNegativeBlock } from "./prompt-negative-block";
import {
  MIN_PROMPT_LENGTH,
  clampLength,
  padWithStyleHints,
} from "./prompt-text-utils";

export interface BuiltPromptResult {
  positive: string;
  negative: string;
  blocks: {
    subject: string;
    environment: string;
    shot: string;
    action: string;
    style: string;
    negative: string;
  };
  length: number;
}

const MAX_LENGTH = 1200;

export function buildMinimalPanelPrompt(spec: PanelRenderSpec): BuiltPromptResult {
  const subject = buildPromptSubjectBlock(spec);
  const environment = buildPromptEnvironmentBlock(spec);
  const shot = buildPromptShotBlock(spec);
  const action = buildPromptActionBlock(spec);
  const style = buildPromptStyleBlock(spec);
  const negative = buildPromptNegativeBlock(spec);

  const positiveSections = [subject, environment, shot, action, style].filter(Boolean);
  let positive = positiveSections.join("\n");
  positive = clampLength(positive, MAX_LENGTH);
  if (positive.length < MIN_PROMPT_LENGTH) {
    positive = padWithStyleHints(positive, spec);
  }
  return {
    positive,
    negative,
    blocks: { subject, environment, shot, action, style, negative },
    length: positive.length,
  };
}
