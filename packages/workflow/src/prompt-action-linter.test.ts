import { describe, it, expect } from "vitest";
import { lintPromptAgainstActionContract } from "./prompt-action-linter";
import { actionContractForEnvelope } from "@manga-ai-studio/core";

describe("lintPromptAgainstActionContract — envelope=none", () => {
  const contract = actionContractForEnvelope("none");

  it("bloque les verbes de combat explicites", () => {
    const result = lintPromptAgainstActionContract({
      prompt: "a tense panel where she strikes the attacker",
      actionContract: contract,
    });
    expect(result.ok).toBe(false);
    expect(result.foundForbidden).toContain("strikes");
    expect(result.violations[0]?.code).toBe("forbidden_action_verb_in_prompt");
    expect(result.violations[0]?.severity).toBe("error");
  });

  it("remplace le verbe de combat par une formulation adoucie", () => {
    const result = lintPromptAgainstActionContract({
      prompt: "she strikes the wall",
      actionContract: contract,
    });
    expect(result.sanitisedPrompt).not.toMatch(/\bstrikes\b/i);
    expect(result.sanitisedPrompt).toContain("tense face-off");
  });

  it("attrape les stances de combat", () => {
    const result = lintPromptAgainstActionContract({
      prompt: "hero in combat stance, ready to parry",
      actionContract: contract,
    });
    expect(result.ok).toBe(false);
    expect(result.foundForbidden).toContain("combat stance");
    expect(result.foundForbidden).toContain("parry");
  });

  it("ne déclenche pas sur des mots qui contiennent un token banni (pas de false positive)", () => {
    // "attacker" (noun for the threat the beat does describe) shouldn't
    // trigger "attack" because we match on word boundaries.
    const result = lintPromptAgainstActionContract({
      prompt: "stabilise the scene with the attacker visible in the distance",
      actionContract: contract,
    });
    // "attack" is in the banlist but shouldn't match "attacker" (word boundary).
    expect(result.foundForbidden).not.toContain("attack");
    // "stabilise" shouldn't trigger "stab".
    expect(result.foundForbidden).not.toContain("stab");
  });
});

describe("lintPromptAgainstActionContract — envelope=combat_full", () => {
  const contract = actionContractForEnvelope("combat_full");

  it("laisse passer les verbes de combat puisque l'enveloppe les autorise", () => {
    const result = lintPromptAgainstActionContract({
      prompt: "the hero strikes the enemy with full force",
      actionContract: contract,
    });
    expect(result.ok).toBe(true);
    expect(result.foundForbidden).toEqual([]);
  });
});

describe("lintPromptAgainstActionContract — envelope=micro", () => {
  const contract = actionContractForEnvelope("micro");

  it("autorise la présence de l'arme mais bloque le coup", () => {
    const result = lintPromptAgainstActionContract({
      prompt: "she tightens her grip on the sword and stares",
      actionContract: contract,
    });
    expect(result.ok).toBe(true);
  });

  it("bloque une frappe même si l'arme est autorisée", () => {
    const result = lintPromptAgainstActionContract({
      prompt: "she slashes the air",
      actionContract: contract,
    });
    expect(result.ok).toBe(false);
    expect(result.foundForbidden).toContain("slashes");
  });
});
