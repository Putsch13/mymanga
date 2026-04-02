import { NextResponse } from "next/server";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { forbidden, unauthorized } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAppUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();

  const env = {
    nodeEnv: process.env.NODE_ENV ?? null,
    authDisabled: process.env.AUTH_DISABLED === "true",
    hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasSupabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    storageBucket: process.env.STORAGE_BUCKET ?? null,
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasFalKey: Boolean(process.env.FAL_KEY),
    hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
    hasInngestEventKey: Boolean(process.env.INNGEST_EVENT_KEY),
    hasInngestSigningKey: Boolean(process.env.INNGEST_SIGNING_KEY),
    hasBfl: Boolean(process.env.BFL_API_KEY),
    hasRunware: Boolean(process.env.RUNWARE_API_KEY),
    hasStability: Boolean(process.env.STABILITY_API_KEY),
  };

  const recentJobs = await prisma.job.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, type: true, status: true, createdAt: true, startedAt: true, finishedAt: true, error: true },
  });

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, role: user.role },
    env,
    recentJobs,
  });
}

