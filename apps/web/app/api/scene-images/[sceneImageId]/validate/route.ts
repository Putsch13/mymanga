import { NextResponse } from "next/server";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized, validationError } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sceneImageId: string }> };

/**
 * POST /api/scene-images/:id/validate
 *
 * Marque une case comme validée par l'utilisateur (userValidatedAt = now).
 * Les cases validées sont protégées contre les régénérations en masse du chapitre
 * (voir narrative-pass.ts ligne 1892 : `if (existingImage?.userValidatedAt) skip`).
 *
 * Body : { validated?: boolean } (défaut true). Passer false permet d'annuler la validation.
 */
export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { sceneImageId } = await ctx.params;

  const img = await prisma.sceneImage.findFirst({
    where: { id: sceneImageId, scene: { chapter: { project: { userId: user.id } } } },
    select: { id: true, status: true, userValidatedAt: true },
  });
  if (!img) return notFound();

  let validated = true;
  try {
    const body = await req.clone().text();
    if (body && body.trim().length > 0) {
      const parsed = JSON.parse(body) as { validated?: boolean };
      if (typeof parsed.validated === "boolean") validated = parsed.validated;
    }
  } catch {
    // body optionnel — on reste sur validated=true
  }

  if (validated && img.status !== "completed") {
    return validationError("Seules les cases complétées peuvent être validées.");
  }

  const updated = await prisma.sceneImage.update({
    where: { id: img.id },
    data: { userValidatedAt: validated ? new Date() : null },
    select: { id: true, userValidatedAt: true },
  });

  return NextResponse.json({ ok: true, sceneImageId: updated.id, userValidatedAt: updated.userValidatedAt });
}
