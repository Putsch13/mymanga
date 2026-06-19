import { NextResponse } from "next/server";
import { buildPremiumPlanAuditForChapter } from "@/lib/premium-audit/build-premium-plan-audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { unauthorized } from "@/lib/api-response";

type Ctx = { params: Promise<{ chapterId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const { chapterId } = await ctx.params;
  const report = await buildPremiumPlanAuditForChapter(chapterId);
  if (!report) {
    return NextResponse.json({ error: "chapter_not_found" }, { status: 404 });
  }
  return NextResponse.json(report);
}
