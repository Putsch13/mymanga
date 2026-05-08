import { NextResponse } from "next/server";
import { buildPremiumPlanAuditForChapter } from "@/lib/premium-audit/build-premium-plan-audit";

type Ctx = { params: Promise<{ chapterId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { chapterId } = await ctx.params;
  const report = await buildPremiumPlanAuditForChapter(chapterId);
  if (!report) {
    return NextResponse.json({ error: "chapter_not_found" }, { status: 404 });
  }
  return NextResponse.json(report);
}
