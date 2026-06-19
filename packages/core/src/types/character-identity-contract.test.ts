import { describe, it, expect } from "vitest";
import {
  assertCloseupHasFaceReference,
  buildCharacterIdentityContract,
  type CharacterIdentityContract,
} from "./character-identity-contract";

function baseContract(
  overrides: Partial<CharacterIdentityContract> = {},
): CharacterIdentityContract {
  return {
    contractVersion: "1.0.0",
    characterId: "c1",
    displayName: "Kaito",
    role: "hero",
    lockVersion: 1,
    stableVisualDNA: { hairColor: "black", eyeColor: "red", permanentMarkers: [] },
    canonicalRefUrls: ["https://cdn/ref.jpg"],
    faceReferenceUrl: "https://cdn/face.jpg",
    actionReferenceUrl: "https://cdn/body.jpg",
    forbiddenDrift: [],
    requiredPromptTokens: [],
    forbiddenPromptTokens: [],
    ...overrides,
  };
}

describe("assertCloseupHasFaceReference", () => {
  it("passe sur un wide shot", () => {
    const r = assertCloseupHasFaceReference({
      shotType: "wide",
      focusCharacterId: "c1",
      contract: baseContract({ faceReferenceUrl: null }),
    });
    expect(r.ok).toBe(true);
  });

  it("bloque un closeup sans faceReferenceUrl", () => {
    const r = assertCloseupHasFaceReference({
      shotType: "closeup",
      focusCharacterId: "c1",
      contract: baseContract({ faceReferenceUrl: null }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("closeup_without_face_reference");
  });

  it("bloque un closeup sans contract", () => {
    const r = assertCloseupHasFaceReference({
      shotType: "closeup",
      focusCharacterId: "c1",
      contract: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("contract_missing");
  });

  it("laisse passer un extreme_closeup avec face ref", () => {
    const r = assertCloseupHasFaceReference({
      shotType: "extreme_closeup",
      focusCharacterId: "c1",
      contract: baseContract(),
    });
    expect(r.ok).toBe(true);
  });

  it("ignore un closeup sans focusCharacterId (décor / détail)", () => {
    const r = assertCloseupHasFaceReference({
      shotType: "closeup",
      focusCharacterId: null,
      contract: null,
    });
    expect(r.ok).toBe(true);
  });
});

describe("buildCharacterIdentityContract", () => {
  it("copie la version du lock et ses URLs", () => {
    const c = buildCharacterIdentityContract({
      characterId: "c1",
      displayName: "Kaito",
      role: "hero",
      activeLock: {
        version: 5,
        faceCloseupAssetUrl: "https://cdn/face.jpg",
        actionRefAssetUrl: "https://cdn/body.jpg",
        canonicalRefUrls: ["https://cdn/a.jpg", "https://cdn/b.jpg"],
        triggerWord: "ohwx",
      },
    });
    expect(c.lockVersion).toBe(5);
    expect(c.faceReferenceUrl).toBe("https://cdn/face.jpg");
    expect(c.canonicalRefUrls).toHaveLength(2);
    expect(c.requiredPromptTokens).toContain("ohwx");
  });

  it("forbiddenDrift inclut hair_color quand la stable DNA a hairColor", () => {
    const c = buildCharacterIdentityContract({
      characterId: "c1",
      displayName: "Yuki",
      role: "important_npc",
      activeLock: null,
      stableVisualDNA: { hairColor: "silver", eyeColor: "blue" },
    });
    expect(c.forbiddenDrift).toContain("hair_color");
    expect(c.forbiddenDrift).toContain("eye_color");
  });

  it("contract sans lock actif → lockVersion null + URLs vides", () => {
    const c = buildCharacterIdentityContract({
      characterId: "c1",
      displayName: "Yuki",
      role: "npc",
      activeLock: null,
    });
    expect(c.lockVersion).toBeNull();
    expect(c.faceReferenceUrl).toBeNull();
    expect(c.actionReferenceUrl).toBeNull();
    expect(c.canonicalRefUrls).toEqual([]);
  });

  it("dédupe les listes de tokens et de forbiddenDrift", () => {
    const c = buildCharacterIdentityContract({
      characterId: "c1",
      displayName: "Yuki",
      role: "hero",
      activeLock: {
        version: 1,
        faceCloseupAssetUrl: null,
        actionRefAssetUrl: null,
        canonicalRefUrls: [],
        triggerWord: "tw",
      },
      extraRequiredTokens: ["tw", "dynamic_pose"],
      extraForbiddenTokens: ["realistic", "realistic"],
      requiresCanonApprovalFor: ["hair_color"],
      stableVisualDNA: { hairColor: "silver" },
    });
    expect(c.requiredPromptTokens.filter((t) => t === "tw")).toHaveLength(1);
    expect(c.forbiddenPromptTokens.filter((t) => t === "realistic")).toHaveLength(1);
    expect(c.forbiddenDrift.filter((t) => t === "hair_color")).toHaveLength(1);
  });
});
