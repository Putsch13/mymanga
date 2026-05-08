import { describe, it, expect } from "vitest";
import { buildIntentNarrativeContract, parseIntentNarrativeContract } from "./intent-narrative-contract";

describe("IntentNarrativeContract", () => {
  describe("parseIntentNarrativeContract", () => {
    it("parses a minimal valid contract", () => {
      const contract = parseIntentNarrativeContract({
        version: 1,
        chapterId: "ch1",
        storyFacts: ["fact1"],
        requiredEvents: [],
      });
      expect(contract.chapterId).toBe("ch1");
      expect(contract.storyFacts).toEqual(["fact1"]);
    });

    it("rejects missing chapterId", () => {
      expect(() => parseIntentNarrativeContract({ version: 1 })).toThrow();
    });

    it("normalizes requiredEvent type from array", () => {
      const contract = parseIntentNarrativeContract({
        version: 1,
        chapterId: "ch1",
        requiredEvents: [
          { id: "e1", label: "test", type: ["dialogue"], actors: [] },
        ],
      });
      expect(contract.requiredEvents[0].type).toBe("dialogue");
    });
  });

  describe("buildIntentNarrativeContract", () => {
    it("extracts events from sentences", () => {
      const result = buildIntentNarrativeContract({
        chapterId: "ch1",
        userIntent: "Le héros entre dans la taverne. Il découvre un passage secret. Le rival crie une menace.",
      });
      expect(result.requiredEvents.length).toBe(3);
      expect(result.requiredEvents[2].requiredDialogue).toBe(true);
      expect(result.requiredEvents[2].type).toBe("dialogue");
    });

    it("detects known characters in intent", () => {
      const result = buildIntentNarrativeContract({
        chapterId: "ch1",
        userIntent: "Akira affronte son rival dans l'arène",
        knownCharacterIds: ["char_1", "char_2"],
        knownCharacterNames: ["Akira", "Suko"],
      });
      expect(result.requiredCharacters).toContain("char_1");
      expect(result.requiredCharacters).not.toContain("char_2");
    });

    it("detects known locations in intent", () => {
      const result = buildIntentNarrativeContract({
        chapterId: "ch1",
        userIntent: "L'action se passe dans le Port de Kaze",
        knownLocationNames: ["Port de Kaze", "Forêt sombre"],
      });
      expect(result.requiredLocations).toContain("Port de Kaze");
      expect(result.requiredLocations).not.toContain("Forêt sombre");
    });

    // ARCH-4 — Visual World anchoring
    it("anchors required locations to VisualWorld ids when provided", () => {
      const result = buildIntentNarrativeContract({
        chapterId: "ch1",
        userIntent: "Marius part en mer depuis le Port de Kaze",
        knownLocationNames: ["Port de Kaze"],
        visualWorldLocations: [
          { id: "loc_port_kaze", canonicalName: "Port de Kaze" },
          { id: "loc_open_sea", canonicalName: "Pleine mer" },
        ],
      });
      // The plain-name list still contains the human label
      expect(result.requiredLocations).toContain("Port de Kaze");
      // The new ARCH-4 ids list contains the matched VW id
      expect(result.requiredLocationIds).toContain("loc_port_kaze");
      expect(result.requiredLocationIds).not.toContain("loc_open_sea");
    });

    it("anchors required NPC groups to VisualWorld ids when provided", () => {
      const result = buildIntentNarrativeContract({
        chapterId: "ch1",
        userIntent: "Les pêcheurs préviennent Marius du danger",
        visualWorldNpcGroups: [
          { id: "npc_grp_pecheurs_kaze", label: "Pêcheurs", role: "population" },
        ],
      });
      const fishGroup = result.requiredNpcGroups.find((g) =>
        g.label.toLowerCase().includes("pêcheur"),
      );
      expect(fishGroup).toBeDefined();
      expect(fishGroup?.vwNpcGroupId).toBe("npc_grp_pecheurs_kaze");
    });

    it("populates locationHint on events when a VW location is mentioned in the sentence", () => {
      const result = buildIntentNarrativeContract({
        chapterId: "ch1",
        userIntent: "Marius arrive au Port de Kaze. Il rencontre Maya plus loin.",
        visualWorldLocations: [{ id: "loc_port_kaze", canonicalName: "Port de Kaze" }],
      });
      const firstEvt = result.requiredEvents[0];
      expect(firstEvt?.locationHint).toBe("loc_port_kaze");
      const secondEvt = result.requiredEvents[1];
      expect(secondEvt?.locationHint).toBeNull();
    });
  });
});
