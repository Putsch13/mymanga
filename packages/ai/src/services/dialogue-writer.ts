/**
 * Dialogue writer — façade qui orchestre les sous-modules de
 * `_dialogue-writer/` pour produire les panels de dialogue d'une scène manga
 * avec leur `SceneContinuityPayload`.
 *
 * Comportement :
 *   - sans `OPENAI_API_KEY` : fallback heuristique (sauf en mode premium-only
 *     où l'erreur est remontée).
 *   - avec OpenAI : appel ChatCompletions JSON, normalisation, attache des
 *     `PanelTextContract` (PR5).
 */

import OpenAI from "openai";
import type { MangaPanelText, SceneContinuityPayload } from "@manga-ai-studio/core";
import { getAppConfig, isPipelineV3PremiumOnlyEnabled } from "@manga-ai-studio/core";
import { generateFallbackPanels } from "./_dialogue-writer/fallback-panels";
import { inferSceneContinuityPayload } from "./_dialogue-writer/heuristic-payload";
import {
  attachPanelTextContracts,
  normalizeSceneContinuityPayload,
} from "./_dialogue-writer/normalize";
import { buildDialoguePrompt } from "./_dialogue-writer/prompt";
import type {
  DialogueWriterInput,
  DialogueWriterResult,
} from "./_dialogue-writer/types";

export type {
  DialogueWriterInput,
  DialogueWriterResult,
} from "./_dialogue-writer/types";
export { BUBBLE_TYPE_GUIDE } from "./_dialogue-writer/prompt";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function buildFallbackResult(
  input: DialogueWriterInput,
  fallbackReason: string,
): DialogueWriterResult {
  console.warn(
    `[dialogue-writer] sceneId=${input.sceneId} degraded_status=DEGRADED_DIALOGUE_FALLBACK reason=${fallbackReason}`,
  );
  const panels = attachPanelTextContracts(generateFallbackPanels(input));
  const continuityPayload = inferSceneContinuityPayload(input);
  return {
    panels,
    totalBubbles: panels.reduce((acc, p) => acc + (p.bubbles?.length ?? 0), 0),
    continuityPayload,
    degradedStatus: "DEGRADED_DIALOGUE_FALLBACK",
    usedFallback: true,
    fallbackReason,
  };
}

export async function writeDialogueForScene(
  input: DialogueWriterInput,
): Promise<DialogueWriterResult> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    if (isPipelineV3PremiumOnlyEnabled()) {
      throw new Error(
        "premium_dialogue_openai_required: OPENAI_API_KEY is required for dialogue in premium pipeline.",
      );
    }
    return buildFallbackResult(input, "OPENAI_API_KEY missing");
  }

  try {
    const response = await openai.chat.completions.create({
      model: getAppConfig().OPENAI_DIALOGUE_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Tu écris des dialogues manga cohérents, denses, visuels et canoniques. Tu ne dois ni inventer des personnages absents, ni casser la logique émotionnelle entre panels.",
        },
        { role: "user", content: buildDialoguePrompt(input) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.65,
      max_tokens: 3000,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      panels?: MangaPanelText[];
      continuityPayload?: SceneContinuityPayload;
    };
    if (!parsed.panels?.length) {
      if (isPipelineV3PremiumOnlyEnabled()) {
        throw new Error(
          "premium_dialogue_empty_response: Dialogue JSON returned without panels.",
        );
      }
      return buildFallbackResult(input, "Dialogue JSON returned without panels");
    }
    const panels = attachPanelTextContracts(parsed.panels);
    const continuityPayload = normalizeSceneContinuityPayload(
      parsed.continuityPayload,
      {
        ...inferSceneContinuityPayload(input),
        source: "generator_structured",
        confidence: 0.74,
      },
    );

    return {
      panels,
      totalBubbles: panels.reduce((acc, p) => acc + (p.bubbles?.length ?? 0), 0),
      continuityPayload,
      degradedStatus: "FULLY_OPERATIONAL",
      usedFallback: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[dialogue-writer] sceneId=${input.sceneId} error=${msg}`);
    if (isPipelineV3PremiumOnlyEnabled()) {
      throw err instanceof Error ? err : new Error(`premium_dialogue_llm_failed: ${msg}`);
    }
    return buildFallbackResult(input, msg);
  }
}
