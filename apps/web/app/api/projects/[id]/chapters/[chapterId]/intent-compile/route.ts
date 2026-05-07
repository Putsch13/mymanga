import { NextResponse } from "next/server";
import { z } from "zod";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedChapter } from "@/lib/ownership";
import { checkRateLimit } from "@/lib/rate-limit";
import { compileChapterIntentUsecase, UsecaseFailure } from "@/server/usecases";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

const bodySchema = z.object({
  rawUserIntent: z.string().optional(),
  shortPitch: z.string().optional(),
  mustHappen: z.string().optional(),
  mustNot: z.string().optional(),
  wish: z.string().optional(),
  pacing: z.enum(["slow", "balanced", "fast"]).optional(),
  dialogueLevel: z.enum(["low", "medium", "high"]).optional(),
  endingType: z.string().optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const rl = await checkRateLimit(user.id, "chapter-intent-compile");
  if (!rl.ok) {
    return NextResponse.json({ error: rl.message }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } });
  }

  const { id: projectId, chapterId } = await ctx.params;
  const chapter = await getOwnedChapter(user.id, projectId, chapterId);
  if (!chapter) return notFound();

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  try {
    const { contract, usedAi } = await compileChapterIntentUsecase.execute(body);
    return NextResponse.json({ contract, chapterId: chapter.id, usedAi });
  } catch (err) {
    if (err instanceof UsecaseFailure && err.code === "INTENT_RAW_TOO_SHORT") {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    throw err;
  }
}
