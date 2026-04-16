import { describe, it, expect } from "vitest";
import {
  panelCastSchema,
  inferCastRole,
  resolvePanelFocus,
  type PanelCastMember,
} from "./panel-cast";

describe("panelCastSchema", () => {
  it("valide un PanelCast bien formé", () => {
    const valid = {
      focus: {
        characterId: "c1",
        name: "Hero",
        role: "protagonist",
        importanceTier: "MAIN_HERO",
        mustBeVisible: true,
        isSpeaker: false,
        isFocus: true,
        isPropCarrier: false,
        anchorRefUrl: null,
        loraTrigger: null,
      },
      supporting: [],
      background: [],
    };
    expect(() => panelCastSchema.parse(valid)).not.toThrow();
  });

  it("rejette un rôle invalide", () => {
    const invalid = {
      focus: {
        characterId: "c1",
        name: "Hero",
        role: "invalid_role",
        importanceTier: "MAIN_HERO",
        mustBeVisible: true,
        isSpeaker: false,
        isFocus: true,
        isPropCarrier: false,
        anchorRefUrl: null,
        loraTrigger: null,
      },
      supporting: [],
      background: [],
    };
    expect(() => panelCastSchema.parse(invalid)).toThrow();
  });
});

describe("inferCastRole", () => {
  it("mappe hero → protagonist", () => {
    expect(inferCastRole("hero")).toBe("protagonist");
  });
  it("mappe villain → antagonist", () => {
    expect(inferCastRole("villain")).toBe("antagonist");
  });
  it("mappe null → extra", () => {
    expect(inferCastRole(null)).toBe("extra");
  });
  it("mappe mentor → important_npc", () => {
    expect(inferCastRole("mentor")).toBe("important_npc");
  });
});

describe("resolvePanelFocus", () => {
  const members: PanelCastMember[] = [
    { characterId: "h", name: "Hero", role: "protagonist", importanceTier: "MAIN_HERO", mustBeVisible: true, isSpeaker: false, isFocus: false, isPropCarrier: false, anchorRefUrl: null, loraTrigger: null },
    { characterId: "a", name: "Villain", role: "antagonist", importanceTier: "SECONDARY_CORE", mustBeVisible: true, isSpeaker: false, isFocus: false, isPropCarrier: false, anchorRefUrl: null, loraTrigger: null },
    { characterId: "n", name: "Guard", role: "recurring_npc", importanceTier: "RECURRING_NPC", mustBeVisible: false, isSpeaker: false, isFocus: false, isPropCarrier: false, anchorRefUrl: null, loraTrigger: null },
  ];

  it("enemy → antagoniste", () => {
    expect(resolvePanelFocus("enemy", members)?.characterId).toBe("a");
  });
  it("hero → protagoniste", () => {
    expect(resolvePanelFocus("hero", members)?.characterId).toBe("h");
  });
  it("environment → null", () => {
    expect(resolvePanelFocus("environment", members)).toBeNull();
  });
  it("npc → recurring_npc", () => {
    expect(resolvePanelFocus("npc", members)?.characterId).toBe("n");
  });
});
