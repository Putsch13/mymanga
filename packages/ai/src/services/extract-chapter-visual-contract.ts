/**
 * Extraction du contrat visuel **local au chapitre** via LLM (JSON strict),
 * avec repli sûr si pas de clé OpenAI ou parse invalide.
 *
 * Façade qui orchestre :
 *   - les schémas Zod (`_extract-chapter-visual-contract/schema.ts`)
 *   - la normalisation des rôles/kinds (`normalize-roles.ts`)
 *   - la sanitisation des `sourceBeatIds` (`sanitize.ts`)
 *   - la construction des prompts (`prompt.ts`)
 *   - la dérivation des `RequiredVisualCoverage` (`derive-coverage.ts`)
 */

import OpenAI from "openai";
import type { ChapterVisualContract } from "../contracts/chapter-visual-contract";
import type { RequiredVisualCoverage } from "./required-visual-coverage";
import {
  requiredVisualCoverageFromChapterVisualContract,
  mergeRequiredVisualCoverageWithContract,
} from "./_extract-chapter-visual-contract/derive-coverage";
import { normalizeChapterVisualContractJsonRoles } from "./_extract-chapter-visual-contract/normalize-roles";
import {
  buildUserPrompt,
  SYSTEM_PROMPT,
  type ExtractChapterVisualContractInput,
} from "./_extract-chapter-visual-contract/prompt";
import { chapterVisualContractLlmSchema } from "./_extract-chapter-visual-contract/schema";
import {
  emptyContract,
  sanitizeContractForValidBeats,
} from "./_extract-chapter-visual-contract/sanitize";

export type { ExtractChapterVisualContractInput } from "./_extract-chapter-visual-contract/prompt";
export {
  normalizeCharacterRole,
} from "./_extract-chapter-visual-contract/normalize-roles";
export {
  requiredVisualCoverageFromChapterVisualContract,
  mergeRequiredVisualCoverageWithContract,
} from "./_extract-chapter-visual-contract/derive-coverage";

export interface ExtractChapterVisualContractResult {
  contract: ChapterVisualContract;
  usedOpenAI: boolean;
  warnings: string[];
  /** Obligations visuelles dérivées du contrat (importance required + beats valides). */
  requiredFromContract: RequiredVisualCoverage[];
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function extractChapterVisualContract(
  input: ExtractChapterVisualContractInput,
): Promise<ExtractChapterVisualContractResult> {
  const warnings: string[] = [];
  const beats = input.productionOutline?.beats ?? [];
  const validBeatIds = [...new Set(beats.map((b) => b.beatId).filter(Boolean))];

  if (!process.env.OPENAI_API_KEY) {
    warnings.push("chapter_visual_contract.openai_missing");
    return {
      contract: emptyContract(true),
      usedOpenAI: false,
      warnings,
      requiredFromContract: [],
    };
  }

  if (validBeatIds.length === 0) {
    warnings.push("chapter_visual_contract.no_beats");
    return {
      contract: emptyContract(true),
      usedOpenAI: false,
      warnings,
      requiredFromContract: [],
    };
  }

  try {
    /**
     * `OPENAI_CHAPTER_VISUAL_CONTRACT_MODEL` permet d'override le modèle
     * (par défaut `gpt-4o-mini`, on peut basculer sur `gpt-4o` pour plus
     * de précision).
     */
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAPTER_VISUAL_CONTRACT_MODEL ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input, validBeatIds) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.35,
      max_tokens: 4096,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const json = JSON.parse(raw) as unknown;
    const normalizedJson = normalizeChapterVisualContractJsonRoles(json);
    const parsed = chapterVisualContractLlmSchema.safeParse(normalizedJson);
    if (!parsed.success) {
      warnings.push(
        `chapter_visual_contract.parse_failed=${parsed.error.message.slice(0, 200)}`,
      );
      return {
        contract: emptyContract(true),
        usedOpenAI: true,
        warnings,
        requiredFromContract: [],
      };
    }

    const validSet = new Set(validBeatIds);
    const contract = sanitizeContractForValidBeats(parsed.data, validSet);
    const requiredFromContract =
      requiredVisualCoverageFromChapterVisualContract(contract);

    return {
      contract,
      usedOpenAI: true,
      warnings,
      requiredFromContract,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warnings.push(`chapter_visual_contract.error=${msg.slice(0, 240)}`);
    return {
      contract: emptyContract(true),
      usedOpenAI: false,
      warnings,
      requiredFromContract: [],
    };
  }
}
