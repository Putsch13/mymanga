import { NextResponse } from "next/server";
import { z } from "zod";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedChapter } from "@/lib/ownership";
import { checkRateLimit } from "@/lib/rate-limit";
import { compileChapterIntent } from "@/lib/chapter-intent/compile-chapter-intent";

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

  const rawFromStudio =
    typeof body.rawUserIntent === "string" && body.rawUserIntent.trim().length > 0
      ? body.rawUserIntent.trim()
      : [
          body.shortPitch?.trim(),
          body.mustHappen?.trim(),
          body.mustNot?.trim(),
          body.wish?.trim(),
          body.endingType?.trim(),
        ].filter(Boolean).join("\n\n");

  if (rawFromStudio.length < 8) {
    return NextResponse.json(
      { error: "Décris ton intention en au moins une phrase (8 caractères minimum)." },
      { status: 400 },
    );
  }

  const contract = await compileChapterIntent({
    rawUserIntent: rawFromStudio,
    shortPitch: body.shortPitch,
    mustHappen: body.mustHappen,
    mustNot: body.mustNot,
    wish: body.wish,
    pacing: body.pacing,
    dialogueLevel: body.dialogueLevel,
    endingType: body.endingType,
  });

  return NextResponse.json({ contract, chapterId: chapter.id });
}
