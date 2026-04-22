/**
 * P0.1 (sprint 5) — Wiring `cutawayType` dans `buildRoutingContextV2`.
 *
 * Un cutaway explicite (environment, prop_insert, aftermath, reaction, crowd,
 * npc_group, surveillance, threat_insert) doit :
 *   - bloquer `heroFocus` (même si le héros est présent et seul dans le cast)
 *   - produire un `dominantSubject` cohérent (env/prop/aftermath/reaction/etc.)
 *   - faire en sorte que `cutawayType` soit présent dans le RoutingContext
 *     retourné (traçabilité pour fal-scene-strategy)
 *
 * Le cutaway `enemy` / `enemy_reveal` NE bloque pas heroFocus directement
 * ici (c'est le `dominantSubject` qui produira kind=enemy et qui
 * neutralisera le lock héros en aval via fal-scene-strategy).
 */
import { describe, it, expect } from "vitest";
import { buildRoutingContextV2 } from "./routing-context";
import type { StoryboardPanel } from "@manga-ai-studio/ai";

function makePanel(overrides: Partial<StoryboardPanel> & { notes?: string | null } = {}): StoryboardPanel {
  return {
    panelNumber: overrides.panelNumber ?? 1,
    camera: overrides.camera ?? "medium",
    caption: overrides.caption ?? "",
    prompt: overrides.prompt ?? "",
    characters: overrides.characters ?? [],
    dialogue: overrides.dialogue ?? null,
    dialogues: overrides.dialogues ?? [],
    mood: overrides.mood ?? null,
    notes: overrides.notes ?? null,
  } as unknown as StoryboardPanel;
}

describe("buildRoutingContextV2 — cutawayType wiring (P0.1)", () => {
  it("cutaway environment avec héros présent → heroFocus=false, dominantSubject=environment", () => {
    const ctx = buildRoutingContextV2({
      intensityLayer: "TEEN",
      panel: makePanel({ characters: ["hero"], camera: "wide", caption: "Vue panoramique du temple" }),
      panelContract: {
        shotType: "wide",
        cutawayType: "environment_establishing",
      },
      hasCanonRef: true,
      panelCharacterRoles: ["hero"],
      panelCharacterImportanceTiers: ["MAIN_HERO"],
      subjectFocus: undefined,
    });
    expect(ctx.heroFocus).toBe(false);
    expect(ctx.cutawayType).toBe("environment_establishing");
    expect(ctx.dominantSubject?.kind).toBe("environment");
  });

  it("cutaway prop_insert avec héros seul → heroFocus=false, dominantSubject=prop", () => {
    const ctx = buildRoutingContextV2({
      intensityLayer: "TEEN",
      panel: makePanel({ characters: ["hero"], camera: "extreme close", caption: "Gros plan sur l'épée" }),
      panelContract: {
        shotType: "extreme_closeup",
        cutawayType: "prop_insert",
      },
      hasCanonRef: true,
      panelCharacterRoles: ["hero"],
      panelCharacterImportanceTiers: ["MAIN_HERO"],
    });
    expect(ctx.heroFocus).toBe(false);
    expect(ctx.dominantSubject?.kind).toBe("prop");
  });

  it("cutaway aftermath avec héros présent → heroFocus=false, dominantSubject=aftermath", () => {
    const ctx = buildRoutingContextV2({
      intensityLayer: "TEEN",
      panel: makePanel({ characters: ["hero"], camera: "medium", caption: "Ruines fumantes après l'explosion" }),
      panelContract: {
        shotType: "medium",
        cutawayType: "aftermath",
      },
      hasCanonRef: true,
      panelCharacterRoles: ["hero"],
    });
    expect(ctx.heroFocus).toBe(false);
    expect(ctx.dominantSubject?.kind).toBe("aftermath");
  });

  it("cutaway reaction avec cast mixte hero+npc → heroFocus=false", () => {
    const ctx = buildRoutingContextV2({
      intensityLayer: "TEEN",
      panel: makePanel({ characters: ["hero", "npc"], camera: "closeup", caption: "Réaction du témoin" }),
      panelContract: {
        shotType: "closeup",
        cutawayType: "reaction_insert",
      },
      hasCanonRef: true,
      panelCharacterRoles: ["hero", "npc"],
      subjectFocus: "reaction",
    });
    expect(ctx.heroFocus).toBe(false);
    expect(ctx.cutawayType).toBe("reaction_insert");
  });

  it("cutaway crowd → heroFocus=false même avec héros seul", () => {
    const ctx = buildRoutingContextV2({
      intensityLayer: "TEEN",
      panel: makePanel({ characters: ["hero"], camera: "wide", caption: "Foule en panique" }),
      panelContract: {
        shotType: "wide",
        cutawayType: "crowd",
      },
      hasCanonRef: true,
      panelCharacterRoles: ["hero"],
    });
    expect(ctx.heroFocus).toBe(false);
    expect(ctx.cutawayType).toBe("crowd");
  });

  it("sans cutayType, héros seul en closeup → heroFocus=true (comportement historique)", () => {
    const ctx = buildRoutingContextV2({
      intensityLayer: "TEEN",
      panel: makePanel({ characters: ["hero"], camera: "closeup", caption: "Close-up du héros" }),
      panelContract: {
        shotType: "closeup",
      },
      hasCanonRef: true,
      panelCharacterRoles: ["hero"],
    });
    expect(ctx.heroFocus).toBe(true);
    expect(ctx.dominantSubject?.kind).toBe("hero");
  });

  it("cutawayType explicite est inclus dans le RoutingContext retourné", () => {
    const ctx = buildRoutingContextV2({
      intensityLayer: "TEEN",
      panel: makePanel({ characters: [] }),
      panelContract: {
        shotType: "wide",
        cutawayType: "location_transition",
      },
      hasCanonRef: false,
    });
    expect(ctx.cutawayType).toBe("location_transition");
  });

  it("absence de cutawayType → cutawayType=null dans le RoutingContext", () => {
    const ctx = buildRoutingContextV2({
      intensityLayer: "TEEN",
      panel: makePanel({ characters: ["hero"], camera: "medium", caption: "" }),
      panelContract: {
        shotType: "medium",
      },
      hasCanonRef: true,
      panelCharacterRoles: ["hero"],
    });
    expect(ctx.cutawayType).toBeNull();
  });
});
