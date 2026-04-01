import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { slugify } from "@/lib/slug";

type Ctx = { params: Promise<{ id: string }> };

const createSchema = z.object({
  name: z.string().min(1),
  roleType: z.string().optional(),
  biography: z.string().optional(),
  age: z.number().int().optional(),
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
      canonPack: {
        create: {
          forbiddenVisualDrift: [],
        },
      },
    },
    include: { canonPack: true },
  });
  return NextResponse.json({ character });
}
