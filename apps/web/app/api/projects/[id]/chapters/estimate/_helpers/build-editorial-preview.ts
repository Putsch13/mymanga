/**
 * P5.2 — Construit l'éditorial preview (5 tournants) + l'`approvedOutlineVersion`
 * pour la réponse `/estimate`. Travaille uniquement sur les beats du bundle.
 */
import type { GeneratedChapterBundle } from "@manga-ai-studio/ai";
import { buildApprovedOutlineVersion } from "@manga-ai-studio/core";
import {
  selectEditorialPreviewBeats,
  type ProductionBeatLike,
} from "@/lib/outline-dedup";

export function buildEditorialPreview(args: {
  bundleOutline: GeneratedChapterBundle["outline"];
}) {
  const { bundleOutline } = args;
  const allBundleBeats = bundleOutline.beats.map((beat) => ({
    id: beat.id,
    summary: beat.summary,
    characters: beat.characters ?? [],
    location: beat.location,
    pageRole: beat.pageRole ?? "escalation",
    turn: beat.turn ?? beat.purpose,
    emotionalDelta: beat.emotionalDelta ?? 0,
    structuredBeat: beat.structuredBeat ?? null,
  }));
  const editorialPreviewBeats = selectEditorialPreviewBeats(allBundleBeats as ProductionBeatLike[]);
  const previewBeats = editorialPreviewBeats.map((b) => {
    const eb = b as typeof allBundleBeats[number];
    return {
      id: eb.id,
      summary: eb.summary,
      characters: eb.characters,
      location: eb.location,
      pageRole: eb.pageRole,
      turn: eb.turn,
      emotionalDelta: eb.emotionalDelta,
      structuredBeat: eb.structuredBeat,
    };
  });
  const previewVersion = buildApprovedOutlineVersion({
    summary: bundleOutline.chapter_goal,
    cliffhanger: bundleOutline.cliffhanger,
    beats: allBundleBeats,
    source: "estimate_preview",
  });

  return { previewBeats, previewVersion };
}
