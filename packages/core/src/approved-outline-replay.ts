import { buildApprovedOutlineVersion } from "./approved-outline-utils";
import type { ApprovedChapterOutline, ApprovedOutlineBeat } from "./types";

export type OutlineBeatLike = {
  id: string;
  summary: string;
  characters: string[];
  location: string;
  pageRole?: string;
  turn?: string;
  emotionalDelta?: number;
  structuredBeat?: unknown;
};

function normalizeStructuredBeat(raw: unknown): ApprovedOutlineBeat["structuredBeat"] | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.source === "string" && typeof o.confidence === "number") {
    return raw as ApprovedOutlineBeat["structuredBeat"];
  }
  return null;
}

function padMin(s: string, min: number): string {
  const t = s.trim();
  if (t.length >= min) return t;
  return (t + ".".repeat(min)).slice(0, min);
}

/**
 * Construit un `ApprovedChapterOutline` valide Zod pour rejouer `generateChapterBundle`
 * avec le même récit mais un `VisualWorldContract` (lieux IA-first).
 */
export function buildApprovedChapterOutlineReplayFromOutlineBeats(input: {
  summary: string;
  cliffhanger: string;
  beats: OutlineBeatLike[];
  source: "estimate_preview" | "user_approved";
}): ApprovedChapterOutline {
  const beats = input.beats.map((b) => {
    const characters =
      Array.isArray(b.characters) && b.characters.length > 0
        ? b.characters.map((c) => String(c).trim()).filter(Boolean)
        : ["Personnage"];
    return {
      id: b.id.trim() || "beat_1",
      summary: padMin(b.summary, 10),
      characters,
      location: padMin(b.location, 1),
      pageRole: padMin(b.pageRole ?? "escalation", 1),
      turn: padMin(b.turn ?? b.summary, 1),
      emotionalDelta:
        typeof b.emotionalDelta === "number" && Number.isFinite(b.emotionalDelta)
          ? Math.min(3, Math.max(-3, Math.trunc(b.emotionalDelta)))
          : 0,
      structuredBeat: normalizeStructuredBeat(b.structuredBeat),
    };
  });

  const base: Omit<ApprovedChapterOutline, "approvalVersion" | "approvedAt"> = {
    summary: padMin(input.summary, 10),
    cliffhanger: padMin(input.cliffhanger, 3),
    beats,
    source: input.source,
  };

  return {
    ...base,
    approvedAt: new Date().toISOString(),
    approvalVersion: buildApprovedOutlineVersion(base),
  };
}
