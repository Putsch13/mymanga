import {
  runRoutedImageGeneration,
  resolveAdultEngine,
} from "@manga-ai-studio/ai";

import { prisma } from "@manga-ai-studio/db";

import { generateAndPersistFaceCloseupRef } from "@/lib/characters/face-closeup-generator";

import type { ActiveLora } from "./resolve-character-canon-refs";

interface FaceCloseupArgs {
  characterId: string;
  projectId: string;
  sourceVisualLockId: string;
  intensityLayer: string;
  adultEngine: ReturnType<typeof resolveAdultEngine>;
  positivePrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  referenceImageUrls: string[];
  activeLoras: ActiveLora[];
}

/**
 * H9 — best-effort : on génère une face closeup ref dédiée après la primary
 * ref. Si ça échoue on n'écrase pas la primary, mais on loggue.
 */
export async function generateFaceCloseupStep(args: FaceCloseupArgs): Promise<void> {
  try {
    const result = await generateAndPersistFaceCloseupRef({
      prisma,
      characterId: args.characterId,
      projectId: args.projectId,
      sourceVisualLockId: args.sourceVisualLockId,
      positivePrompt: args.positivePrompt,
      negativePrompt: args.negativePrompt,
      referenceImageUrls: args.referenceImageUrls,
      runGenerate: async (prompt, negative, refs) => {
        const out = await runRoutedImageGeneration(
          {
            mode: "CHARACTER_SHEET",
            contentIntensityLayer: args.intensityLayer,
            adultEngine: args.adultEngine,
            isNewCharacter: false,
            hasCanonReferences: true,
            characterCountInScene: 1,
            continuityWeight: 95,
            needsInpaint: false,
            needsPoseVariation: false,
            preferPhotorealCover: false,
            explicitBlocked: args.intensityLayer === "RESTRICTED_BLOCKED_VISUAL",
            goreStylizedMature:
              args.intensityLayer === "MATURE_VISUAL"
              || args.intensityLayer === "ADULT_EXPLICIT",
          },
          {
            mode: "CHARACTER_SHEET",
            positivePrompt: prompt,
            negativePrompt: negative,
            width: args.width,
            height: args.height,
            referenceImageUrls: refs.length > 0 ? refs : undefined,
            loras: args.activeLoras.length > 0 ? args.activeLoras : undefined,
            providerParams: {
              contentIntensityLayer: args.intensityLayer,
              mode: "CHARACTER_SHEET",
              referencePolicy: "STRONG",
              panelCategory: "CHARACTER_FACE_CLOSEUP",
              triggerWords: args.activeLoras.map((item) => item.triggerWord),
            },
          },
        );
        if (!out.ok) return { ok: false, reason: out.reason };
        return {
          ok: true,
          imageUrl: out.result.imageUrl,
          provider: out.result.provider,
          model: out.result.model,
          requestId: out.result.requestId ?? null,
          jobId: out.result.jobId ?? null,
          seed: out.result.seed ?? null,
        };
      },
    });
    if (!result.ok) {
      console.warn(
        `[generate-visual] face_closeup_missed characterId=${args.characterId} `
        + `error=${result.error ?? result.skipped ?? "unknown"}`,
      );
    }
  } catch (faceErr) {
    console.warn(
      `[generate-visual] face_closeup_exception (non-blocking): ${
        faceErr instanceof Error ? faceErr.message : faceErr
      }`,
    );
  }
}
