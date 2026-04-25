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
});
