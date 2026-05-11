import type {
  CanonLevel,
  DiscoveredEntityKind,
  DiscoveredVisualEntity,
  DiscoverySource,
  VisualDiscoveryPassInput,
} from "./types";

export function extractTextFromBeats(
  beats: VisualDiscoveryPassInput["beats"],
): { beatId: string; text: string }[] {
  return beats.map((b) => ({
    beatId: b.beatId,
    text: [b.summary, b.whyThisBeatExists, b.dramaticChange]
      .filter((x): x is string => typeof x === "string")
      .join(" "),
  }));
}

export function detectEntitiesFromText(
  text: string,
  patterns: Array<{ pattern: RegExp; label: string; kind?: string }>,
): Map<string, { label: string; kind?: string; count: number }> {
  const found = new Map<string, { label: string; kind?: string; count: number }>();
  for (const p of patterns) {
    const matches = text.match(p.pattern);
    if (matches && matches.length > 0) {
      const existing = found.get(p.label);
      found.set(p.label, {
        label: p.label,
        kind: p.kind,
        count: (existing?.count ?? 0) + matches.length,
      });
    }
  }
  return found;
}

export function createDiscoveredEntity(
  label: string,
  kind: DiscoveredEntityKind,
  source: DiscoverySource,
  beatIds: string[],
  confidence: number,
  visualDescription?: string,
  canonLevel: CanonLevel = "chapter_temporary",
  evidenceText?: string,
): DiscoveredVisualEntity {
  return {
    label,
    kind,
    source,
    confidence,
    requiredBeats: beatIds,
    optionalBeats: [],
    visualDescription: visualDescription ?? `${kind}: ${label}`,
    canonLevel,
    detectedIn: beatIds,
    // P1.9 — Champs evidence-based
    evidenceBeatId: beatIds[0],
    evidenceText,
    required: confidence >= 0.75 && beatIds.length > 0,
  };
}
