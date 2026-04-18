import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { Prisma } from "@manga-ai-studio/db";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedCharacter } from "@/lib/ownership";
import { signSupabaseUrlIfNeeded } from "@/lib/images/sign-supabase-url";
import {
  characterEditSchema,
  type CharacterEditInput,
  type CharacterVisualRefPatch,
} from "@/lib/schemas/character-edit.schema";
import { isStableImageUrl } from "@/lib/images/assert-stable-image-url";

type Ctx = { params: Promise<{ characterId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { characterId } = await ctx.params;
  const character = await getOwnedCharacter(user.id, characterId);
  if (!character) return notFound();

  // Signer les URLs Supabase (bucket privé) puis proxifier (même domaine, évite CORS/ITP Safari)
  function toProxied(url: string | null | undefined): string | null {
    if (!url) return null;
    if (url.startsWith("/api/images/proxy")) return url;
    try {
      const parsed = new URL(url);
      const isExternal = ["supabase.co", "v3b.fal.media", "fal.media", "cdn.fal.ai"].some(
        (h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`)
      );
      if (isExternal) return `/api/images/proxy?url=${encodeURIComponent(url)}`;
    } catch { /* ignore */ }
    return url;
  }

  await Promise.all(
    (character.visualRefs ?? []).map(async (ref) => {
      const signed = (await signSupabaseUrlIfNeeded(ref.imageUrl)) ?? ref.imageUrl;
      ref.imageUrl = toProxied(signed) ?? signed;
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
 */
async function applyVisualRefsDiff(
  tx: Prisma.TransactionClient,
  characterId: string,
  payload: CharacterVisualRefPatch[],
): Promise<void> {
  const existing = await tx.characterVisualRef.findMany({ where: { characterId } });
  const existingById = new Map(existing.map((r) => [r.id, r]));

  const keptIds = new Set<string>();

  for (const ref of payload) {
    if (!isStableImageUrl(ref.imageUrl)) {
      console.warn(
        `[character-patch] ignoring unstable imageUrl in visualRefs type=${ref.type} id=${ref.id ?? "(new)"}`,
      );
      continue;
    }
    if (ref.id && existingById.has(ref.id)) {
      keptIds.add(ref.id);
      await tx.characterVisualRef.update({
        where: { id: ref.id },
        data: {
          type: ref.type,
          imageUrl: ref.imageUrl,
          promptSnapshot: ref.promptSnapshot ?? null,
          isPrimary: ref.isPrimary,
          archivedAt: null,
        },
      });
    } else {
      await tx.characterVisualRef.create({
        data: {
          characterId,
          type: ref.type,
          imageUrl: ref.imageUrl,
          promptSnapshot: ref.promptSnapshot ?? null,
          isPrimary: ref.isPrimary,
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

  const character = await prisma.$transaction(async (tx) => {
    const updated = await tx.character.update({
      where: { id: characterId },
      data,
    });

    if (body.visualRefs) {
      await applyVisualRefsDiff(tx, characterId, body.visualRefs);
    }

    return tx.character.findUniqueOrThrow({
      where: { id: updated.id },
      include: {
        canonPack: { include: { assets: true } },
        visualRefs: {
          where: { archivedAt: null },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  });

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
