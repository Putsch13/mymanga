import { NextResponse } from "next/server";
import { prisma } from "@manga-ai-studio/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnostics publics (sans secrets) pour debug Render/Supabase/Inngest.
 * Ne retourne que des booléens/strings non sensibles.
 */
export async function GET() {
  const isProd = process.env.NODE_ENV === "production";
  const hasFalKey = Boolean(process.env.FAL_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasInngestEventKey = Boolean(process.env.INNGEST_EVENT_KEY);
  const authDisabled = process.env.AUTH_DISABLED === "true";

  // En production : on expose uniquement un agrégat "ready/degraded/offline"
  // pour ne pas révéler la configuration interne.
  const env = isProd
    ? {
        authDisabled,
        hasFalKey,
        hasOpenAI,
        hasInngestEventKey,
        // Masquer les détails sensibles en prod
        imageStack: hasFalKey ? "ready" : "offline",
        textStack: hasOpenAI ? "ready" : "offline",
        queueStack: hasInngestEventKey ? "ready" : "sync-fallback",
      }
    : {
        nodeEnv: process.env.NODE_ENV ?? null,
        authDisabled,
        hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        hasSupabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
        hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
        hasFalKey,
        hasOpenAI,
        hasInngestEventKey,
        hasInngestSigningKey: Boolean(process.env.INNGEST_SIGNING_KEY),
        adminEmailsConfigured: Boolean((process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "").trim()),
      };

  let dbReachable: boolean | null = null;
  let dbHint: string | null = null;

  if (env.hasDatabaseUrl) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReachable = true;
    } catch (error) {
      dbReachable = false;
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : null;
      const message = typeof error === "object" && error && "message" in error ? String(error.message) : "";
      if (code === "P1001" || code === "P1002" || message.includes("Can't reach database")) {
        dbHint = "database_unreachable";
      } else if (message.toLowerCase().includes("column") || message.toLowerCase().includes("relation")) {
        dbHint = "schema_not_synced";
      } else {
        dbHint = code ?? "db_query_failed";
      }
    }
  }

  return NextResponse.json({ ok: true, env, checks: { dbReachable, dbHint } });
}

