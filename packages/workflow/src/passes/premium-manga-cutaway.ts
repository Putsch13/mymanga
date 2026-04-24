/**
 * Classification cutaway / acteur — partagé par rebalancing et QA structure.
 */

import type { PanelBlueprintPremium, SubjectFocus } from "@manga-ai-studio/core";
import { getRequiredVisualEntityIds } from "./visual-entity-ids";
import type { VisualEntity } from "./visual-entity-registry";

const BANNED_PLACEHOLDER_SNIPPETS = [
  "densified_to_meet_premium_range",
  "story-consistent interior",
  "story-consistent exterior",
  "story-consistent setting",
  "atmospheric scene without",
  "without a dominant identifiable face",
  "environment only",
  "prop insert as primary",
  "terrain damage",
] as const;

const ATMOSPHERIC_SIGNALS = [
  "atmospheric scene",
  "environment only",
  "without a dominant",
  "densified_to_meet_premium_range",
] as const;

const CUTAWAY_SUBJECT: ReadonlySet<SubjectFocus> = new Set([
  "environment",
  "prop",
  "location",
  "aftermath",
]);

export function blueprintTextBlob(bp: PanelBlueprintPremium): string {
  const parts = [
    bp.purpose,
    bp.sceneContextLabel ?? "",
    bp.narrationText ?? "",
    ...(bp.notes ?? []),
    ...((bp.dialogueLines ?? []).map((l) => `${l.speaker} ${l.text}`)),
  ];
  return parts.join(" ").toLowerCase();
}

export function containsBannedPlaceholder(bp: PanelBlueprintPremium): boolean {
  const blob = blueprintTextBlob(bp);
  return BANNED_PLACEHOLDER_SNIPPETS.some((s) => blob.includes(s.toLowerCase()));
}

/** Retire ou remplace les placeholders interdits dans les champs texte du blueprint. */
export function stripBannedPlaceholdersFromBlueprint(bp: PanelBlueprintPremium): void {
  const clean = (s: string | null | undefined): string | null => {
    if (!s || typeof s !== "string") return s ?? null;
    let out = s;
    for (const frag of BANNED_PLACEHOLDER_SNIPPETS) {
      const re = new RegExp(frag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      out = out.replace(re, "").trim();
    }
    return out.length > 0 ? out : null;
  };

  const p = clean(bp.purpose);
  if (p) bp.purpose = p;
  else bp.purpose = "character-driven story beat";

  bp.sceneContextLabel = clean(bp.sceneContextLabel ?? undefined);
  bp.narrationText = clean(bp.narrationText ?? undefined);
  if (Array.isArray(bp.notes)) {
    bp.notes = bp.notes
      .map((n) => clean(n) ?? "")
      .filter((n) => n.length > 0);
  }
}

/**
 * Définition standardisée "cutaway" côté blueprint premium (manga).
 */
export function isPremiumMangaCutawayBlueprint(bp: PanelBlueprintPremium): boolean {
  if (bp.cutawayType && bp.cutawayType !== "none") return true;
  if (CUTAWAY_SUBJECT.has(bp.subjectFocus)) return true;

  const blob = blueprintTextBlob(bp);
  for (const sig of ATMOSPHERIC_SIGNALS) {
    if (blob.includes(sig)) return true;
  }
  return false;
}

export function isPremiumMangaActorDrivenBlueprint(bp: PanelBlueprintPremium): boolean {
  return !isPremiumMangaCutawayBlueprint(bp);
}

export function buildReadingOrderIndexMap(blueprints: PanelBlueprintPremium[]): Map<string, number> {
  const sorted = [...blueprints].sort((a, b) => {
    if (a.panelNumber !== b.panelNumber) return a.panelNumber - b.panelNumber;
    return a.panelId.localeCompare(b.panelId);
  });
  const m = new Map<string, number>();
  sorted.forEach((bp, i) => m.set(bp.panelId, i));
  return m;
}

export function isConflictHeavyBeatPanel(bp: PanelBlueprintPremium): boolean {
  if (bp.mustShowEnemy) return true;
  const p = bp.purpose.toLowerCase();
  return (
    p.includes("combat")
    || p.includes("fight")
    || p.includes("battle")
    || p.includes("confront")
    || p.includes("affrontement")
  );
}

/** Panneau acteur montrant clairement une opposition (QA conflit). */
export function panelDeclaresVisibleOpponent(
  bp: PanelBlueprintPremium,
  visualEntities?: readonly VisualEntity[] | null,
): boolean {
  if (!isPremiumMangaActorDrivenBlueprint(bp)) return false;
  if (visualEntities && visualEntities.length > 0) {
    const ids = getRequiredVisualEntityIds(bp);
    if (ids.some((id) => visualEntities.find((e) => e.id === id)?.isOpponent)) return true;
  }
  if (bp.subjectFocus === "enemy" || (bp.subjectFocus === "visual_entity" && bp.mustShowEnemy)) return true;
  if (bp.mustShowEnemy) return true;
  const blob = `${bp.purpose} ${bp.shotType}`.toLowerCase();
  if (
    bp.subjectFocus === "npc"
    && /\b(soldier|robot|creature|android|beast|monster|opposing|hostile|adversary|menace)\b/i.test(blob)
  ) {
    return true;
  }
  return false;
}

export function maxConsecutiveCutawaysInOrder(blueprints: PanelBlueprintPremium[]): number {
  const sorted = [...blueprints].sort((a, b) => {
    if (a.panelNumber !== b.panelNumber) return a.panelNumber - b.panelNumber;
    return a.panelId.localeCompare(b.panelId);
  });
  let maxRun = 0;
  let run = 0;
  for (const bp of sorted) {
    if (isPremiumMangaCutawayBlueprint(bp)) {
      run += 1;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 0;
    }
  }
  return maxRun;
}
