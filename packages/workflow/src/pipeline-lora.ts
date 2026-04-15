/**
 * Auto LoRA training queue logic.
 * Extracted from run-full-chapter-pipeline.ts for testability.
 */
import { buildTriggerWord, trainCharacterLora } from "@manga-ai-studio/ai";
import { prisma, type Prisma } from "@manga-ai-studio/db";

export type LoadedLoraAttachment = {
  id: string;
  enabled: boolean;
  weight: number;
  characterId: string | null;
  lora: {
    id: string;
    name: string;
    status: string;
    weightsMeta: unknown;
  };
};

export type LoadedCharacterForPipeline = {
  id: string;
  name: string;
  roleType?: string | null;
  objective?: string | null;
  fear?: string | null;
  biography?: string | null;
  traits?: string[];
  flaws?: string[];
  gender: string | null;
  appearance: string | null;
  hairColor: string | null;
  eyeColor: string | null;
  outfitDefault: string | null;
  canonicalImageUrl: string | null;
  canonSignatureText: string | null;
  forbiddenVisualDrift: unknown;
  bodyDetails: string | null;
  wardrobeDetails: string | null;
  visualProfile: Record<string, unknown>;
  bodyState?: Record<string, unknown>;
  wardrobeProfile?: Record<string, unknown>;
  speechProfile?: Record<string, unknown>;
  continuityProfile?: Record<string, unknown>;
  characterFingerprint?: Record<string, unknown> | null;
  visualRefUrls: string[];
  entityKind?: string | null;
  speciesLabel?: string | null;
  dialogueMode?: string | null;
  recurrencePolicy?: string | null;
};

export async function queueAutoLoraTrainingIfEligible(input: {
  projectId: string;
  characters: LoadedCharacterForPipeline[];
  loraAttachments: LoadedLoraAttachment[];
}) {
  const readyByCharId = new Set<string>();
  const trainingByCharId = new Set<string>();

  for (const att of input.loraAttachments) {
    if (!att.characterId) continue;
    const meta = att.lora.weightsMeta as Record<string, unknown>;
    const hasWeights = typeof meta.loraUrl === "string" && meta.loraUrl.length > 0;
    if (att.enabled && att.lora.status === "active" && hasWeights) {
      readyByCharId.add(att.characterId);
      continue;
    }
    if (att.lora.status === "training" || att.lora.status === "queued") {
      trainingByCharId.add(att.characterId);
    }
  }

  const candidates = input.characters
    .filter((c) => c.visualRefUrls.length >= 3)
    .filter((c) => !readyByCharId.has(c.id))
    .filter((c) => !trainingByCharId.has(c.id))
    .slice(0, 2);

  if (candidates.length === 0) return 0;

  for (const candidate of candidates) {
    const triggerWord = buildTriggerWord(candidate.name, input.projectId);
    const seedRefs = candidate.visualRefUrls.slice(0, 20);
    const lora = await prisma.loraModel.create({
      data: {
        projectId: input.projectId,
        provider: "fal",
        externalId: triggerWord,
        name: `LoRA ${candidate.name}`,
        status: "training",
        weightsMeta: {
          autoQueued: true,
          triggerWord,
          characterId: candidate.id,
          imageCount: seedRefs.length,
          queuedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    await prisma.loraAttachment.create({
      data: {
        loraId: lora.id,
        projectId: input.projectId,
        characterId: candidate.id,
        weight: 1,
        enabled: false,
      },
    });

    console.log(`[auto-lora] queued character=${candidate.name} refs=${seedRefs.length}`);

    void (async () => {
      const result = await trainCharacterLora({
        prisma,
        projectId: input.projectId,
        characterId: candidate.id,
        characterName: candidate.name,
        triggerWord,
        imageUrls: seedRefs,
        imageTypes: seedRefs.map(() => "generated_primary"),
        steps: 300,
      });
      if (!result.ok) {
        await prisma.loraModel.update({
          where: { id: lora.id },
          data: {
            status: "error",
            weightsMeta: {
              autoQueued: true,
              triggerWord,
              characterId: candidate.id,
              imageCount: seedRefs.length,
              error: result.error ?? "training_failed",
              readiness: result.readiness ?? null,
              failedAt: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
        console.error(`[auto-lora] failed character=${candidate.name} error=${result.error ?? "unknown"}`);
        return;
      }

      await prisma.loraModel.update({
        where: { id: lora.id },
        data: {
          status: "active",
          weightsMeta: {
            autoQueued: true,
            triggerWord,
            characterId: candidate.id,
            imageCount: seedRefs.length,
            loraUrl: result.loraUrl,
            configUrl: result.configUrl ?? null,
            requestId: result.requestId ?? null,
            jobId: result.jobId ?? null,
            previewImages: result.previewImages ?? [],
            trainingAssetId: result.trainingAssetId ?? null,
            readiness: result.readiness ?? null,
            trainedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      await prisma.loraAttachment.updateMany({
        where: { loraId: lora.id, characterId: candidate.id, projectId: input.projectId },
        data: { enabled: true, weight: 1 },
      });
      console.log(`[auto-lora] ready character=${candidate.name}`);
    })().catch((error) => {
      const message = error instanceof Error ? error.message : "auto_lora_background_error";
      console.error(`[auto-lora] background crash character=${candidate.name} error=${message}`);
    });
  }

  return candidates.length;
}
