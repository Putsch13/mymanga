import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { Prisma } from "@manga-ai-studio/db";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedCharacter } from "@/lib/ownership";
import { signSupabaseUrlIfNeeded } from "@/lib/images/sign-supabase-url";
import { toProxiedServerUrl } from "@/lib/images/proxy-url.server";
import {
  characterEditSchema,
  type CharacterEditInput,
  type CharacterVisualRefPatch,
} from "@/lib/schemas/character-edit.schema";
import { isStableImageUrl } from "@/lib/images/assert-stable-image-url";
import { checkStableCanonicalAsset } from "@/lib/images/assert-stable-canonical-asset";
import { logCanonAudit } from "@/lib/canon/canon-audit-log";
import { buildManualRefMetadata, resolveIsPrimary } from "@/lib/character/manual-visual-ref-policy";
import { computeCanonPackScore } from "@/lib/characters/compute-canon-pack-score";

type Ctx = { params: Promise<{ characterId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { characterId } = await ctx.params;
  const character = await getOwnedCharacter(user.id, characterId);
  if (!character) return notFound();

  // P0.4 — signature Supabase + proxy via helper central (allowlist stricte,
  // HMAC si configuré). Plus de construction manuelle d'URL proxy.
  await Promise.all(
    (character.visualRefs ?? []).map(async (ref) => {
      const signed = (await signSupabaseUrlIfNeeded(ref.imageUrl)) ?? ref.imageUrl;
      ref.imageUrl = toProxiedServerUrl(signed) ?? signed;
    }),
  );

  return NextResponse.json({ character });
}

function buildCharacterUpdateData(body: CharacterEditInput): Prisma.CharacterUpdateInput {
  const data: Prisma.CharacterUpdateInput = {};
  // Champs scalaires simples — inclus uniquement si présent dans le payload.
  if (body.name !== undefined) data.name = body.name;
  if (body.roleType !== undefined) data.roleType = body.roleType;
  if (body.age !== undefined) data.age = body.age;
  if (body.adultVerified !== undefined) data.adultVerified = body.adultVerified;
  if (body.gender !== undefined) data.gender = body.gender;
  if (body.pronouns !== undefined) data.pronouns = body.pronouns;
  if (body.biography !== undefined) data.biography = body.biography;
  if (body.objective !== undefined) data.objective = body.objective;
  if (body.fear !== undefined) data.fear = body.fear;
  if (body.trauma !== undefined) data.trauma = body.trauma;
  if (body.status !== undefined) data.status = body.status;
  if (body.emotionalState !== undefined) data.emotionalState = body.emotionalState;
  if (body.canonLocked !== undefined) data.canonLocked = body.canonLocked;
  if (body.appearance !== undefined) data.appearance = body.appearance;
  if (body.hairColor !== undefined) data.hairColor = body.hairColor;
  if (body.eyeColor !== undefined) data.eyeColor = body.eyeColor;
  if (body.outfitDefault !== undefined) data.outfitDefault = body.outfitDefault;

  // JSON-ish
  if (body.personality !== undefined) data.personality = body.personality as Prisma.InputJsonValue;
  if (body.traits !== undefined) data.traits = body.traits;
  if (body.flaws !== undefined) data.flaws = body.flaws;
  if (body.secrets !== undefined) data.secrets = body.secrets;
  if (body.bodyProfile !== undefined) data.bodyProfile = body.bodyProfile as Prisma.InputJsonValue;
  if (body.visualProfile !== undefined) data.visualProfile = body.visualProfile as Prisma.InputJsonValue;
  if (body.bodyState !== undefined) data.bodyState = body.bodyState as Prisma.InputJsonValue;
  if (body.wardrobeProfile !== undefined) data.wardrobeProfile = body.wardrobeProfile as Prisma.InputJsonValue;
  if (body.speechProfile !== undefined) data.speechProfile = body.speechProfile as Prisma.InputJsonValue;
  if (body.continuityProfile !== undefined) data.continuityProfile = body.continuityProfile as Prisma.InputJsonValue;
  if (body.adultContentProfile !== undefined) data.adultContentProfile = body.adultContentProfile as Prisma.InputJsonValue;

  // DialogueVoiceProfile
  if (body.voiceRegister !== undefined) data.voiceRegister = body.voiceRegister;
  if (body.voiceSentenceLength !== undefined) data.voiceSentenceLength = body.voiceSentenceLength;
  if (body.voiceVocabularyStyle !== undefined) data.voiceVocabularyStyle = body.voiceVocabularyStyle;
  if (body.voiceEmotionalLeak !== undefined) data.voiceEmotionalLeak = body.voiceEmotionalLeak;
  if (body.voiceSarcasmLevel !== undefined) data.voiceSarcasmLevel = body.voiceSarcasmLevel;
  if (body.voiceAggressionLevel !== undefined) data.voiceAggressionLevel = body.voiceAggressionLevel;
  if (body.voiceSilenceFrequency !== undefined) data.voiceSilenceFrequency = body.voiceSilenceFrequency;
  if (body.voiceFavoriteExpressions !== undefined) data.voiceFavoriteExpressions = body.voiceFavoriteExpressions;
  if (body.voiceForbiddenExpressions !== undefined) data.voiceForbiddenExpressions = body.voiceForbiddenExpressions;
  if (body.voiceForbiddenPatterns !== undefined) data.voiceForbiddenPatterns = body.voiceForbiddenPatterns;
  if (body.voiceThreatenStyle !== undefined) data.voiceThreatenStyle = body.voiceThreatenStyle;
  if (body.voiceLieStyle !== undefined) data.voiceLieStyle = body.voiceLieStyle;
  if (body.voiceSeductionStyle !== undefined) data.voiceSeductionStyle = body.voiceSeductionStyle;
  if (body.voiceInnerMonologueStyle !== undefined) data.voiceInnerMonologueStyle = body.voiceInnerMonologueStyle;
  if (body.voiceExamplesCanonical !== undefined) {
    data.voiceExamplesCanonical = body.voiceExamplesCanonical as unknown as Prisma.InputJsonValue;
  }
  if (body.voiceSpeechRules !== undefined) data.voiceSpeechRules = body.voiceSpeechRules;

  // StableIdentity DNAs
  if (body.stableVisualDNA !== undefined) data.stableVisualDNA = body.stableVisualDNA as Prisma.InputJsonValue;
  if (body.stableSpeechDNA !== undefined) data.stableSpeechDNA = body.stableSpeechDNA as Prisma.InputJsonValue;
  if (body.stablePsycheDNA !== undefined) data.stablePsycheDNA = body.stablePsycheDNA as Prisma.InputJsonValue;

  // ChangePolicy
  if (body.canChangeHair !== undefined) data.canChangeHair = body.canChangeHair;
  if (body.canChangeOutfitFreely !== undefined) data.canChangeOutfitFreely = body.canChangeOutfitFreely;
  if (body.canChangeVisibleScars !== undefined) data.canChangeVisibleScars = body.canChangeVisibleScars;
  if (body.canChangeSpeechRegister !== undefined) data.canChangeSpeechRegister = body.canChangeSpeechRegister;
  if (body.requiresCanonApprovalFor !== undefined) data.requiresCanonApprovalFor = body.requiresCanonApprovalFor;

  return data;
}

/**
 * P0.6 — Diff non-destructif des visualRefs :
 * - ref avec `id` présent dans la DB → update (imageUrl/type/promptSnapshot/isPrimary)
 * - ref sans `id` → create
 * - ref existante absente du payload → archivedAt = now (soft-delete)
 *
 * Immuables via PATCH : `mediaAssetId`, `sourceVisualLockId`. Les écritures
 * d'URLs nouvelles sont filtrées par isStableImageUrl (cf. P0.3).
 *
 * P0.3 (sprint 5) — Politique "Option B traçable" pour les visual refs
 * manuelles :
 *   - une ref manuelle (sans `mediaAssetId`) est TOUJOURS marquée
 *     `metadata.source = "manual_import"`, `metadata.isCanonical = false`,
 *     `metadata.assetProvenance = "external_stable_url"`.
 *   - `isPrimary` est forcé à `false` sur toute ref manuelle (une ref
 *     canonique primary ne peut venir QUE de `generate-visual`, qui crée un
 *     `mediaAsset` associé).
 *   - Seules les refs déjà liées à un `mediaAssetId` (créées par
 *     `generate-visual`) peuvent conserver `isPrimary=true`.
 *   - Une URL non stable (signée, FAL/BFL temporaire, data-URL, ...) est
 *     systématiquement refusée par `checkStableCanonicalAsset`.
 *
 * Cette garde évite que l'UI PATCH puisse promouvoir une URL externe en ref
 * canonique primary sans provenance asset.
 */

async function applyVisualRefsDiff(
  tx: Prisma.TransactionClient,
  characterId: string,
  payload: CharacterVisualRefPatch[],
  userId: string,
): Promise<void> {
  const existing = await tx.characterVisualRef.findMany({ where: { characterId } });
  const existingById = new Map(existing.map((r) => [r.id, r]));

  const keptIds = new Set<string>();

  for (const ref of payload) {
    // P0.3 — le guard central `checkStableCanonicalAsset` est la source de
    // vérité pour toute écriture canonique. Ici on n'a pas le storageProvider
    // côté payload, donc l'assertion se limite à l'URL, mais elle reste
    // homogène avec le reste du codebase (même message, même raison).
    const guard = checkStableCanonicalAsset({ url: ref.imageUrl });
    if (!guard.ok) {
      console.warn(
        `[character-patch] ignoring unstable imageUrl in visualRefs type=${ref.type} id=${ref.id ?? "(new)"} reason=${guard.reason} detail=${guard.detail}`,
      );
      continue;
    }
    if (!isStableImageUrl(ref.imageUrl)) continue;
    if (ref.id && existingById.has(ref.id)) {
      const prev = existingById.get(ref.id)!;
      const nextIsPrimary = resolveIsPrimary({
        requestedIsPrimary: ref.isPrimary,
        prevMediaAssetId: prev.mediaAssetId,
      });
      keptIds.add(ref.id);
      await tx.characterVisualRef.update({
        where: { id: ref.id },
        data: {
          type: ref.type,
          imageUrl: ref.imageUrl,
          promptSnapshot: ref.promptSnapshot ?? null,
          isPrimary: nextIsPrimary,
          archivedAt: null,
        },
      });
    } else {
      // Création manuelle : pas de mediaAssetId, isPrimary forcé false,
      // metadata de provenance obligatoire.
      await tx.characterVisualRef.create({
        data: {
          characterId,
          type: ref.type,
          imageUrl: ref.imageUrl,
          promptSnapshot: ref.promptSnapshot ?? null,
          isPrimary: false,
          metadata: buildManualRefMetadata(userId) as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  const toArchive = existing
    .filter((r) => !r.archivedAt && !keptIds.has(r.id))
    .map((r) => r.id);

  if (toArchive.length > 0) {
    await tx.characterVisualRef.updateMany({
      where: { id: { in: toArchive } },
      data: { archivedAt: new Date() },
    });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { characterId } = await ctx.params;
  const existing = await getOwnedCharacter(user.id, characterId);
  if (!existing) return notFound();

  let body: CharacterEditInput;
  try {
    body = characterEditSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          error: "character_patch_invalid",
          details: err.issues.map((i) => ({ path: i.path, code: i.code, message: i.message })),
        },
        { status: 422 },
      );
    }
    throw err;
  }

  const data = buildCharacterUpdateData(body);
  const changedKeys = Object.keys(data);

  const character = await prisma.$transaction(async (tx) => {
    const updated = await tx.character.update({
      where: { id: characterId },
      data,
    });

    if (body.visualRefs) {
      await applyVisualRefsDiff(tx, characterId, body.visualRefs, user.id);
    }

    const refreshed = await tx.character.findUniqueOrThrow({
      where: { id: updated.id },
      include: {
        canonPack: { include: { assets: true } },
        visualRefs: {
          where: { archivedAt: null },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    // P0 fix : recalculer + persister `completenessScore` après chaque PATCH.
    // Avant ce fix la colonne restait à 0 par défaut → le readiness affichait
    // toujours "score 0%" même quand toutes les fiches étaient remplies.
    const score = computeCanonPackScore({
      name: refreshed.name,
      roleType: refreshed.roleType,
      gender: refreshed.gender,
      biography: refreshed.biography,
      objective: refreshed.objective,
      appearance: refreshed.appearance,
      hairColor: refreshed.hairColor,
      eyeColor: refreshed.eyeColor,
      outfitDefault: refreshed.outfitDefault,
      voiceRegister: refreshed.voiceRegister,
      voiceVocabularyStyle: refreshed.voiceVocabularyStyle,
      stableVisualDNA: refreshed.stableVisualDNA,
      stableSpeechDNA: refreshed.stableSpeechDNA,
      stablePsycheDNA: refreshed.stablePsycheDNA,
      activeVisualRefCount: refreshed.visualRefs.length,
    });

    if (refreshed.canonPack) {
      if (refreshed.canonPack.completenessScore !== score.score) {
        await tx.characterCanonPack.update({
          where: { id: refreshed.canonPack.id },
          data: { completenessScore: score.score },
        });
        refreshed.canonPack.completenessScore = score.score;
      }
    } else {
      // Crée le pack si absent (cas des persos plus anciens).
      const created = await tx.characterCanonPack.create({
        data: {
          characterId: refreshed.id,
          completenessScore: score.score,
          forbiddenVisualDrift: [],
        },
        include: { assets: true },
      });
      refreshed.canonPack = created;
    }

    return refreshed;
  });

  // P4.4 : audit trail (log structuré) — seulement si un champ canon a bougé.
  if (changedKeys.length > 0 || body.visualRefs) {
    logCanonAudit({
      kind: "character_canon_changed",
      characterId,
      userId: user.id,
      changedKeys: body.visualRefs ? [...changedKeys, "visualRefs"] : changedKeys,
      requiresApproval: Array.isArray(body.requiresCanonApprovalFor)
        ? body.requiresCanonApprovalFor
        : undefined,
    });
  }

  return NextResponse.json({ character });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { characterId } = await ctx.params;
  const existing = await getOwnedCharacter(user.id, characterId);
  if (!existing) return notFound();

  await prisma.character.delete({ where: { id: characterId } });
  return NextResponse.json({ ok: true });
}
