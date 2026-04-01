import { NextResponse } from "next/server";
import { z } from "zod";
import { ContentIntensityLayer, ContentRating, prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { unauthorized } from "@/lib/api-response";
import { slugify } from "@/lib/slug";
import { trackServerEvent } from "@/lib/analytics";

const createSchema = z.object({
  title: z.string().min(1),
  pitch: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  primaryGenre: z.string().optional().nullable(),
  subGenres: z.array(z.string()).optional().default([]),
  tone: z.string().optional().nullable(),
  format: z.string().optional().nullable(),
  visualStyle: z.string().optional().nullable(),
  contentRating: z.nativeEnum(ContentRating).optional().default("GENERAL"),
  intensityLayer: z.nativeEnum(ContentIntensityLayer).optional().default("GENERAL_SAFE"),
  settings: z
    .object({
      violenceLevel: z.number().int().min(0).max(100).optional(),
      romanceLevel: z.number().int().min(0).max(100).optional(),
      sensualityLevel: z.number().int().min(0).max(100).optional(),
      darknessLevel: z.number().int().min(0).max(100).optional(),
      mysteryLevel: z.number().int().min(0).max(100).optional(),
      realismLevel: z.number().int().min(0).max(100).optional(),
      pacingLevel: z.number().int().min(0).max(100).optional(),
      dialogueDensity: z.number().int().min(0).max(100).optional(),
      maxTokensPerJob: z.number().int().min(100).max(50000).optional(),
      canonStrictness: z.number().int().min(0).max(100).optional(),
    })
    .optional(),
});

export async function GET() {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: { settings: true, stylePacks: { take: 1, orderBy: { version: "desc" } } },
  });
  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const body = createSchema.parse(await req.json());
  const base = slugify(body.title);
  let slug = base;
  let n = 0;
  while (await prisma.project.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      title: body.title,
      slug,
      pitch: body.pitch,
      description: body.description,
      primaryGenre: body.primaryGenre,
      subGenres: body.subGenres,
      tone: body.tone,
      format: body.format,
      visualStyle: body.visualStyle,
      contentRating: body.contentRating,
      intensityLayer: body.intensityLayer,
      settings: { create: body.settings ?? {} },
      stylePacks: {
        create: {
          version: 1,
        },
      },
    },
    include: { stylePacks: true, settings: true },
  });
  await trackServerEvent("project_created", {
    userId: user.id,
    projectId: project.id,
    contentRating: project.contentRating,
  });
  return NextResponse.json({ project });
}
