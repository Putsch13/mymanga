/**
 * Construit un `StructuredBeatPayload` heuristique à partir d'un beat
 * d'outline (utilisé comme fallback quand le LLM n'a pas produit de
 * payload structuré, et merge avec le payload LLM s'il en a fourni un).
 */
import type { StructuredBeatPayload } from "@manga-ai-studio/core";
import type { ChapterOutlineContext, PageRole } from "./schema";

export function buildBeatHookId(
  chapterNumber: number,
  index: number,
  label: string,
): string {
  return `ch${chapterNumber}-beat${index + 1}-${label}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function inferStructuredBeatPayload(
  ctx: ChapterOutlineContext,
  beat: {
    summary: string;
    turn?: string;
    location?: string;
    characters?: string[];
    pageRole?: PageRole;
  },
  index: number,
  total: number,
): StructuredBeatPayload {
  const stage: StructuredBeatPayload["arcPromises"][number]["stage"] =
    beat.pageRole === "establishing"
      ? "setup"
      : beat.pageRole === "revelation"
        ? "twist"
        : beat.pageRole === "cliffhanger" || index === total - 1
          ? "payoff"
          : "progression";
  const priority =
    beat.pageRole === "cliffhanger" || beat.pageRole === "revelation"
      ? "high"
      : beat.pageRole === "confrontation" || beat.pageRole === "aftermath"
        ? "medium"
        : "low";
  const primaryArc = ctx.arcs?.find((arc) => arc.status !== "closed") ?? ctx.arcs?.[0];
  const primaryLocation =
    beat.location?.trim() || ctx.knownLocations?.[0]?.name || "lieu principal";
  const characters = (beat.characters ?? []).filter(Boolean);
  const payoffTarget =
    stage === "setup" || stage === "progression"
      ? `Beat ${Math.min(total, index + (stage === "setup" ? 3 : 2))}`
      : null;

  return {
    source: "heuristic_fallback",
    confidence: 0.46,
    arcPromises: [
      {
        arcName: primaryArc?.name ?? "Arc principal",
        promise: beat.turn?.trim() || beat.summary.slice(0, 140),
        stage,
        priority,
        payoffTarget,
      },
    ],
    worldConsequences: [
      {
        consequenceType:
          beat.pageRole === "cliffhanger"
            ? "cliffhanger_pressure"
            : beat.pageRole === "revelation"
              ? "new_information"
              : beat.pageRole === "confrontation"
                ? "conflict_shift"
                : "scene_progression",
        description: `Conséquence active autour de ${primaryLocation}: ${
          beat.turn?.trim() || beat.summary.slice(0, 120)
        }`,
        scope: beat.pageRole === "cliffhanger" ? "chapter" : "local",
        persistence:
          beat.pageRole === "aftermath" || beat.pageRole === "cliffhanger"
            ? "lasting"
            : "temporary",
        affectedLocations: [primaryLocation],
        affectedCharacters: characters,
      },
    ],
    setupPayoffHooks: [
      {
        hookId: buildBeatHookId(ctx.chapterNumber, index, stage),
        label:
          stage === "payoff"
            ? `Payoff de ${beat.turn?.trim() || beat.summary.slice(0, 80)}`
            : `Setup à surveiller: ${beat.turn?.trim() || beat.summary.slice(0, 80)}`,
        kind:
          stage === "payoff"
            ? "payoff"
            : beat.pageRole === "revelation"
              ? "foreshadowing"
              : beat.pageRole === "aftermath"
                ? "echo"
                : "setup",
        targetBeatHint: payoffTarget,
        resolved: stage === "payoff",
      },
    ],
  };
}

export function mergeStructuredBeatPayload(
  fallback: StructuredBeatPayload,
  payload: StructuredBeatPayload | undefined,
): StructuredBeatPayload {
  if (!payload) return fallback;
  return {
    source: payload.source,
    confidence:
      payload.arcPromises.length +
        payload.worldConsequences.length +
        payload.setupPayoffHooks.length ===
      0
        ? Math.max(payload.confidence, fallback.confidence)
        : payload.confidence,
    arcPromises:
      payload.arcPromises.length > 0 ? payload.arcPromises : fallback.arcPromises,
    worldConsequences:
      payload.worldConsequences.length > 0
        ? payload.worldConsequences
        : fallback.worldConsequences,
    setupPayoffHooks:
      payload.setupPayoffHooks.length > 0
        ? payload.setupPayoffHooks
        : fallback.setupPayoffHooks,
  };
}
