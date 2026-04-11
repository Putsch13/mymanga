import type { StableImageReference, StableImageReferenceSourceType, StableImageReferenceTrace } from "@manga-ai-studio/core";
import { buildStableImageReference } from "@manga-ai-studio/workflow";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isSourceType(value: unknown): value is StableImageReferenceSourceType {
  return value === "media_asset" || value === "character_visual_ref" || value === "scene_keyframe" || value === "legacy_url";
}

function referenceKey(reference: StableImageReference) {
  return [
    reference.assetId ?? "",
    reference.storageKey ?? "",
    reference.sourceUrl ?? "",
    reference.publicUrl ?? "",
    reference.signedUrl ?? "",
    reference.falCdnUrl ?? "",
  ].join("|");
}

function fromTraceEntries(entries: unknown[]) {
  return entries
    .map((entry) => {
      const record = asRecord(entry);
      return buildStableImageReference({
        assetId: typeof record.assetId === "string" ? record.assetId : null,
        storageProvider: typeof record.storageKey === "string" ? "supabase" : null,
        storageKey: typeof record.storageKey === "string" ? record.storageKey : null,
        publicUrl: typeof record.resolvedUrl === "string" ? record.resolvedUrl : null,
        signedUrl: typeof record.resolvedUrl === "string" ? record.resolvedUrl : null,
        sourceUrl: typeof record.sourceUrl === "string" ? record.sourceUrl : null,
        sourceType: isSourceType(record.sourceType) ? record.sourceType : "legacy_url",
        checksum: typeof record.checksum === "string" ? record.checksum : null,
      });
    })
    .filter((reference): reference is StableImageReference => Boolean(reference));
}

export function collectRetryStableReferences(input: {
  metadata: Record<string, unknown>;
  savedReferenceIds: string[];
}) {
  const referenceTraceRecord = asRecord(input.metadata.referenceTrace);
  const referenceTrace: StableImageReferenceTrace = {
    requested: Array.isArray(referenceTraceRecord.requested) ? referenceTraceRecord.requested as StableImageReferenceTrace["requested"] : [],
    used: Array.isArray(referenceTraceRecord.used) ? referenceTraceRecord.used as StableImageReferenceTrace["used"] : [],
    ignored: Array.isArray(referenceTraceRecord.ignored) ? referenceTraceRecord.ignored as StableImageReferenceTrace["ignored"] : [],
  };

  const references = [
    ...fromTraceEntries(referenceTrace.requested),
    ...fromTraceEntries(referenceTrace.used),
    ...input.savedReferenceIds.map((value) =>
      buildStableImageReference({
        sourceUrl: value,
        publicUrl: value,
        sourceType: "legacy_url",
      })),
    buildStableImageReference({
      sourceUrl: typeof input.metadata.requestedCanonicalRef === "string" ? input.metadata.requestedCanonicalRef : null,
      publicUrl: typeof input.metadata.requestedCanonicalRef === "string" ? input.metadata.requestedCanonicalRef : null,
      sourceType: "character_visual_ref",
    }),
    buildStableImageReference({
      sourceUrl: typeof input.metadata.canonRefUsed === "string" ? input.metadata.canonRefUsed : null,
      publicUrl: typeof input.metadata.canonRefUsed === "string" ? input.metadata.canonRefUsed : null,
      sourceType: "character_visual_ref",
    }),
  ].filter((reference): reference is StableImageReference => Boolean(reference));

  const deduped = new Map<string, StableImageReference>();
  for (const reference of references) {
    deduped.set(referenceKey(reference), reference);
  }
  return Array.from(deduped.values());
}
