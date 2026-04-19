/**
 * P0.2 — Sélection déterministe d'un narrativeHook.
 *
 * Objectif : remplacer `Math.random()` dans `/api/projects/[id]/npc-resolve`
 * par un choix stable basé sur un hash des entrées sémantiques. Ces tests
 * valident :
 *   - même entrée ⇒ même hook (reproductibilité)
 *   - un champ significatif qui bouge ⇒ choix potentiellement différent
 *   - liste vide ⇒ null
 *   - normalisation (trim + lowercase) sur les champs optionnels
 */
import { describe, it, expect } from "vitest";
import {
  buildDeterministicHookSeed,
  pickDeterministicHook,
} from "../lib/npc/pick-deterministic-hook";

const baseInput = {
  projectId: "proj_42",
  rawDescription: "a grizzled dwarf blacksmith forging at dawn",
  universe: "fantasy",
  tone: "épique",
  sceneLocation: "forge",
};

const hooks = [
  "Un·e forgeron·ne qui teste la lame sur une pièce de fer",
  "Un·e forgeron·ne qui parle à ses marteaux",
  "Un·e forgeron·ne qui refuse de vendre son œuvre",
  "Un·e forgeron·ne prêt·e à affronter un voleur",
  "Un·e forgeron·ne qui chante en travaillant",
];

describe("pickDeterministicHook (P0.2)", () => {
  it("renvoie toujours le même hook pour une entrée donnée", () => {
    const r1 = pickDeterministicHook(hooks, baseInput);
    const r2 = pickDeterministicHook(hooks, baseInput);
    const r3 = pickDeterministicHook(hooks, baseInput);
    expect(r1).not.toBeNull();
    expect(r2).toBe(r1);
    expect(r3).toBe(r1);
  });

  it("renvoie null pour une liste vide (pas de throw)", () => {
    expect(pickDeterministicHook([], baseInput)).toBeNull();
  });

  it("normalise case + whitespace sur les champs optionnels", () => {
    const a = pickDeterministicHook(hooks, baseInput);
    const b = pickDeterministicHook(hooks, {
      ...baseInput,
      universe: "  FANTASY  ",
      tone: "Épique",
    });
    expect(a).toBe(b);
  });

  it("varie lorsqu'un champ significatif change (ex: rawDescription)", () => {
    const variants = [
      baseInput,
      { ...baseInput, rawDescription: "a dragon pacing in shadow" },
      { ...baseInput, rawDescription: "a child sneaking into the market" },
      { ...baseInput, rawDescription: "a masked assassin on a rooftop" },
      { ...baseInput, rawDescription: "a ghost weeping in a ruined chapel" },
    ];
    const results = new Set(variants.map((v) => pickDeterministicHook(hooks, v)));
    // On n'exige pas 5 valeurs distinctes (modulo n), mais au moins 2 pour
    // prouver que la sortie dépend effectivement de l'entrée.
    expect(results.size).toBeGreaterThanOrEqual(2);
  });

  it("la seed est stable et publique (pour debug / audit)", () => {
    const seed = buildDeterministicHookSeed(baseInput);
    expect(seed).toContain("proj_42");
    expect(seed).toContain("a grizzled dwarf blacksmith forging at dawn");
    expect(seed).toContain("fantasy");
  });

  it("projectId différent ⇒ seed différent (évite la fuite entre projets)", () => {
    const a = buildDeterministicHookSeed(baseInput);
    const b = buildDeterministicHookSeed({ ...baseInput, projectId: "proj_99" });
    expect(a).not.toBe(b);
  });
});
