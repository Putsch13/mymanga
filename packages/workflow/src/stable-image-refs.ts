import { createClient } from "@supabase/supabase-js";
import type {
  StableImageReference,
  StableImageReferenceTrace,
  StableImageReferenceTraceEntry,
} from "@manga-ai-studio/core";

type SupabaseSigner = (bucket: string, path: string, expiresInSeconds: number) => Promise<string | null>;

type ResolveStableImageReferenceOptions = {
  expiresInSeconds?: number;
  signSupabaseObject?: SupabaseSigner;
  logPrefix?: string;
};

function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function isHttpImageUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function parseSupabaseObjectUrl(url: string): { bucket: string; path: string } | null {
  try {
    const parsed = new URL(url);
    const publicMarker = "/storage/v1/object/public/";
    const signMarker = "/storage/v1/object/sign/";
    const marker = parsed.pathname.includes(publicMarker) ? publicMarker : parsed.pathname.includes(signMarker) ? signMarker : null;
    if (!marker) return null;
    const rest = parsed.pathname.slice(parsed.pathname.indexOf(marker) + marker.length);
    const [bucket, ...parts] = rest.split("/");
    if (!bucket || parts.length === 0) return null;
    return { bucket, path: decodeURIComponent(parts.join("/")) };
  } catch {
    return null;
  }
}

async function defaultSupabaseSigner(bucket: string, path: string, expiresInSeconds: number) {
  const client = getStorageClient();
  if (!client) return null;
  const signed = await client.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  return signed.error || !signed.data?.signedUrl ? null : signed.data.signedUrl;
}

function traceEntry(reference: StableImageReference, overrides?: Partial<StableImageReferenceTraceEntry>): StableImageReferenceTraceEntry {
  return {
    assetId: reference.assetId ?? null,
    storageKey: reference.storageKey ?? null,
    sourceType: reference.sourceType,
    sourceUrl: reference.sourceUrl ?? reference.publicUrl ?? reference.signedUrl ?? reference.falCdnUrl ?? null,
    resolvedUrl: null,
    checksum: reference.checksum ?? null,
    ignoredReason: null,
    ...overrides,
  };
}

export function buildStableImageReference(input: {
  assetId?: string | null;
  storageProvider?: string | null;
  bucket?: string | null;
  storageKey?: string | null;
  publicUrl?: string | null;
  signedUrl?: string | null;
  falCdnUrl?: string | null;
  sourceUrl?: string | null;
  sourceType: StableImageReference["sourceType"];
  checksum?: string | null;
  metadata?: Record<string, unknown>;
}): StableImageReference | null {
  const hasStableFields =
    Boolean(input.assetId)
    || Boolean(input.storageKey)
    || Boolean(input.publicUrl)
    || Boolean(input.signedUrl)
    || Boolean(input.falCdnUrl)
    || Boolean(input.sourceUrl);
  if (!hasStableFields) return null;
  return {
    assetId: input.assetId ?? null,
    storageProvider: input.storageProvider ?? null,
    bucket: input.bucket ?? null,
    storageKey: input.storageKey ?? null,
    publicUrl: input.publicUrl ?? null,
    signedUrl: input.signedUrl ?? null,
    falCdnUrl: input.falCdnUrl ?? null,
    sourceUrl: input.sourceUrl ?? null,
    sourceType: input.sourceType,
    checksum: input.checksum ?? null,
    metadata: input.metadata ?? {},
  };
}

export async function resolveStableImageReference(
  reference: StableImageReference,
  options: ResolveStableImageReferenceOptions = {},
): Promise<StableImageReferenceTraceEntry> {
  const expiresInSeconds = options.expiresInSeconds ?? 1800;
  const signSupabaseObject = options.signSupabaseObject ?? defaultSupabaseSigner;
  const logPrefix = options.logPrefix ?? "[stable-image-ref]";

  if (reference.storageProvider === "supabase" && reference.bucket && reference.storageKey) {
    const signedUrl = await signSupabaseObject(reference.bucket, reference.storageKey, expiresInSeconds);
    if (signedUrl) {
      return traceEntry(reference, { resolvedUrl: signedUrl });
    }
    console.warn(`${logPrefix} sign_failed asset=${reference.assetId ?? "n/a"} bucket=${reference.bucket} key=${reference.storageKey}`);
    if (reference.publicUrl && isHttpImageUrl(reference.publicUrl)) {
      return traceEntry(reference, { resolvedUrl: reference.publicUrl, ignoredReason: "sign_failed_public_url_fallback" });
    }
    return traceEntry(reference, { ignoredReason: "sign_failed" });
  }

  if ((!reference.bucket || !reference.storageKey) && (reference.publicUrl || reference.signedUrl || reference.sourceUrl)) {
    const supabaseParsed = parseSupabaseObjectUrl(reference.signedUrl ?? reference.publicUrl ?? reference.sourceUrl ?? "");
    if (supabaseParsed) {
      const signedUrl = await signSupabaseObject(supabaseParsed.bucket, supabaseParsed.path, expiresInSeconds);
      if (signedUrl) {
        return traceEntry(reference, {
          storageKey: reference.storageKey ?? supabaseParsed.path,
          resolvedUrl: signedUrl,
        });
      }
    }
  }

  const directUrl = reference.signedUrl ?? reference.publicUrl ?? reference.falCdnUrl ?? reference.sourceUrl ?? null;
  if (directUrl && isHttpImageUrl(directUrl)) {
    return traceEntry(reference, { resolvedUrl: directUrl });
  }

  console.warn(`${logPrefix} irrecoverable_reference asset=${reference.assetId ?? "n/a"} source=${reference.sourceType}`);
  return traceEntry(reference, { ignoredReason: "irrecoverable_reference" });
}

export async function resolveStableImageReferences(
  references: StableImageReference[],
  options: ResolveStableImageReferenceOptions = {},
): Promise<{ urls: string[]; trace: StableImageReferenceTrace }> {
  const resolved = await Promise.all(references.map((reference) => resolveStableImageReference(reference, options)));
  const dedupe = new Set<string>();
  const used: StableImageReferenceTraceEntry[] = [];
  const ignored: StableImageReferenceTraceEntry[] = [];

  for (const entry of resolved) {
    if (entry.resolvedUrl) {
      if (!dedupe.has(entry.resolvedUrl)) {
        dedupe.add(entry.resolvedUrl);
        used.push(entry);
      }
      continue;
    }
    ignored.push(entry);
  }

  return {
    urls: used.map((entry) => entry.resolvedUrl!).filter(Boolean),
    trace: {
      requested: resolved,
      used,
      ignored,
    },
  };
}
