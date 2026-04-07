/**
 * Proxy d'image côté serveur.
 * Permet d'afficher une image FAL (ou autre URL externe) sans exposer l'URL directement au client.
 * L'URL est encodée en base64 dans le paramètre `url`.
 *
 * Usage: /api/images/proxy?url=<base64url>
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Pas d'auth requise : la liste blanche de domaines est la seule protection nécessaire.
  // Les cookies ne sont pas envoyés de façon fiable pour les requêtes <img src> (Safari, SameSite).
  // La sécurité repose sur la liste allowedHosts ci-dessous.

  const { searchParams } = new URL(req.url);
  const encodedUrl = searchParams.get("url");
  if (!encodedUrl) return new NextResponse("Missing url param", { status: 400 });

  let targetUrl: string;
  try {
    // encodeURIComponent côté client → decodeURIComponent côté serveur (universel)
    targetUrl = decodeURIComponent(encodedUrl);
  } catch {
    return new NextResponse("Invalid url encoding", { status: 400 });
  }

  // Sécurité: seulement les domaines autorisés
  const allowedHosts = [
    "v3b.fal.media",
    "fal.media",
    "cdn.fal.ai",
    "twsdtltsbcpjzatodeea.supabase.co",
    "supabase.co",
  ];
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return new NextResponse("Invalid URL", { status: 400 });
  }
  const isAllowed = allowedHosts.some(
    (h) => parsedUrl.hostname === h || parsedUrl.hostname.endsWith(`.${h}`)
  );
  if (!isAllowed) {
    return new NextResponse("Domain not allowed", { status: 403 });
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: { "User-Agent": "MangaAIStudio/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!upstream.ok) {
      console.warn(`[proxy] upstream ${upstream.status} for ${targetUrl.slice(0, 80)}`);
      return new NextResponse(`Upstream error: ${upstream.status}`, { status: upstream.status });
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    const bytes = await upstream.arrayBuffer();

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Cache 24h côté navigateur, 1h côté CDN
        "Cache-Control": "public, max-age=86400, s-maxage=3600",
        "Content-Length": String(bytes.byteLength),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "proxy_error";
    return new NextResponse(msg, { status: 502 });
  }
}
