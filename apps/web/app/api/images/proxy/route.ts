/**
 * Proxy d'image côté serveur.
 * Permet d'afficher une image provider (FAL, BFL, Supabase privé) sans exposer
 * directement l'URL au client.
 *
 * Sécurité P2.3 :
 *   1. Allowlist HOSTS EXACTE (pas d'`endsWith(".supabase.co")` générique —
 *      uniquement le host Supabase du projet dérivé de
 *      `NEXT_PUBLIC_SUPABASE_URL`).
 *   2. Signature HMAC optionnelle : si `IMAGE_PROXY_SIGN_SECRET` est défini,
 *      le proxy refuse toute requête non signée.
 *   3. Le paramètre `url` est encodé avec `encodeURIComponent` (NOT base64).
 *
 * Usage : /api/images/proxy?url=<encodeURIComponent(url)>[&sig=<hmac>]
 *
 * Note Next.js 15 : seuls les exports standards (GET, POST, runtime, dynamic,
 * …) sont autorisés dans un route.ts. Toute la logique pure vit dans
 * `./internals`, qui reste testable directement.
 */
import { NextResponse } from "next/server";
import { isHostAllowed, verifySignature } from "./internals";
import { signSupabaseUrlIfNeeded } from "@/lib/images/sign-supabase-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const encodedUrl = searchParams.get("url");
  if (!encodedUrl) return new NextResponse("Missing url param", { status: 400 });

  let targetUrl: string;
  try {
    targetUrl = decodeURIComponent(encodedUrl);
  } catch {
    return new NextResponse("Invalid url encoding", { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    return new NextResponse("Protocol not allowed", { status: 400 });
  }

  if (!isHostAllowed(parsedUrl.hostname)) {
    return new NextResponse("Domain not allowed", { status: 403 });
  }

  if (!verifySignature(targetUrl, searchParams.get("sig"))) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  // P0 fix : si l'URL est une URL Supabase Storage publique (legacy),
  // la transformer en signed URL avant de la fetch (sinon le bucket privé
  // renvoie 400). Idempotent : retourne l'URL inchangée si déjà signée.
  const fetchedUrl = (await signSupabaseUrlIfNeeded(targetUrl)) ?? targetUrl;
  if (fetchedUrl !== targetUrl) {
    try {
      parsedUrl = new URL(fetchedUrl);
    } catch {
      // ignore — fall back to original parsedUrl
    }
  }

  const host = parsedUrl.hostname;
  console.log(`[proxy] fetching ${host} path=${parsedUrl.pathname.slice(0, 60)}`);

  try {
    const upstream = await fetch(fetchedUrl, {
      headers: { "User-Agent": "MangaAIStudio/1.0" },
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok) {
      console.warn(`[proxy] upstream ${upstream.status} for ${host}${parsedUrl.pathname.slice(0, 60)}`);
      return new NextResponse(`Upstream error: ${upstream.status}`, { status: upstream.status });
    }

    const rawContentType = upstream.headers.get("content-type") ?? "image/jpeg";
    const contentType = rawContentType.split(";")[0]!.trim();
    if (!contentType.startsWith("image/")) {
      console.warn(`[proxy] refusing non-image content-type=${contentType} for ${host}`);
      return new NextResponse("Upstream content-type not allowed", { status: 415 });
    }

    const bytes = await upstream.arrayBuffer();
    console.log(`[proxy] OK ${host} bytes=${bytes.byteLength}`);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
        "Content-Length": String(bytes.byteLength),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "proxy_error";
    console.error(`[proxy] error ${host}: ${msg}`);
    return new NextResponse(msg, { status: 502 });
  }
}
