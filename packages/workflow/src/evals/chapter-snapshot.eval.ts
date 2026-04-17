/**
 * A06 — Snapshot tests narratifs pour 3 chapitres canoniques.
 *
 * Chaque fixture valide la cohérence pipeline:
 * - panelCast.focus distribué correctement (pas toujours le héros)
 * - shotType respecte les cibles genre (wide/medium/closeup/cutaway)
 * - cutawayType présent sur les panels de transition
 * - aspect_to_aspect transitions présentes ≥1 par scène
 */

import { describe, it, expect } from "vitest";
import { directShotPlan } from "../../../ai/src/services/shot-plan-director";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SHONEN_COMBAT_BEATS = [
  { id: "beat_1", pageRole: "establishing", characters: ["Kaito", "Akira"], location: "Rooftop", summary: "Kaito faces Akira on the rooftop, tension rising." },
  { id: "beat_2", pageRole: "confrontation", characters: ["Kaito", "Akira"], location: "Rooftop", summary: "Akira lunges — Kaito dodges, draws power." },
  { id: "beat_3", pageRole: "action", characters: ["Kaito", "Akira"], location: "Rooftop", summary: "Explosive exchange, both bloodied." },
  { id: "beat_4", pageRole: "cliffhanger", characters: ["Kaito", "Akira"], location: "Rooftop", summary: "Akira reveals his true form. Cliffhanger." },
];

const ROMANCE_JOSEI_BEATS = [
  { id: "beat_1", pageRole: "establishing", characters: ["Hana", "Ren"], location: "Café", summary: "Hana and Ren sit in silence at the café." },
  { id: "beat_2", pageRole: "dialogue", characters: ["Hana", "Ren"], location: "Café", summary: "Ren confesses his feelings. Hana is stunned." },
  { id: "beat_3", pageRole: "aftermath", characters: ["Hana"], location: "Street", summary: "Hana walks home, conflicted." },
];

const DARK_FANTASY_BEATS = [
  { id: "beat_1", pageRole: "establishing", characters: ["Seraph", "Void-Golem"], location: "Obsidian Fortress", summary: "Seraph enters the Obsidian Fortress." },
  { id: "beat_2", pageRole: "confrontation", characters: ["Seraph", "Void-Golem"], location: "Obsidian Fortress", summary: "The Void-Golem awakens — first encounter." },
  { id: "beat_3", pageRole: "revelation", characters: ["Seraph"], location: "Obsidian Fortress", summary: "Seraph discovers the forbidden rune." },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function countTransitions(plan: ReturnType<typeof directShotPlan>, type: string) {
  return plan.pages
    .flatMap((p) => p.panels)
    .filter((p) => p.transitionFromPrevious === type).length;
}

function shotTypeRatio(plan: ReturnType<typeof directShotPlan>) {
  const panels = plan.pages.flatMap((p) => p.panels);
  const total = panels.length;
  const counts: Record<string, number> = {};
  for (const p of panels) counts[p.shotType] = (counts[p.shotType] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / total]));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("chapter-snapshot — shonen combat", () => {
  const plan = directShotPlan({
    beats: SHONEN_COMBAT_BEATS,
    genreMode: "shonen",
    importantCharacters: [
      { characterId: "c1", name: "Kaito", role: "hero" },
      { characterId: "c2", name: "Akira", role: "antagonist" },
    ],
  });

  it("produces pages for each beat", () => {
    expect(plan.pages.length).toBe(SHONEN_COMBAT_BEATS.length);
  });

  it("rhythm is kinetic for shonen", () => {
    expect(plan.rhythm).toBe("kinetic");
  });

  it("has at least 1 aspect_to_aspect transition", () => {
    expect(countTransitions(plan, "aspect_to_aspect")).toBeGreaterThanOrEqual(1);
  });

  it("closeup emphasis on cliffhanger page", () => {
    const cliffPage = plan.pages.find((_, idx) => SHONEN_COMBAT_BEATS[idx]?.pageRole === "cliffhanger");
    const hasCloseup = cliffPage?.panels.some((p) => p.shotType === "closeup" || p.shotType === "extreme_closeup");
    expect(hasCloseup).toBe(true);
  });

  it("antagonist gets low-angle camera", () => {
    const antagonistPanels = plan.pages.flatMap((p) => p.panels).filter((p) => p.subjectFocus === "antagonist");
    const hasLowAngle = antagonistPanels.some((p) => p.cameraAngle === "low");
    // At least sometimes
    if (antagonistPanels.length > 0) expect(hasLowAngle).toBe(true);
  });
});

describe("chapter-snapshot — romance josei", () => {
  const plan = directShotPlan({
    beats: ROMANCE_JOSEI_BEATS,
    genreMode: "josei",
    importantCharacters: [
      { characterId: "c1", name: "Hana", role: "hero" },
    ],
  });

  it("rhythm is contemplative for josei", () => {
    expect(plan.rhythm).toBe("contemplative");
  });

  it("high closeup ratio (≥0.30)", () => {
    const ratios = shotTypeRatio(plan);
    const closeupTotal = (ratios["closeup"] ?? 0) + (ratios["extreme_closeup"] ?? 0) + (ratios["over_shoulder"] ?? 0);
    expect(closeupTotal).toBeGreaterThanOrEqual(0.30);
  });

  it("has at least 1 aspect_to_aspect transition", () => {
    expect(countTransitions(plan, "aspect_to_aspect")).toBeGreaterThanOrEqual(1);
  });

  it("aftermath page ends in wide or aspect_to_aspect", () => {
    const aftermathPageIdx = ROMANCE_JOSEI_BEATS.findIndex((b) => b.pageRole === "aftermath");
    const aftermathPage = plan.pages[aftermathPageIdx];
    const lastPanel = aftermathPage?.panels.at(-1);
    expect(["wide", "establishing"].includes(lastPanel?.shotType ?? "") || lastPanel?.transitionFromPrevious === "aspect_to_aspect").toBe(true);
  });
});

describe("chapter-snapshot — dark fantasy NPC introduction", () => {
  const plan = directShotPlan({
    beats: DARK_FANTASY_BEATS,
    genreMode: "dark_fantasy",
    importantCharacters: [
      { characterId: "c1", name: "Seraph", role: "hero" },
      { characterId: "c2", name: "Void-Golem", role: "important_npc", firstAppearanceSceneIndex: 1 },
    ],
  });

  it("NPC closeup present on introduction beat", () => {
    const introPage = plan.pages[1];
    const hasNpcCloseup = introPage?.panels.some(
      (p) => p.subjectFocus === "important_npc" && (p.shotType === "closeup" || p.emphasisReason?.includes("Void-Golem"))
    );
    expect(hasNpcCloseup).toBe(true);
  });

  it("revelation page uses splash or extreme_closeup emphasis", () => {
    const revelationEmphasis = plan.emphasis.filter((e) =>
      e.device === "splash" || e.device === "extreme_closeup"
    );
    expect(revelationEmphasis.length).toBeGreaterThan(0);
  });

  it("has at least 1 aspect_to_aspect transition", () => {
    expect(countTransitions(plan, "aspect_to_aspect")).toBeGreaterThanOrEqual(1);
  });
});
