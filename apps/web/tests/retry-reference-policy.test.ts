import { describe, expect, it } from "vitest";
import { inferImportantCharacterPresence, resolveRetryReferencePolicy } from "@/lib/images/retry-reference-policy";

describe("retry reference policy", () => {
  it("détecte un personnage important via rôles et héros", () => {
    expect(
      inferImportantCharacterPresence({
        heroCharacterId: "hero-1",
        panelCharacterRoles: ["hero", "ally"],
      }),
    ).toBe(true);
  });

  it("garde au moins LIGHT sur reroll environment si un lock réutilisable existe", () => {
    const decision = resolveRetryReferencePolicy({
      retryMode: "environment",
      metadata: {
        panelCharacterRoles: ["support"],
        characterIds: ["char-2"],
      },
      hasReusableCharacterLock: true,
    });

    expect(decision.referencePolicy).toBe("LIGHT");
    expect(decision.reason).toBe("preserve_light_lock_for_important_character");
  });

  it("retombe à NONE sur reroll composition sans personnage pertinent", () => {
    const decision = resolveRetryReferencePolicy({
      retryMode: "composition",
      metadata: {},
      hasReusableCharacterLock: false,
    });

    expect(decision.referencePolicy).toBe("NONE");
    expect(decision.reason).toBe("no_relevant_character_detected");
  });

  it("garde STRONG sur reroll character", () => {
    const decision = resolveRetryReferencePolicy({
      retryMode: "character",
      metadata: {
        panelCharacterRoles: ["hero"],
      },
      hasReusableCharacterLock: true,
    });

    expect(decision.referencePolicy).toBe("STRONG");
  });

  // ─── Tests premium ────────────────────────────────────────────────────────

  it("ne relâche pas les props si hasMandatoryProps=true", () => {
    const decision = resolveRetryReferencePolicy({
      retryMode: "environment",
      metadata: {},
      hasReusableCharacterLock: false,
      hasMandatoryProps: true,
    });

    expect(decision.relaxedConstraints).not.toContain("props");
    expect(decision.relaxedConstraints).not.toContain("required_props");
  });

  it("reroll prop utilise le goal prop_repair", () => {
    const decision = resolveRetryReferencePolicy({
      retryMode: "prop",
      metadata: { heroCharacterId: "hero-1" },
      hasReusableCharacterLock: true,
      hasFingerprint: true,
    });

    expect(decision.rerollGoal).toBe("prop_repair");
    expect(decision.positivePromptHint).toContain("required prop clearly visible");
    expect(decision.negativePromptHint).toContain("missing object");
  });

  it("reroll prop conserve character_fingerprint et environment_context", () => {
    const decision = resolveRetryReferencePolicy({
      retryMode: "prop",
      metadata: { heroCharacterId: "hero-1" },
      hasReusableCharacterLock: true,
      hasFingerprint: true,
      hasLookProfile: true,
    });

    expect(decision.preservedConstraints).toContain("character_fingerprint");
    expect(decision.preservedConstraints).toContain("environment_context");
  });

  it("reroll enemy_presence utilise le goal enemy_focus_repair", () => {
    const decision = resolveRetryReferencePolicy({
      retryMode: "enemy_presence",
      metadata: {},
      hasReusableCharacterLock: false,
    });

    expect(decision.rerollGoal).toBe("enemy_focus_repair");
    expect(decision.positivePromptHint).toContain("enemy clearly present");
    expect(decision.negativePromptHint).toContain("hero-centered replacement");
  });

  it("reroll speaker utilise le goal speaker_anchor_repair", () => {
    const decision = resolveRetryReferencePolicy({
      retryMode: "speaker",
      metadata: { heroCharacterId: "hero-1" },
      hasReusableCharacterLock: true,
      hasFingerprint: true,
    });

    expect(decision.rerollGoal).toBe("speaker_anchor_repair");
    expect(decision.positivePromptHint).toContain("speaker visible");
  });

  it("reroll cutaway utilise le goal cutaway_repair avec prompt anti-portrait", () => {
    const decision = resolveRetryReferencePolicy({
      retryMode: "cutaway",
      metadata: {},
      hasReusableCharacterLock: false,
    });

    expect(decision.rerollGoal).toBe("cutaway_repair");
    expect(decision.positivePromptHint).toContain("environment cutaway");
    expect(decision.negativePromptHint).toContain("hero portrait");
  });

  it("reroll subject_focus ne casse pas le prop obligatoire", () => {
    const decision = resolveRetryReferencePolicy({
      retryMode: "subject_focus",
      metadata: {},
      hasReusableCharacterLock: false,
      hasMandatoryProps: true,
    });

    expect(decision.rerollGoal).toBe("subject_focus_repair");
    expect(decision.relaxedConstraints).not.toContain("props");
  });

  it("reroll npc_population utilise le goal population_repair", () => {
    const decision = resolveRetryReferencePolicy({
      retryMode: "npc_population",
      metadata: {},
      hasReusableCharacterLock: false,
    });

    expect(decision.rerollGoal).toBe("population_repair");
    expect(decision.positivePromptHint).toBeDefined();
    expect(decision.positivePromptHint).not.toBe("");
  });

  it("les 6 modes premium ont tous un positivePromptHint non vide", () => {
    const premiumModes = ["prop", "speaker", "enemy_presence", "subject_focus", "cutaway", "npc_population"] as const;
    for (const mode of premiumModes) {
      const decision = resolveRetryReferencePolicy({
        retryMode: mode,
        metadata: {},
        hasReusableCharacterLock: false,
      });
      expect(decision.positivePromptHint, `mode ${mode} doit avoir un positivePromptHint`).toBeTruthy();
      expect(decision.negativePromptHint, `mode ${mode} doit avoir un negativePromptHint`).toBeTruthy();
    }
  });

  // ─── T3 : Tests rerollKind et contraintes ─────────────────────────────────

  it("prop retourne un rerollKind REROLL_PROP", () => {
    const decision = resolveRetryReferencePolicy({
      retryMode: "prop",
      metadata: {},
      hasReusableCharacterLock: false,
    });
    expect(decision.rerollKind).toBe("REROLL_PROP");
  });

  it("speaker_anchor retourne un negativePromptHint non vide et rerollKind REROLL_SPEAKER_ANCHOR", () => {
    const decision = resolveRetryReferencePolicy({
      retryMode: "speaker",
      metadata: {},
      hasReusableCharacterLock: false,
    });
    expect(decision.negativePromptHint).toBeTruthy();
    expect(decision.rerollKind).toBe("REROLL_SPEAKER_ANCHOR");
  });

  it("enemy_presence retourne rerollKind REROLL_ENEMY_PRESENCE", () => {
    const decision = resolveRetryReferencePolicy({
      retryMode: "enemy_presence",
      metadata: {},
      hasReusableCharacterLock: false,
    });
    expect(decision.rerollKind).toBe("REROLL_ENEMY_PRESENCE");
  });

  it("subject_focus retourne des contraintes préservées correctes avec scene_anchor", () => {
    const decision = resolveRetryReferencePolicy({
      retryMode: "subject_focus",
      metadata: {},
      hasReusableCharacterLock: false,
      hasSceneAnchor: true,
    });
    expect(decision.rerollKind).toBe("REROLL_SUBJECT_FOCUS");
    expect(decision.preservedConstraints).toContain("scene_anchor");
  });

  it("cutaway interdit la relaxation du sujet ciblé et retourne rerollKind REROLL_CUTAWAY", () => {
    const decision = resolveRetryReferencePolicy({
      retryMode: "cutaway",
      metadata: {},
      hasReusableCharacterLock: false,
    });
    expect(decision.rerollKind).toBe("REROLL_CUTAWAY");
    expect(decision.relaxedConstraints).not.toContain("subject");
    expect(decision.relaxedConstraints).not.toContain("required_props");
  });

  it("npc_population n'écrase pas les hard locks personnage", () => {
    const decision = resolveRetryReferencePolicy({
      retryMode: "npc_population",
      metadata: { heroCharacterId: "hero-1" },
      hasReusableCharacterLock: true,
      hasFingerprint: true,
    });
    expect(decision.rerollKind).toBe("REROLL_NPC_POPULATION");
    expect(decision.preservedConstraints).toContain("character_fingerprint");
    expect(decision.preservedConstraints).toContain("character_identity");
  });

  it("si props obligatoires présents, ils ne sont jamais dans relaxedConstraints", () => {
    const premiumModes = ["prop", "speaker", "enemy_presence", "subject_focus", "cutaway", "npc_population"] as const;
    for (const mode of premiumModes) {
      const decision = resolveRetryReferencePolicy({
        retryMode: mode,
        metadata: {},
        hasReusableCharacterLock: false,
        hasMandatoryProps: true,
      });
      expect(decision.relaxedConstraints, `mode ${mode} ne doit pas relâcher les props`).not.toContain("props");
      expect(decision.relaxedConstraints, `mode ${mode} ne doit pas relâcher required_props`).not.toContain("required_props");
    }
  });
});
