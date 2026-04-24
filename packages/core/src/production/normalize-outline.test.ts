import { describe, it, expect } from "vitest";
import { normalizeOutline, safeNormalizeOutline, type NormalizedBeat } from "./normalize-outline";

describe("normalize-outline", () => {
  describe("normalizeOutline", () => {
    it("should handle outline with involvedCharacters array", () => {
      const raw = {
        source: "test",
        chapterGoal: "Test chapter",
        beats: [
          {
            beatId: "beat_1",
            summary: "Hero enters the scene",
            involvedCharacters: ["hero_001", "villain_001"],
          },
        ],
      };

      const result = normalizeOutline(raw);
      expect(result.beats[0]?.involvedCharacters).toEqual(["hero_001", "villain_001"]);
    });

    it("should handle outline with characters array instead of involvedCharacters", () => {
      const raw = {
        beats: [
          {
            beatId: "beat_1",
            summary: "Test beat",
            characters: ["char_a", "char_b"],
          },
        ],
      };

      const result = normalizeOutline(raw);
      expect(result.beats[0]?.involvedCharacters).toEqual(["char_a", "char_b"]);
    });

    it("should handle missing character arrays gracefully", () => {
      const raw = {
        beats: [
          {
            beatId: "beat_1",
            summary: "Test beat without characters",
          },
        ],
      };

      const result = normalizeOutline(raw);
      expect(result.beats[0]?.involvedCharacters).toEqual([]);
    });

    it("should extract entities from multiple field names", () => {
      const raw = {
        beats: [
          { entities: ["entity_1"] },
          { requiredEntities: ["entity_2"] },
          { entityIds: ["entity_3"] },
        ],
      };

      const result = normalizeOutline(raw);
      expect(result.beats[0]?.entities).toEqual(["entity_1"]);
      expect(result.beats[1]?.entities).toEqual(["entity_2"]);
      expect(result.beats[2]?.entities).toEqual(["entity_3"]);
    });

    it("should extract locations from multiple field names", () => {
      const raw = {
        beats: [
          { locations: ["Tokyo"] },
          { location: "Paris" },
          { locationSignals: ["London"] },
          { environmentContext: ["Berlin"] },
        ],
      };

      const result = normalizeOutline(raw);
      expect(result.beats[0]?.locations).toEqual(["Tokyo"]);
      expect(result.beats[1]?.locations).toEqual(["Paris"]);
      expect(result.beats[2]?.locations).toEqual(["London"]);
      expect(result.beats[3]?.locations).toEqual(["Berlin"]);
    });

    it("should detect dialogue from summary text", () => {
      const raw = {
        beats: [
          { summary: "The hero speaks to the villain" },
          { summary: "Silent confrontation" },
        ],
      };

      const result = normalizeOutline(raw);
      expect(result.beats[0]?.hasDialogue).toBe(true);
      expect(result.beats[1]?.hasDialogue).toBe(false);
    });

    it("should detect combat from summary text", () => {
      const raw = {
        beats: [
          { summary: "Epic battle begins" },
          { summary: "Quiet moment" },
        ],
      };

      const result = normalizeOutline(raw);
      expect(result.beats[0]?.hasCombat).toBe(true);
      expect(result.beats[1]?.hasCombat).toBe(false);
    });

    it("should detect emotion from summary text", () => {
      const raw = {
        beats: [
          { summary: "She cries in despair" },
          { summary: "Walking through the forest" },
        ],
      };

      const result = normalizeOutline(raw);
      expect(result.beats[0]?.hasEmotion).toBe(true);
      expect(result.beats[1]?.hasEmotion).toBe(false);
    });

    it("should normalize criticality values", () => {
      const raw = {
        beats: [
          { criticality: "critical" },
          { criticality: "high" },
          { criticality: "low" },
          { criticality: "unknown" },
        ],
      };

      const result = normalizeOutline(raw);
      expect(result.beats[0]?.criticality).toBe("critical");
      expect(result.beats[1]?.criticality).toBe("high");
      expect(result.beats[2]?.criticality).toBe("low");
      expect(result.beats[3]?.criticality).toBe("medium");
    });

    it("should generate beatIds for beats without them", () => {
      const raw = {
        beats: [{}, {}, {}],
      };

      const result = normalizeOutline(raw);
      expect(result.beats[0]?.beatId).toBe("beat_1");
      expect(result.beats[1]?.beatId).toBe("beat_2");
      expect(result.beats[2]?.beatId).toBe("beat_3");
    });

    it("should calculate totalEstimatedPanels", () => {
      const raw = {
        beats: [
          { estimatedPanels: 5 },
          { estimatedPanels: 7 },
          { estimatedPanels: 3 },
        ],
      };

      const result = normalizeOutline(raw);
      expect(result.totalEstimatedPanels).toBe(15);
    });

    it("should use default estimatedPanels when not provided", () => {
      const raw = {
        beats: [{}, {}, {}],
      };

      const result = normalizeOutline(raw);
      expect(result.totalEstimatedPanels).toBe(12);
    });

    it("should extract props from requiredProps objects", () => {
      const raw = {
        beats: [
          {
            requiredProps: [
              { canonicalName: "sword" },
              { canonicalName: "shield" },
            ],
          },
        ],
      };

      const result = normalizeOutline(raw);
      expect(result.beats[0]?.props).toEqual(["sword", "shield"]);
    });

    it("should handle empty outline gracefully", () => {
      const result = normalizeOutline({});
      expect(result.source).toBe("unknown");
      expect(result.chapterGoal).toBe("");
      expect(result.beats).toEqual([]);
      expect(result.totalEstimatedPanels).toBe(0);
    });

    it("should handle null input gracefully", () => {
      const result = normalizeOutline(null);
      expect(result.beats).toEqual([]);
    });
  });

  describe("safeNormalizeOutline", () => {
    it("should return normalized outline for valid input", () => {
      const raw = {
        source: "test",
        beats: [{ beatId: "beat_1", summary: "Test" }],
      };

      const result = safeNormalizeOutline(raw);
      expect(result.source).toBe("test");
      expect(result.beats.length).toBe(1);
    });

    it("should return fallback structure for invalid input", () => {
      const result = safeNormalizeOutline(undefined);
      expect(result.source).toBe("fallback");
      expect(result.beats).toEqual([]);
    });
  });
});
