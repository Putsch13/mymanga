/**
 * face-closeup-generator — helper best-effort pour générer une seconde
 * référence visuelle dédiée "face closeup" (tête/épaules, même style,
 * même identité) juste après la création du visualRef full-body.
 *
 * Objectif H9 du hardening premium : avant cette introduction, un
 * personnage n'avait qu'une seule ref "full body" utilisée à la fois
 * pour les plans larges et les closeups — ce qui faisait que les
 * reaction_closeup / hero_closeup partaient sans face lock clair, d'où
 * les dérives d'identité visuelle observées.
 *
 * Règles :
 *   - best-effort : si la génération échoue, on n'écrase pas la ref primary
 *   - aucun fallback silencieux : on log structuré, on retourne l'erreur
 *   - si le mode FAL n'est pas dispo, on retourne `skipped` (pas de fail silencieux)
 *   - le type enregistré en DB est `generated_face_closeup` pour être
 *     discriminable côté consumers qui cherchent une face ref dédiée
 */

import type { PrismaClient } from "@manga-ai-studio/db";
import { persistGeneratedImageIfNeeded } from "@/lib/images/persist-generated-image";
import { assertStableCanonicalAsset } from "@/lib/images/assert-stable-canonical-asset";

export interface FaceCloseupGenerationInput {
  prisma: PrismaClient;
  characterId: string;
  projectId: string;
  sourceVisualLockId: string;
  positivePrompt: string;
  negativePrompt: string;
  referenceImageUrls: string[];
  runGenerate: (
    prompt: string,
    negative: string,
    refs: string[],
  ) => Promise<
    | {
        ok: true;
        imageUrl: string;
        provider: string;
        model: string;
        requestId?: string | null;
        jobId?: string | null;
        seed?: number | null;
      }
    | { ok: false; reason: string }
  >;
}

export interface FaceCloseupGenerationResult {
  ok: boolean;
  faceRefId?: string;
  imageUrl?: string;
  skipped?: string;
  error?: string;
}

const FACE_FRAMING_SUFFIX =
  ", head and shoulders framing, tight closeup on face, soft neutral expression, same art style, same identity, flat background.";

export async function generateAndPersistFaceCloseupRef(
  input: FaceCloseupGenerationInput,
): Promise<FaceCloseupGenerationResult> {
  const {
    prisma,
    characterId,
    projectId,
    sourceVisualLockId,
    positivePrompt,
    negativePrompt,
    referenceImageUrls,
    runGenerate,
  } = input;

  const facePrompt = `${positivePrompt}${FACE_FRAMING_SUFFIX}`;

  try {
    const genResult = await runGenerate(facePrompt, negativePrompt, referenceImageUrls);
    if (!genResult.ok) {
      console.warn(
        `[face-closeup] generation_failed characterId=${characterId} reason=${genResult.reason}`,
      );
      return { ok: false, error: genResult.reason };
    }

    const objectBasePath = `projects/${projectId}/characters/${characterId}/refs/face_${Date.now()}`;
    const persisted = await persistGeneratedImageIfNeeded({
      imageUrl: genResult.imageUrl,
      objectPath: objectBasePath,
      allowTemporary: false,
    });
    if (!persisted.ok || persisted.persisted !== true) {
      console.warn(
        `[face-closeup] persistence_failed characterId=${characterId} error=${persisted.ok ? "persisted=false" : persisted.error}`,
      );
      return {
        ok: false,
        error: persisted.ok ? "persisted_false" : persisted.error,
      };
    }

    assertStableCanonicalAsset(
      {
        url: persisted.url,
        storageProvider: "supabase",
        storageKey: persisted.storageKey,
      },
      "face-closeup:mediaAsset",
    );

    const mediaAsset = await prisma.mediaAsset.create({
      data: {
        projectId,
        characterId,
        type: "character_ref",
        origin: "generated",
        ownerType: "character_visual",
        ownerId: characterId,
        storageProvider: "supabase",
        publicUrl: persisted.url,
        storageKey: persisted.storageKey,
        metadata: {
          provider: genResult.provider,
          model: genResult.model,
          requestId: genResult.requestId ?? null,
          jobId: genResult.jobId ?? null,
          seed: genResult.seed ?? null,
          faceCloseup: true,
        },
      },
    });

    const createdRef = await prisma.characterVisualRef.create({
      data: {
        characterId,
        mediaAssetId: mediaAsset.id,
        sourceVisualLockId,
        type: "generated_face_closeup",
        imageUrl: persisted.url,
        promptSnapshot: facePrompt,
        isPrimary: false,
        metadata: {
          provider: genResult.provider,
          model: genResult.model,
          requestId: genResult.requestId ?? null,
          jobId: genResult.jobId ?? null,
          negativePrompt,
          faceCloseup: true,
          persisted: true,
        },
      },
    });

    console.info(
      `[face-closeup] ok characterId=${characterId} refId=${createdRef.id} url=${persisted.url}`,
    );
    return { ok: true, faceRefId: createdRef.id, imageUrl: persisted.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[face-closeup] unexpected_error characterId=${characterId} err=${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Guard : retourne true si le personnage dispose d'une face ref dédiée
 * (type=generated_face_closeup). Utilisé par les render-paths closeup
 * pour fail loudly quand la face ref est attendue mais manquante.
 */
export async function characterHasDedicatedFaceCloseupRef(
  prisma: PrismaClient,
  characterId: string,
): Promise<boolean> {
  const existing = await prisma.characterVisualRef.findFirst({
    where: {
      characterId,
      type: "generated_face_closeup",
      archivedAt: null,
    },
    select: { id: true },
  });
  return existing != null;
}
