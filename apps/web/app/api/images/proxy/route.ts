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
 */
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hosts provider temporaires dont l'URL expire — on les proxifie pour cacher
 * l'expiration côté navigateur (Safari ne revalide pas assez vite).
 */
const PROVIDER_TEMPORARY_HOSTS: ReadonlyArray<string> = [
  "v3b.fal.media",
  "cdn.fal.ai",
];

/**
 * Suffixes acceptés pour les sous-domaines delivery-* des providers (BFL +
 * FAL file servers qui changent d'ID). Plus stricts qu'un simple `endsWith`.
 */
function isAllowedProviderSubdomain(host: string): boolean {
  // FAL : files-*.fal.media / storage-*.fal.media
  if (host.endsWith(".fal.media") && /^[a-z0-9-]+\.fal\.media$/.test(host)) {
    return true;
  }
  // BFL : delivery-<region>.bfl.ai
  if (host.startsWith("delivery-") && host.endsWith(".bfl.ai") && /^delivery-[a-z0-9]+\.bfl\.ai$/.test(host)) {
    return true;
  }
  return false;
}

/**
 * Host Supabase du projet, tiré de `NEXT_PUBLIC_SUPABASE_URL`. Seul ce host
 * précis est autorisé — pas tout `*.supabase.co`.
 */
function getProjectSupabaseHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isHostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  if (PROVIDER_TEMPORARY_HOSTS.includes(h)) return true;
  if (isAllowedProviderSubdomain(h)) return true;
  const supabaseHost = getProjectSupabaseHost();
  if (supabaseHost && h === supabaseHost) return true;
  return false;
}

/**
 * Vérification HMAC optionnelle : si `IMAGE_PROXY_SIGN_SECRET` est configuré,
 * toute requête doit fournir un `sig` valide. Sinon on tombe sur l'allowlist.
 */
function verifySignature(targetUrl: string, providedSig: string | null): boolean {
  const secret = process.env.IMAGE_PROXY_SIGN_SECRET;
  if (!secret) return true;
  if (!providedSig) return false;
  const expected = createHmac("sha256", secret).update(targetUrl).digest("hex");
  const a = Buffer.from(expected, "hex");
  let b: Buffer;
  try {
    b = Buffer.from(providedSig, "hex");
  } catch {
    return false;
  }
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const encodedUrl = searchParams.get("url");
  if (!encodedUrl) return new NextResponse("Missing url param", { status: 400 });

  let targetUrl: string;
  try {
    // encodeURIComponent côté client → decodeURIComponent côté serveur.
    // Note : le paramètre N'EST PAS du base64 (ancien commentaire erroné).
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

  const host = parsedUrl.hostname;
  console.log(`[proxy] fetching ${host} path=${parsedUrl.pathname.slice(0, 60)}`);

  try {
    const upstream = await fetch(targetUrl, {
      headers: { "User-Agent": "MangaAIStudio/1.0" },
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok) {
      console.warn(`[proxy] upstream ${upstream.status} for ${host}${parsedUrl.pathname.slice(0, 60)}`);
      return new NextResponse(`Upstream error: ${upstream.status}`, { status: upstream.status });
    }

    // Accepter uniquement un content-type image (refus d'agir comme proxy HTML/JSON).
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
        // no-store : les signed URLs changent à chaque requête.
        "Cache-Control": "no-store",
        "Content-Length": String(bytes.byteLength),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "proxy_error";
    console.error(`[proxy] error ${host}: ${msg}`);
    return new NextResponse(msg, { status: 502 });
  }
}

/**
 * Export côté tests pour vérifier l'allowlist sans lancer la route complète.
 */
export const __proxyInternals = {
  isHostAllowed,
  verifySignature,
  isAllowedProviderSubdomain,
};
