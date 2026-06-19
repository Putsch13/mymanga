/**
 * Normalisation et réparation best-effort de la sortie LLM :
 *  - dérive un `BeatNarrativeContract` si le LLM n'en a pas fourni,
 *  - merge les `structuredBeat` LLM/heuristiques,
 *  - répare les outliers fréquents (énums sortis sous forme de tableau).
 */
import { z } from "zod";
import type { BeatNarrativeContract } from "@manga-ai-studio/core";
import { beatContractFromLegacyRole } from "@manga-ai-studio/core";
import {
  outlineResultSchema,
  type ChapterOutlineContext,
  type ChapterOutlineResult,
} from "./schema";
import {
  inferStructuredBeatPayload,
  mergeStructuredBeatPayload,
} from "./structured-beat";

/**
 * Derives a BeatNarrativeContract from a legacy outline beat. Conservative by
 * design: only the literal pageRole="action" promotes to combat_full. Every
 * other legacy role resolves to its non-combat storyFunction default. Callers
 * that want combat must emit a structured contract explicitly.
 */
export function deriveBeatNarrativeContractFromOutlineBeat(input: {
  chapterNumber: number;
  index: number;
  summary: string;
  /** Accept any string so callers upstream of the Zod parse can still use it. */
  pageRole?: string;
}): BeatNarrativeContract {
  const beatId = `ch${input.chapterNumber}-beat${input.index + 1}`;
  const legacyPageRole = input.pageRole ?? "escalation";
  return beatContractFromLegacyRole({
    beatId,
    summary: input.summary,
    legacyPageRole,
    explicitCombat: legacyPageRole === "action",
  });
}

export function normalizeOutlineResult(
  ctx: ChapterOutlineContext,
  outline: ChapterOutlineResult,
): ChapterOutlineResult {
  return {
    ...outline,
    beats: outline.beats.map((beat, index) => ({
      ...beat,
      structuredBeat: mergeStructuredBeatPayload(
        inferStructuredBeatPayload(ctx, beat, index, outline.beats.length),
        beat.structuredBeat,
      ),
      beatNarrativeContract:
        beat.beatNarrativeContract ??
        deriveBeatNarrativeContractFromOutlineBeat({
          chapterNumber: ctx.chapterNumber,
          index,
          summary: beat.summary,
          pageRole: beat.pageRole,
        }),
    })),
  };
}

/**
 * Best-effort JSON repair: normalizes LLM enum arrays to scalars
 * before re-running Zod validation.
 */
export function attemptRepairOutlineJson(
  raw: unknown,
): z.SafeParseReturnType<unknown, ChapterOutlineResult> {
  if (!raw || typeof raw !== "object") return outlineResultSchema.safeParse(raw);
  const obj = structuredClone(raw) as Record<string, unknown>;
  if (Array.isArray(obj.beats)) {
    for (const beat of obj.beats as Record<string, unknown>[]) {
      if (Array.isArray(beat.pageRole)) beat.pageRole = beat.pageRole[0];
      const sb = beat.structuredBeat as Record<string, unknown> | undefined;
      if (sb) {
        if (Array.isArray(sb.source)) sb.source = sb.source[0];
        for (const arc of (sb.arcPromises ?? []) as Record<string, unknown>[]) {
          if (Array.isArray(arc.stage)) arc.stage = arc.stage[0];
          if (Array.isArray(arc.priority)) arc.priority = arc.priority[0];
        }
        for (const wc of (sb.worldConsequences ?? []) as Record<string, unknown>[]) {
          if (Array.isArray(wc.scope)) wc.scope = wc.scope[0];
          if (Array.isArray(wc.persistence)) wc.persistence = wc.persistence[0];
        }
        for (const hook of (sb.setupPayoffHooks ?? []) as Record<string, unknown>[]) {
          if (Array.isArray(hook.kind)) hook.kind = hook.kind[0];
        }
      }
      const bnc = beat.beatNarrativeContract as Record<string, unknown> | undefined;
      if (bnc) {
        if (Array.isArray(bnc.storyFunction)) bnc.storyFunction = bnc.storyFunction[0];
        if (Array.isArray(bnc.actionEnvelope)) bnc.actionEnvelope = bnc.actionEnvelope[0];
        if (Array.isArray(bnc.visualEscalationPolicy)) {
          bnc.visualEscalationPolicy = bnc.visualEscalationPolicy[0];
        }
      }
    }
  }
  return outlineResultSchema.safeParse(obj);
}
