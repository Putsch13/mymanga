/**
 * P2.1 (sprint 3) — Tests du guard "refuse asset non canonique" pour la
 * route `/api/characters/[characterId]/generate-visual`.
 *
 * Règles métier vérifiées :
 *   1. Un character vierge (aucun ref, aucun lock, aucun LoRA, pas de canon
 *      lock, pas de fingerprint) N'attend PAS de lock → la génération est
 *      autorisée même sans ref canonique.
 *   2. Un character avec `canonLocked=true` attend un lock → doit être refusé
 *      si la génération arrive sans ref stable ni LoRA.
 *   3. Un character avec déjà ≥ 1 visualRef stable attend un lock → doit
 *      être refusé si la liste résolue canonique est vide (→ signal que
 *      les refs ne sont plus stables).
 *   4. `LoRA actif` seul suffit à débloquer la génération (car on a un
 *      guide d'identité alternatif via trigger word + poids LoRA).
 *   5. `fingerprint` existant seul impose aussi un lock.
 *   6. `resolveCharacterReferencePolicy` : `STRONG` quand un lock est attendu,
 *      `LIGHT` sinon.
 */

import { describe, it, expect } from "vitest";
import {
  isCharacterLockExpected,
  resolveCharacterReferencePolicy,
  shouldRefuseCharacterVisualForMissingRefs,
  type CharacterLockState,
} from "@/lib/characters/generate-visual-guards";

function state(overrides: Partial<CharacterLockState> = {}): CharacterLockState {
  return {
    visualRefsCount: 0,
    visualLocksCount: 0,
    activeLoraCount: 0,
    canonLocked: false,
    hasFingerprint: false,
    ...overrides,
  };
}

describe("isCharacterLockExpected (P2.1)", () => {
  it("retourne false pour un character vierge", () => {
    expect(isCharacterLockExpected(state())).toBe(false);
  });

  it("retourne true dès qu'un visualRef existe", () => {
    expect(isCharacterLockExpected(state({ visualRefsCount: 1 }))).toBe(true);
  });

  it("retourne true dès qu'un visualLock existe", () => {
    expect(isCharacterLockExpected(state({ visualLocksCount: 1 }))).toBe(true);
  });

  it("retourne true dès qu'un LoRA actif est attaché", () => {
    expect(isCharacterLockExpected(state({ activeLoraCount: 1 }))).toBe(true);
  });

  it("retourne true si canonLocked=true", () => {
    expect(isCharacterLockExpected(state({ canonLocked: true }))).toBe(true);
  });

  it("retourne true si hasFingerprint=true", () => {
    expect(isCharacterLockExpected(state({ hasFingerprint: true }))).toBe(true);
  });
});

describe("shouldRefuseCharacterVisualForMissingRefs (P2.1)", () => {
  it("character vierge : n'est pas refusé même sans ref ni LoRA", () => {
    expect(
      shouldRefuseCharacterVisualForMissingRefs({
        state: state(),
        stableRefUrlCount: 0,
        activeLoraCount: 0,
      }),
    ).toBe(false);
  });

  it("canonLocked=true sans ref ni LoRA → REFUSE (422)", () => {
    expect(
      shouldRefuseCharacterVisualForMissingRefs({
        state: state({ canonLocked: true }),
        stableRefUrlCount: 0,
        activeLoraCount: 0,
      }),
    ).toBe(true);
  });

  it("visualRefsCount>0 (DB) mais refs résolues canoniques vides → REFUSE (signal drift)", () => {
    expect(
      shouldRefuseCharacterVisualForMissingRefs({
        state: state({ visualRefsCount: 3 }),
        stableRefUrlCount: 0,
        activeLoraCount: 0,
      }),
    ).toBe(true);
  });

  it("LoRA actif seul suffit à NE PAS refuser", () => {
    expect(
      shouldRefuseCharacterVisualForMissingRefs({
        state: state({ canonLocked: true }),
        stableRefUrlCount: 0,
        activeLoraCount: 1,
      }),
    ).toBe(false);
  });

  it("refs stables seules (sans LoRA) suffisent à NE PAS refuser", () => {
    expect(
      shouldRefuseCharacterVisualForMissingRefs({
        state: state({ visualRefsCount: 1 }),
        stableRefUrlCount: 2,
        activeLoraCount: 0,
      }),
    ).toBe(false);
  });

  it("fingerprint seul → lock attendu → REFUSE si rien d'autre", () => {
    expect(
      shouldRefuseCharacterVisualForMissingRefs({
        state: state({ hasFingerprint: true }),
        stableRefUrlCount: 0,
        activeLoraCount: 0,
      }),
    ).toBe(true);
  });
});

describe("resolveCharacterReferencePolicy (P2.1)", () => {
  it("retourne STRONG quand le lock est attendu", () => {
    expect(resolveCharacterReferencePolicy(state({ canonLocked: true }))).toBe("STRONG");
    expect(resolveCharacterReferencePolicy(state({ visualLocksCount: 2 }))).toBe("STRONG");
    expect(resolveCharacterReferencePolicy(state({ activeLoraCount: 1 }))).toBe("STRONG");
  });

  it("retourne LIGHT pour un character vierge", () => {
    expect(resolveCharacterReferencePolicy(state())).toBe("LIGHT");
  });
});
