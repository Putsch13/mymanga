import { describe, expect, it } from "vitest";
import { buildRoutingContext } from "./pipeline-scene-builder";

/**
 * P0.4 — Le `heroFocus` produit par `buildRoutingContext` doit respecter le
 * `subjectFocus` provenant du blueprint / shot plan.
 */
describe("buildRoutingContext — heroFocus (P0.4)", () => {
  const basePanel = {
    panelNumber: 1,
    camera: "",
    caption: "",
    prompt: "",
    characters: ["Hero"],
    negativePrompt: "",
    mood: null,
    dialogues: [],
  };

  it("ne force pas heroFocus si subjectFocus=enemy (close-up ennemi)", () => {
    const ctx = buildRoutingContext(
      "TEEN",
      basePanel as never,
      { shotType: "closeup", purpose: "reaction" },
      null,
      true,
      undefined,
      ["hero", "enemy"],
      [],
      null,
      null,
      "enemy",
    );
    expect(ctx.heroFocus).toBe(false);
  });

  it("ne force pas heroFocus si subjectFocus=environment", () => {
    const ctx = buildRoutingContext(
      "TEEN",
      { ...basePanel, characters: ["Hero"] } as never,
      { shotType: "wide", purpose: "environment" },
      null,
      false,
      undefined,
      ["hero"],
      [],
      null,
      null,
      "environment",
    );
    expect(ctx.heroFocus).toBe(false);
  });

  it("ne force pas heroFocus sur un reaction shot (même en closeup)", () => {
    const ctx = buildRoutingContext(
      "TEEN",
      basePanel as never,
      { shotType: "closeup", purpose: "reaction" },
      null,
      true,
      undefined,
      ["hero", "npc"],
      [],
      null,
      null,
      "reaction",
    );
    expect(ctx.heroFocus).toBe(false);
  });

  it("active heroFocus quand subjectFocus=hero explicitement", () => {
    const ctx = buildRoutingContext(
      "TEEN",
      basePanel as never,
      { shotType: "closeup", purpose: "emotional" },
      null,
      true,
      undefined,
      ["hero"],
      [],
      null,
      null,
      "hero",
    );
    expect(ctx.heroFocus).toBe(true);
  });

  it("fallback : pas de subjectFocus, un seul perso = héros → heroFocus true", () => {
    const ctx = buildRoutingContext(
      "TEEN",
      basePanel as never,
      { shotType: "closeup" },
      null,
      true,
      undefined,
      ["hero"],
      [],
      null,
      null,
      null,
    );
    expect(ctx.heroFocus).toBe(true);
  });

  it("fallback : pas de subjectFocus, plusieurs persos = pas de heroFocus implicite", () => {
    const ctx = buildRoutingContext(
      "TEEN",
      { ...basePanel, characters: ["Hero", "Npc"] } as never,
      { shotType: "closeup" },
      null,
      true,
      undefined,
      ["hero", "npc"],
      [],
      null,
      null,
      null,
    );
    expect(ctx.heroFocus).toBe(false);
  });
});

/**
 * P1.3 — Le `dominantSubject` attaché au RoutingContext doit refléter le
 * subjectFocus quand il est explicite, et tomber dans un fallback non biaisé
 * sinon.
 */
describe("buildRoutingContext — dominantSubject (P1.3)", () => {
  const basePanel = {
    panelNumber: 1,
    camera: "",
    caption: "",
    prompt: "",
    characters: ["Hero"],
    negativePrompt: "",
    mood: null,
    dialogues: [],
  };

  it("subjectFocus=enemy → dominantSubject.kind=enemy, cible l'ennemi", () => {
    const ctx = buildRoutingContext(
      "TEEN",
      { ...basePanel, characters: ["Hero", "Villain"] } as never,
      { shotType: "closeup" },
      null,
      true,
      undefined,
      ["hero", "antagonist"],
      ["MAIN_HERO", "IMPORTANT_SUPPORTING_CHARACTER"],
      null,
      null,
      "enemy",
    );
    expect(ctx.dominantSubject?.kind).toBe("enemy");
    expect(ctx.dominantSubject?.characterIndex).toBe(1);
    expect(ctx.dominantSubject?.provenance).toBe("explicit");
  });

  it("subjectFocus=environment → dominantSubject.kind=environment (pas de perso)", () => {
    const ctx = buildRoutingContext(
      "TEEN",
      basePanel as never,
      { shotType: "wide" },
      null,
      false,
      undefined,
      ["hero"],
      ["MAIN_HERO"],
      null,
      null,
      "environment",
    );
    expect(ctx.dominantSubject?.kind).toBe("environment");
    expect(ctx.dominantSubject?.characterIndex).toBeNull();
  });

  it("pas de subjectFocus, 1 perso ennemi seul → dominantSubject.kind=enemy (pas hero par défaut)", () => {
    const ctx = buildRoutingContext(
      "TEEN",
      { ...basePanel, characters: ["Villain"] } as never,
      { shotType: "closeup" },
      null,
      true,
      undefined,
      ["antagonist"],
      ["IMPORTANT_SUPPORTING_CHARACTER"],
      null,
      null,
      null,
    );
    expect(ctx.dominantSubject?.kind).toBe("enemy");
    expect(ctx.dominantSubject?.provenance).toBe("inferred");
  });

  it("pas de subjectFocus, 2+ persos → dominantSubject.kind=group (pas de biais hero)", () => {
    const ctx = buildRoutingContext(
      "TEEN",
      { ...basePanel, characters: ["Hero", "Ally"] } as never,
      { shotType: "medium" },
      null,
      true,
      undefined,
      ["hero", "ally"],
      ["MAIN_HERO", "SECONDARY_CORE"],
      null,
      null,
      null,
    );
    expect(ctx.dominantSubject?.kind).toBe("group");
    expect(ctx.dominantSubject?.characterIndex).toBeNull();
  });
});
