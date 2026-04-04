import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { trackServerEvent } from "@/lib/analytics";
import { slugify } from "@/lib/slug";

type Ctx = { params: Promise<{ id: string }> };

const createSchema = z.object({
  name: z.string().min(1),
  roleType: z.string().optional().nullable(),
  biography: z.string().optional().nullable(),
  age: z.number().int().optional().nullable(),
  adultVerified: z.boolean().optional().default(false),
  gender: z.enum(["male", "female"]).optional().nullable(),
  pronouns: z.string().optional().nullable(),
  objective: z.string().optional().nullable(),
  fear: z.string().optional().nullable(),
  trauma: z.string().optional().nullable(),
  emotionalState: z.string().optional().nullable(),
  traits: z.array(z.string()).optional().default([]),
  flaws: z.array(z.string()).optional().default([]),
  secrets: z.array(z.string()).optional().default([]),
  appearance: z.string().optional().nullable(),
  hairColor: z.string().optional().nullable(),
  eyeColor: z.string().optional().nullable(),
  outfitDefault: z.string().optional().nullable(),
  // Profils avancés (LOT 2)
  visualProfile: z.record(z.unknown()).optional(),
  bodyState: z.record(z.unknown()).optional(),
  wardrobeProfile: z.record(z.unknown()).optional(),
  speechProfile: z.record(z.unknown()).optional(),
  continuityProfile: z.record(z.unknown()).optional(),
  adultContentProfile: z.record(z.unknown()).optional(),
});

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!project) return notFound();
  const characters = await prisma.character.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: { canonPack: true },
  });
  return NextResponse.json({ characters });
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!project) return notFound();
  const body = createSchema.parse(await req.json());
  const base = slugify(body.name);
  let slug = base;
  let n = 0;
  while (await prisma.character.findUnique({ where: { projectId_slug: { projectId, slug } } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  const character = await prisma.character.create({
    data: {
      projectId,
      name: body.name,
      slug,
      roleType: body.roleType,
      biography: body.biography,
      age: body.age,
      adultVerified: body.adultVerified,
      gender: body.gender ?? null,
      pronouns: body.pronouns,
      objective: body.objective,
      fear: body.fear,
      trauma: body.trauma,
      emotionalState: body.emotionalState,
      traits: body.traits,
      flaws: body.flaws,
      secrets: body.secrets,
      appearance: body.appearance ?? null,
      hairColor: body.hairColor ?? null,
      eyeColor: body.eyeColor ?? null,
      outfitDefault: body.outfitDefault ?? null,
      ...(body.visualProfile ? { visualProfile: body.visualProfile as import("@manga-ai-studio/db").Prisma.InputJsonValue } : {}),
      ...(body.bodyState ? { bodyState: body.bodyState as import("@manga-ai-studio/db").Prisma.InputJsonValue } : {}),
      ...(body.wardrobeProfile ? { wardrobeProfile: body.wardrobeProfile as import("@manga-ai-studio/db").Prisma.InputJsonValue } : {}),
      ...(body.speechProfile ? { speechProfile: body.speechProfile as import("@manga-ai-studio/db").Prisma.InputJsonValue } : {}),
      ...(body.continuityProfile ? { continuityProfile: body.continuityProfile as import("@manga-ai-studio/db").Prisma.InputJsonValue } : {}),
      ...(body.adultContentProfile ? { adultContentProfile: body.adultContentProfile as import("@manga-ai-studio/db").Prisma.InputJsonValue } : {}),
      canonPack: {
        create: {
          forbiddenVisualDrift: [],
        },
      },
    },
    include: { canonPack: true },
  });
  await trackServerEvent("character_created", {
    userId: user.id,
    projectId,
    characterId: character.id,
  });
  return NextResponse.json({ character });
}
