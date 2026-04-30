import { describe, expect, it } from "vitest";
import {
  detectNpcGroupsFromText,
  mergeBlueprintAndTextNpcGroups,
  type LegacyNpcGroupForCast,
} from "./legacy-npc-regex-from-text";

describe("legacy-npc-regex-from-text", () => {
  it("detectNpcGroupsFromText détecte foule et soldats dans un résumé FR", () => {
    const groups = detectNpcGroupsFromText([
      "Sur le quai, une foule observe les soldats.",
    ]);
    const labels = groups.map((g) => g.label).sort();
    expect(labels).toContain("foule");
    expect(labels).toContain("soldats");
    expect(groups.every((g) => g.id.startsWith("text_"))).toBe(true);
  });

  it("detectNpcGroupsFromText reconnaît crowd / guards en anglais", () => {
    const groups = detectNpcGroupsFromText(["The crowd panics as guards arrive."]);
    const labels = groups.map((g) => g.label).sort();
    expect(labels).toContain("foule");
    expect(labels).toContain("gardes");
  });

  it("mergeBlueprintAndTextNpcGroups préserve le blueprint si même label", () => {
    const fromBp: LegacyNpcGroupForCast[] = [
      { id: "bp_1", label: "pêcheurs", visualDescription: "depuis blueprint" },
    ];
    const fromText: LegacyNpcGroupForCast[] = [
      { id: "text_pêcheurs", label: "pêcheurs", visualDescription: "depuis regex" },
    ];
    const { merged, map } = mergeBlueprintAndTextNpcGroups(fromBp, fromText);
    expect(merged).toHaveLength(1);
    expect(map.get("pêcheurs")?.visualDescription).toBe("depuis blueprint");
    expect(map.get("pêcheurs")?.id).toBe("bp_1");
  });

  it("mergeBlueprintAndTextNpcGroups ajoute les entrées texte absentes du blueprint", () => {
    const fromBp: LegacyNpcGroupForCast[] = [{ id: "a", label: "clients", visualDescription: "" }];
    const fromText: LegacyNpcGroupForCast[] = [{ id: "text_marins", label: "marins", visualDescription: "hint" }];
    const { merged } = mergeBlueprintAndTextNpcGroups(fromBp, fromText);
    expect(merged.map((g) => g.label).sort()).toEqual(["clients", "marins"]);
  });
});
