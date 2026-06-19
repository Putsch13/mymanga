/**
 * assert-panel-specificity.test.ts
 *
 * P1.18 — Tests pour l'assertion de spécificité des panels.
 */

import { describe, it, expect } from "vitest";

const GENERIC_ACTION_PATTERNS = [
  /^character\s/i,
  /^person\s/i,
  /does\ssomething/i,
  /generic/i,
  /placeholder/i,
  /todo/i,
  /^action$/i,
  /^scene$/i,
];

function isGenericAction(action: string): boolean {
  if (!action || action.length < 10) return true;
  return GENERIC_ACTION_PATTERNS.some((p) => p.test(action));
}

function assertPanelSpecificity(
  panels: Array<{ microAction: string; narrativeRole?: string }>,
  isPremium: boolean
): void {
  if (!isPremium) return;

  const genericPanels = panels.filter((p) => isGenericAction(p.microAction));

  if (genericPanels.length > 0) {
    const ratio = genericPanels.length / panels.length;
    if (ratio > 0.1) {
      throw new Error(
        `E_PANEL_SPECIFICITY_LOW: ${genericPanels.length}/${panels.length} panels have generic actions`
      );
    }
  }
}

describe("isGenericAction", () => {
  it("should detect generic actions", () => {
    expect(isGenericAction("Character does something")).toBe(true);
    expect(isGenericAction("action")).toBe(true);
    expect(isGenericAction("scene")).toBe(true);
    expect(isGenericAction("placeholder")).toBe(true);
    expect(isGenericAction("TODO")).toBe(true);
    expect(isGenericAction("short")).toBe(true);
  });

  it("should pass specific actions", () => {
    expect(isGenericAction("Marius se penche vers Maya, les sourcils froncés")).toBe(false);
    expect(isGenericAction("Le héros brandit son épée face à l'ennemi")).toBe(false);
    expect(isGenericAction("Maya court à travers la forêt dense")).toBe(false);
  });
});

describe("assertPanelSpecificity", () => {
  it("should not throw for specific panels in premium mode", () => {
    const panels = [
      { microAction: "Marius regarde Maya avec une expression inquiète", narrativeRole: "reaction" },
      { microAction: "Maya détourne le regard, les larmes aux yeux", narrativeRole: "emotional" },
    ];

    expect(() => assertPanelSpecificity(panels, true)).not.toThrow();
  });

  it("should throw for too many generic panels in premium mode", () => {
    const panels = [
      { microAction: "character action", narrativeRole: "action" },
      { microAction: "scene", narrativeRole: "establishing" },
      { microAction: "placeholder", narrativeRole: "action" },
    ];

    expect(() => assertPanelSpecificity(panels, true)).toThrow(/E_PANEL_SPECIFICITY_LOW/);
  });

  it("should not throw in non-premium mode", () => {
    const panels = [
      { microAction: "generic", narrativeRole: "action" },
      { microAction: "todo", narrativeRole: "action" },
    ];

    expect(() => assertPanelSpecificity(panels, false)).not.toThrow();
  });

  it("should allow small ratio of generic panels", () => {
    const panels = [
      { microAction: "Marius combat férocement avec son épée", narrativeRole: "action" },
      { microAction: "Maya observe la scène depuis la colline", narrativeRole: "establishing" },
      { microAction: "Le dragon crache des flammes sur le village", narrativeRole: "action" },
      { microAction: "Les villageois fuient dans la panique", narrativeRole: "action" },
      { microAction: "Marius lève son bouclier pour se protéger", narrativeRole: "reaction" },
      { microAction: "Maya prépare un sortilège de protection", narrativeRole: "action" },
      { microAction: "Le sol tremble sous l'impact", narrativeRole: "establishing" },
      { microAction: "Les flammes illuminent la nuit", narrativeRole: "establishing" },
      { microAction: "Marius charge vers le dragon", narrativeRole: "action" },
      { microAction: "scene", narrativeRole: "establishing" },
    ];

    expect(() => assertPanelSpecificity(panels, true)).not.toThrow();
  });
});
