/**
 * AUDIT COMMIT 4 — Les augments legacy doivent rester compacts et le
 * `locationMarkersLine` trop long doit être tronqué avant concaténation.
 * On s'assure aussi que l'ordre specialized > legacy > user est préservé.
 */
import { describe, it, expect } from "vitest";
import { buildRetryPrompts, compactPromptSnippet } from "@/lib/retry/build-retry-prompts";

describe("compactPromptSnippet", () => {
  it("retourne la chaîne inchangée sous la limite", () => {
    expect(compactPromptSnippet("short value", 180)).toBe("short value");
  });

  it("tronque proprement sur une virgule avant max", () => {
    const value = "alpha, beta, gamma, delta, epsilon, zeta, eta, theta";
    const out = compactPromptSnippet(value, 25);
    expect(out.length).toBeLessThanOrEqual(25);
    expect(out.endsWith(",")).toBe(false);
  });

  it("retourne vide pour une entrée vide", () => {
    expect(compactPromptSnippet("", 180)).toBe("");
  });
});

describe("buildRetryPrompts — AUDIT COMMIT 4", () => {
  const emptyDecision = { positivePromptHint: null, negativePromptHint: null };

  it("mode environment : utilise un hint compact, pas l'ancien texte bavard", () => {
    const out = buildRetryPrompts({
      retryMode: "environment",
      retryReferenceDecision: emptyDecision,
      characterHints: null,
      locationMarkersLine: "",
    });
    expect(out.positiveAugment).toBe("environment continuity, readable architecture");
    expect(out.positiveAugment).not.toContain("strong background");
    expect(out.negativeAugment).toBe("empty background, flat backdrop");
  });

  it("mode composition : hint compact + locationMarkersLine tronquée à 160 chars", () => {
    const longLocation = "x".repeat(400);
    const out = buildRetryPrompts({
      retryMode: "composition",
      retryReferenceDecision: emptyDecision,
      characterHints: null,
      locationMarkersLine: longLocation,
    });
    expect(out.positiveAugment.startsWith("clear staging, readable framing")).toBe(true);
    expect(out.positiveAugment.length).toBeLessThanOrEqual(160 + "clear staging, readable framing, ".length + 5);
  });

  it("mode interaction : hint bref et négatif bref", () => {
    const out = buildRetryPrompts({
      retryMode: "interaction",
      retryReferenceDecision: emptyDecision,
      characterHints: null,
      locationMarkersLine: "",
    });
    expect(out.positiveAugment).toBe("clear interaction");
    expect(out.negativeAugment).toBe("disconnected characters");
  });

  it("ordre specialized > legacy > user est préservé", () => {
    const out = buildRetryPrompts({
      retryMode: "environment",
      retryReferenceDecision: {
        positivePromptHint: "SPECIALIZED_HINT",
        negativePromptHint: "SPECIALIZED_NEG",
      },
      characterHints: null,
      locationMarkersLine: "some markers",
      userPromptAdditions: "USER_ADD",
      userPromptExclusions: "USER_EXCL",
    });
    // specialized écrase legacy
    expect(out.positiveAugment.startsWith("SPECIALIZED_HINT")).toBe(true);
    // user append en fin
    expect(out.positiveAugment.endsWith("USER_ADD")).toBe(true);
    expect(out.negativeAugment.startsWith("SPECIALIZED_NEG")).toBe(true);
    expect(out.negativeAugment.endsWith("USER_EXCL")).toBe(true);
  });

  it("user additions sont plafonnées à 400/200 chars", () => {
    const out = buildRetryPrompts({
      retryMode: null,
      retryReferenceDecision: emptyDecision,
      characterHints: null,
      locationMarkersLine: "",
      userPromptAdditions: "a".repeat(600),
      userPromptExclusions: "b".repeat(300),
    });
    expect(out.userPositive.length).toBe(400);
    expect(out.userNegative.length).toBe(200);
  });
});
