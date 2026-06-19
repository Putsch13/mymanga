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

    // TODO-15 — Splitter sur les conjonctions narratives ("puis", "ensuite",
    // "mais", etc.) pour ne pas écraser une phrase complexe en 1 seul event.
    it("TODO-15: splits events on narrative conjunctions (puis/ensuite/mais)", () => {
      const result = buildIntentNarrativeContract({
        chapterId: "ch1",
        userIntent:
          "Lux entre dans le temple puis récupère l'artefact mais une voix le met en garde",
      });
      // Avant ce TODO : 1 event (toute la phrase). Après : 3 events distincts.
      expect(result.requiredEvents.length).toBeGreaterThanOrEqual(3);
      const labels = result.requiredEvents.map((e) => e.label.toLowerCase());
      expect(labels.some((l) => l.includes("temple"))).toBe(true);
      expect(labels.some((l) => l.includes("artefact"))).toBe(true);
      expect(labels.some((l) => l.includes("garde"))).toBe(true);
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

    // ---------------------------------------------------------------------
    // TODO-12 (CRITIQUE) — Pronoun resolution + unified knownCharacters
    // ---------------------------------------------------------------------
    describe("TODO-12 pronoun resolution", () => {
      it("résout 'lui' vers le co-protagoniste sélectionné (Lux et lui)", () => {
        const result = buildIntentNarrativeContract({
          chapterId: "ch1",
          userIntent: "Lux et lui découvrent un temple dans la jungle.",
          knownCharacters: [
            { id: "lux_id", name: "Lux", roleType: "hero" },
            { id: "kai_id", name: "Kai", roleType: "secondary_hero" },
          ],
          selectedCharacterIds: ["lux_id", "kai_id"],
        });
        expect(result.requiredCharacters).toContain("lux_id");
        expect(result.requiredCharacters).toContain("kai_id");
      });

      it("ne résout pas 'lui' vers un personnage non sélectionné", () => {
        const result = buildIntentNarrativeContract({
          chapterId: "ch1",
          userIntent: "Lux et lui partent en mission.",
          knownCharacters: [
            { id: "lux_id", name: "Lux", roleType: "hero" },
            { id: "kai_id", name: "Kai", roleType: "secondary_hero" },
            { id: "rogue_id", name: "Rogue", roleType: "secondary_hero" },
          ],
          selectedCharacterIds: ["lux_id", "kai_id"],
        });
        expect(result.requiredCharacters).toContain("lux_id");
        expect(result.requiredCharacters).toContain("kai_id");
        expect(result.requiredCharacters).not.toContain("rogue_id");
      });

      it("résout 'son frère' vers le personnage avec roleType brother/sibling", () => {
        const result = buildIntentNarrativeContract({
          chapterId: "ch1",
          userIntent: "Aya retrouve son frère après des années.",
          knownCharacters: [
            { id: "aya_id", name: "Aya", roleType: "hero" },
            { id: "ren_id", name: "Ren", roleType: "brother" },
          ],
          selectedCharacterIds: ["aya_id", "ren_id"],
        });
        expect(result.requiredCharacters).toContain("aya_id");
        expect(result.requiredCharacters).toContain("ren_id");
      });

      it("ne double-counte pas un personnage déjà mentionné par son nom", () => {
        const result = buildIntentNarrativeContract({
          chapterId: "ch1",
          userIntent: "Lux part avec Kai. Lui propose un plan audacieux.",
          knownCharacters: [
            { id: "lux_id", name: "Lux", roleType: "hero" },
            { id: "kai_id", name: "Kai", roleType: "secondary_hero" },
          ],
          selectedCharacterIds: ["lux_id", "kai_id"],
        });
        const kaiOccurrences = result.requiredCharacters.filter(
          (id) => id === "kai_id",
        ).length;
        expect(kaiOccurrences).toBe(1);
      });

      it("legacy : accepte les arrays parallèles knownCharacterIds + knownCharacterNames pour rétrocompat", () => {
        const result = buildIntentNarrativeContract({
          chapterId: "ch1",
          userIntent: "Akira affronte son rival",
          knownCharacterIds: ["char_1", "char_2"],
          knownCharacterNames: ["Akira", "Suko"],
        });
        expect(result.requiredCharacters).toContain("char_1");
        expect(result.requiredCharacters).not.toContain("char_2");
      });

      it("'Lux et lui' avec aucun selectedCharacterIds : pronoun reste non résolu (sécurité)", () => {
        const result = buildIntentNarrativeContract({
          chapterId: "ch1",
          userIntent: "Lux et lui partent à l'aventure.",
          knownCharacters: [
            { id: "lux_id", name: "Lux", roleType: "hero" },
            { id: "kai_id", name: "Kai", roleType: "secondary_hero" },
            { id: "rogue_id", name: "Rogue", roleType: "secondary_hero" },
          ],
          // Aucune sélection : on tombe dans l'ancien comportement (pronom non scopé).
          // On accepte que `lui` soit résolu vers le PREMIER candidat secondaire,
          // mais pas vers tous.
        });
        expect(result.requiredCharacters).toContain("lux_id");
        const secondaryResolved = result.requiredCharacters.filter((id) =>
          ["kai_id", "rogue_id"].includes(id),
        );
        expect(secondaryResolved.length).toBeLessThanOrEqual(1);
      });
    });
  });
});
