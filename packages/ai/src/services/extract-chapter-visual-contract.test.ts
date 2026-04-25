import { describe, expect, it } from "vitest";
import type { ChapterVisualContract } from "../contracts/chapter-visual-contract";
import type { RequiredVisualCoverage } from "./required-visual-coverage";
import {
  mergeRequiredVisualCoverageWithContract,
  requiredVisualCoverageFromChapterVisualContract,
} from "./extract-chapter-visual-contract";

describe("requiredVisualCoverageFromChapterVisualContract", () => {
  it("produit des obligations pour les slices required", () => {
    const contract: ChapterVisualContract = {
      mainLocation: {
        name: "Port du matin",
        description: "Quai animé",
        confidence: 0.9,
        sourceBeatIds: ["b1"],
        importance: "required",
      },
      secondaryLocations: [],
      characters: [
        {
          name: "Eryon",
          role: "main",
          knownCharacterId: "c_hero",
          confidence: 0.95,
          sourceBeatIds: ["b1"],
          importance: "required",
        },
      ],
      groups: [],
      creatures: [
        {
          name: "Chevalier-luciole mécanique",
          kind: "hybrid",
          description: "Hybride insecte et armure",
          confidence: 0.88,
          sourceBeatIds: ["b1"],
          importance: "required",
        },
      ],
      props: [
        {
          name: "Lanterne suspendue",
          description: "",
          importance: "required",
          confidence: 0.8,
          sourceBeatIds: ["b1"],
        },
      ],
      ambientElements: [],
      rejectedOrUnrelated: [],
    };

    const cov = requiredVisualCoverageFromChapterVisualContract(contract);
    const types = new Set(cov.map((c) => c.entityType));
    expect(types.has("location")).toBe(true);
    expect(types.has("character")).toBe(true);
    expect(types.has("creature")).toBe(true);
    expect(types.has("prop")).toBe(true);
  });
});

describe("mergeRequiredVisualCoverageWithContract", () => {
  it("le contrat prime sur une entité dupliquée dans la base", () => {
    const base: RequiredVisualCoverage[] = [
      {
        entity: "laptop",
        entityType: "prop",
        sourceBeatId: "b1",
        requiresDedicatedPanel: false,
        acceptedRenderModes: ["insert_object"],
        acceptedSubjectFocuses: ["prop"],
        tokensHint: ["laptop"],
        fulfilledByPanelIds: [],
      },
    ];
    const fromContract: RequiredVisualCoverage[] = [
      {
        entity: "port du matin",
        entityType: "location",
        sourceBeatId: "b1",
        requiresDedicatedPanel: false,
        acceptedRenderModes: ["establishing_environment"],
        acceptedSubjectFocuses: ["environment"],
        tokensHint: ["port"],
        fulfilledByPanelIds: [],
      },
      {
        entity: "laptop",
        entityType: "prop",
        sourceBeatId: "b2",
        requiresDedicatedPanel: false,
        acceptedRenderModes: ["insert_object"],
        acceptedSubjectFocuses: ["prop"],
        tokensHint: ["laptop"],
        fulfilledByPanelIds: [],
      },
    ];
    const merged = mergeRequiredVisualCoverageWithContract(fromContract, base);
    const laptops = merged.filter((m) => m.entity === "laptop");
    expect(laptops).toHaveLength(1);
    expect(laptops[0]!.sourceBeatId).toBe("b2");
  });
});
