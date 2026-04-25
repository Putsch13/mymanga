import { NextResponse } from "next/server";
import { z } from "zod";
import { saveChapterVisualContractUi } from "@manga-ai-studio/workflow";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized, badRequest } from "@/lib/api-response";
import { getOwnedChapter } from "@/lib/ownership";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

const patchSchema = z.object({
  parasitePolicy: z.enum(["auto_strip", "keep_all"]).optional(),
  preLaunchAcknowledged: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId, chapterId } = await ctx.params;
  const chapter = await getOwnedChapter(user.id, projectId, chapterId);
  if (!chapter) return notFound();

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return badRequest("Corps JSON invalide.");
  }
  if (parsed.data.parasitePolicy === undefined && parsed.data.preLaunchAcknowledged === undefined) {
    return badRequest("Fournis parasitePolicy et/ou preLaunchAcknowledged.");
  }

  const next = await saveChapterVisualContractUi(chapterId, parsed.data);
  return NextResponse.json({ ok: true, chapterVisualContractUi: next });
}
