import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@manga-ai-studio/db";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { signSupabaseUrlIfNeeded } from "@/lib/images/sign-supabase-url";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

const patchSchema = z.object({
  title: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  cliffhanger: z.string().optional().nullable(),
  userIntent: z.string().optional().nullable(),
  storyboard: z.unknown().optional(),
  script: z.unknown().optional(),
  outline: z.unknown().optional(),
  status: z.string().optional(),
});

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId, chapterId } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!project) return notFound();

  const [chapter, memorySnapshot, activeJob] = await Promise.all([
    prisma.chapter.findFirst({
      where: { id: chapterId, projectId },
      include: {
        scenes: {
          orderBy: { sceneNumber: "asc" },
          include: {
            images: {
              orderBy: { panelNumber: "asc" },
              select: {
                id: true,
                panelNumber: true,
                imageUrl: true,
                status: true,
              provider: true,
              model: true,
                prompt: true,
                metadata: true,
              },
            },
          },
        },
      },
    }),
    prisma.memorySnapshot.findFirst({
      where: { chapterId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.job.findFirst({
      where: { chapterId, status: { in: ["queued", "running"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, output: true, createdAt: true },
    }),
  ]);

  if (!chapter) return notFound();

  // Toutes les URLs externes passent par le proxy /api/images/proxy (même domaine).
  // Cela évite les problèmes CORS/ITP/Safari avec Supabase et les URLs FAL expirées.
  // Les URLs Supabase sont d'abord signées (accès bucket privé), puis proxifiées.
  function toProxied(url: string | null | undefined): string | null {
    if (!url) return null;
    // Déjà proxifiée
    if (url.startsWith("/api/images/proxy")) return url;
    try {
      const parsed = new URL(url);
      const externalHosts = [
        "v3b.fal.media", "fal.media", "cdn.fal.ai",
        "supabase.co",
      ];
      const isExternal = externalHosts.some(
        (h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`)
      );
      if (isExternal) {
        return `/api/images/proxy?url=${encodeURIComponent(url)}`;
      }
    } catch { /* ignore */ }
    return url;
  }

  let proxiedCount = 0;
  let signedCount = 0;
  await Promise.all(
    chapter.scenes.flatMap((scene) =>
      scene.images.map(async (img) => {
        const original = img.imageUrl;
        // Signer d'abord (pour les buckets Supabase privés)
        const signed = await signSupabaseUrlIfNeeded(img.imageUrl);
        if (signed !== original) signedCount++;
        // Puis proxifier (même domaine, évite CORS/ITP)
        const proxied = toProxied(signed ?? original);
        if (proxied && proxied !== (signed ?? original)) proxiedCount++;
        img.imageUrl = proxied ?? signed ?? original;
      }),
    ),
  );
  const totalImages = chapter.scenes.flatMap((s) => s.images).length;
  console.log(`[chapter-route] images=${totalImages} signed=${signedCount} proxied=${proxiedCount}`);

  // Statistiques images pour le reader
  const allImages = chapter.scenes.flatMap((s) => s.images);
  const imageStats = {
    total: allImages.length,
    completed: allImages.filter((i) => i.status === "completed" && i.imageUrl).length,
    failed: allImages.filter((i) => i.status === "failed" || i.status === "blocked").length,
    pending: allImages.filter((i) => i.status === "planned" || i.status === "pending").length,
  };

  return NextResponse.json({
    chapter,
    memorySnapshot,
    activeJob,
    imageStats,
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId, chapterId } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!project) return notFound();
  const existing = await prisma.chapter.findFirst({ where: { id: chapterId, projectId } });
  if (!existing) return notFound();
  const body = patchSchema.parse(await req.json());

  const data: Prisma.ChapterUpdateInput = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.summary !== undefined) data.summary = body.summary;
  if (body.cliffhanger !== undefined) data.cliffhanger = body.cliffhanger;
  if (body.userIntent !== undefined) data.userIntent = body.userIntent;
  if (body.status !== undefined) data.status = body.status;
  if (body.storyboard !== undefined) data.storyboard = body.storyboard as Prisma.InputJsonValue;
  if (body.script !== undefined) data.script = body.script as Prisma.InputJsonValue;
  if (body.outline !== undefined) data.outline = body.outline as Prisma.InputJsonValue;

  const chapter = await prisma.chapter.update({
    where: { id: chapterId },
    data,
  });
  return NextResponse.json({ chapter });
}
