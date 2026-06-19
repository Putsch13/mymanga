import { describe, expect, it } from "vitest";
import type { RequiredVisualCoverage } from "./required-visual-coverage";
import { sanitizeVisualContractBeforeCoverage } from "./sanitize-visual-contract";

function propCov(entity: string, tokens: string[]): RequiredVisualCoverage {
  return {
    entity,
    entityType: "prop",
    sourceBeatId: "b1",
    requiresDedicatedPanel: false,
    acceptedRenderModes: ["insert_object"],
    acceptedSubjectFocuses: ["prop"],
    tokensHint: tokens,
    fulfilledByPanelIds: [],
  };
}

describe("sanitizeVisualContractBeforeCoverage", () => {
  it("rejette les props tech absentes de l’outline", () => {
    const r = sanitizeVisualContractBeforeCoverage({
      requiredCoverage: [propCov("laptop", ["laptop"])],
      outlineText: "Au port, les pêcheurs déchargent les caisses sur le quai.",
      knownCharacters: [{ id: "c1", name: "Eryon" }],
    });
    expect(r.requiredConfirmed).toHaveLength(0);
    expect(r.rejected.length).toBeGreaterThanOrEqual(1);
  });

  it("confirme les props explicitement évoqués", () => {
    const r = sanitizeVisualContractBeforeCoverage({
      requiredCoverage: [propCov("clavier", ["clavier", "keyboard"])],
      outlineText: "Il frappe nerveusement sur le clavier du terminal.",
      knownCharacters: [{ id: "c1", name: "Eryon" }],
    });
    expect(r.requiredConfirmed.length).toBe(1);
    expect(r.rejected).toHaveLength(0);
  });

  it("rejette les personnages inconnus non cités dans l’outline", () => {
    const r = sanitizeVisualContractBeforeCoverage({
      requiredCoverage: [
        {
          entity: "inconnu",
          entityType: "character",
          sourceBeatId: "b1",
          requiresDedicatedPanel: false,
          acceptedRenderModes: ["hero_closeup"],
          acceptedSubjectFocuses: ["hero"],
          tokensHint: [],
          fulfilledByPanelIds: [],
        },
      ],
      outlineText: "Sa décision change tout. Leurs regards se croisent.",
      knownCharacters: [{ id: "hero", name: "Eryon" }],
    });
    expect(r.requiredConfirmed).toHaveLength(0);
  });

  it("auto_strip : créature dédiée absente de l’outline → rejetée (pas confirmée)", () => {
    const r = sanitizeVisualContractBeforeCoverage({
      requiredCoverage: [
        {
          entity: "wyrm fantôme",
          entityType: "creature",
          sourceBeatId: "b1",
          requiresDedicatedPanel: true,
          acceptedRenderModes: ["creature_reveal"],
          acceptedSubjectFocuses: ["creature"],
          tokensHint: ["wyrm"],
          fulfilledByPanelIds: [],
        },
      ],
      outlineText: "Ils marchent dans la ville sans incident.",
      knownCharacters: [{ id: "c1", name: "Eryon" }],
      parasitePolicy: "auto_strip",
    });
    expect(r.requiredConfirmed).toHaveLength(0);
    expect(r.rejected.length).toBe(1);
  });

  it("keep_all : créature dédiée absente de l’outline reste confirmée (historique)", () => {
    const r = sanitizeVisualContractBeforeCoverage({
      requiredCoverage: [
        {
          entity: "wyrm fantôme",
          entityType: "creature",
          sourceBeatId: "b1",
          requiresDedicatedPanel: true,
          acceptedRenderModes: ["creature_reveal"],
          acceptedSubjectFocuses: ["creature"],
          tokensHint: ["wyrm"],
          fulfilledByPanelIds: [],
        },
      ],
      outlineText: "Ils marchent dans la ville sans incident.",
      knownCharacters: [{ id: "c1", name: "Eryon" }],
      parasitePolicy: "keep_all",
    });
    expect(r.requiredConfirmed).toHaveLength(1);
    expect(r.suspicious).toHaveLength(1);
  });
});
