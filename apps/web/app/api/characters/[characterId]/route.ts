import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@manga-ai-studio/db";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedCharacter } from "@/lib/ownership";
import { signSupabaseUrlIfNeeded } from "@/lib/images/sign-supabase-url";

type Ctx = { params: Promise<{ characterId: string }> };

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  roleType: z.string().optional().nullable(),
  age: z.number().int().min(0).max(500).optional().nullable(),
  adultVerified: z.boolean().optional(),
  gender: z.enum(["male", "female"]).optional().nullable(),
  pronouns: z.string().optional().nullable(),
  biography: z.string().optional().nullable(),
  objective: z.string().optional().nullable(),
  fear: z.string().optional().nullable(),
  trauma: z.string().optional().nullable(),
  personality: z.unknown().optional(),
  traits: z.array(z.string()).optional(),
  flaws: z.array(z.string()).optional(),
  secrets: z.array(z.string()).optional(),
  appearance: z.string().optional().nullable(),
  hairColor: z.string().optional().nullable(),
  eyeColor: z.string().optional().nullable(),
  outfitDefault: z.string().optional().nullable(),
  bodyProfile: z.unknown().optional(),
  // Profils avancés (LOT 2)
  visualProfile: z.record(z.unknown()).optional(),
  bodyState: z.record(z.unknown()).optional(),
  wardrobeProfile: z.record(z.unknown()).optional(),
  speechProfile: z.record(z.unknown()).optional(),
  continuityProfile: z.record(z.unknown()).optional(),
  adultContentProfile: z.record(z.unknown()).optional(),
  status: z.string().optional(),
  emotionalState: z.string().optional().nullable(),
  canonLocked: z.boolean().optional(),
  visualRefs: z
    .array(
      z.object({
        id: z.string().optional(),
        type: z.string(),
        imageUrl: z.string().url(),
        promptSnapshot: z.string().optional().nullable(),
        isPrimary: z.boolean().default(false),
      }),
    )
    .optional(),
});

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

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { characterId } = await ctx.params;
  const existing = await getOwnedCharacter(user.id, characterId);
  if (!existing) return notFound();

  const body = patchSchema.parse(await req.json());

  const data: Prisma.CharacterUpdateInput = {
    name: body.name,
    roleType: body.roleType,
    age: body.age,
    adultVerified: body.adultVerified,
    ...(body.gender !== undefined ? { gender: body.gender } : {}),
    pronouns: body.pronouns,
    biography: body.biography,
    objective: body.objective,
    fear: body.fear,
    trauma: body.trauma,
    status: body.status,
    emotionalState: body.emotionalState,
    canonLocked: body.canonLocked,
    // Champs String? (nouveau schéma)
    ...(body.appearance !== undefined ? { appearance: body.appearance } : {}),
    ...(body.hairColor !== undefined ? { hairColor: body.hairColor } : {}),
    ...(body.eyeColor !== undefined ? { eyeColor: body.eyeColor } : {}),
    ...(body.outfitDefault !== undefined ? { outfitDefault: body.outfitDefault } : {}),
    ...(body.personality !== undefined ? { personality: body.personality as Prisma.InputJsonValue } : {}),
    ...(body.traits !== undefined ? { traits: body.traits } : {}),
    ...(body.flaws !== undefined ? { flaws: body.flaws } : {}),
    ...(body.secrets !== undefined ? { secrets: body.secrets } : {}),
    ...(body.bodyProfile !== undefined ? { bodyProfile: body.bodyProfile as Prisma.InputJsonValue } : {}),
    // Profils avancés (LOT 2)
    ...(body.visualProfile !== undefined ? { visualProfile: body.visualProfile as Prisma.InputJsonValue } : {}),
    ...(body.bodyState !== undefined ? { bodyState: body.bodyState as Prisma.InputJsonValue } : {}),
    ...(body.wardrobeProfile !== undefined ? { wardrobeProfile: body.wardrobeProfile as Prisma.InputJsonValue } : {}),
    ...(body.speechProfile !== undefined ? { speechProfile: body.speechProfile as Prisma.InputJsonValue } : {}),
    ...(body.continuityProfile !== undefined ? { continuityProfile: body.continuityProfile as Prisma.InputJsonValue } : {}),
    ...(body.adultContentProfile !== undefined ? { adultContentProfile: body.adultContentProfile as Prisma.InputJsonValue } : {}),
  };

  const character = await prisma.$transaction(async (tx) => {
    const updated = await tx.character.update({
      where: { id: characterId },
      data,
    });

    if (body.visualRefs) {
      await tx.characterVisualRef.deleteMany({ where: { characterId } });
      if (body.visualRefs.length > 0) {
        await tx.characterVisualRef.createMany({
          data: body.visualRefs.map((ref) => ({
            characterId,
            type: ref.type,
            imageUrl: ref.imageUrl,
            promptSnapshot: ref.promptSnapshot ?? null,
            isPrimary: ref.isPrimary,
          })),
        });
      }
    }

    return tx.character.findUniqueOrThrow({
      where: { id: updated.id },
      include: {
        canonPack: { include: { assets: true } },
        visualRefs: { orderBy: { createdAt: "desc" } },
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
