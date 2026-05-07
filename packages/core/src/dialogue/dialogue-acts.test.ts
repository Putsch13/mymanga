import { describe, it, expect } from "vitest";
import { validateDialogueActs, type DialogueAct, type PanelTextForActCheck } from "./dialogue-acts";

function makeAct(partial: Partial<DialogueAct> & { id: string; beatId: string; speakerId: string }): DialogueAct {
  return {
    eventId: "e1",
    speakerType: "character",
    targetCharacterIds: [],
    purpose: "warning",
    mustMention: [],
    maxLines: 3,
    ...partial,
  };
}

describe("validateDialogueActs", () => {
  it("marks all acts as fulfilled when all have matching panels", () => {
    const acts: DialogueAct[] = [
      makeAct({ id: "a1", beatId: "b1", speakerId: "hero" }),
    ];
    const panels: PanelTextForActCheck[] = [
      { beatId: "b1", speakerId: "hero", text: "Attention !" },
    ];
    const result = validateDialogueActs(acts, panels);
    expect(result.ok).toBe(true);
    expect(result.fulfilled).toContain("a1");
  });

  it("marks act unfulfilled when no matching panel exists", () => {
    const acts: DialogueAct[] = [
      makeAct({ id: "a1", beatId: "b1", speakerId: "hero" }),
    ];
    const result = validateDialogueActs(acts, []);
    expect(result.ok).toBe(false);
    expect(result.unfulfilled).toContain("a1");
  });

  it("checks mustMention keywords (case-insensitive)", () => {
    const acts: DialogueAct[] = [
      makeAct({ id: "a1", beatId: "b1", speakerId: "hero", mustMention: ["tempête"] }),
    ];
    const panels: PanelTextForActCheck[] = [
      { beatId: "b1", speakerId: "hero", text: "La Tempête arrive !" },
    ];
    const result = validateDialogueActs(acts, panels);
    expect(result.ok).toBe(true);
  });

  it("fails if mustMention keyword is missing from dialogue text", () => {
    const acts: DialogueAct[] = [
      makeAct({ id: "a1", beatId: "b1", speakerId: "hero", mustMention: ["tempête"] }),
    ];
    const panels: PanelTextForActCheck[] = [
      { beatId: "b1", speakerId: "hero", text: "C'est un beau jour." },
    ];
    const result = validateDialogueActs(acts, panels);
    expect(result.ok).toBe(false);
    expect(result.unfulfilled).toContain("a1");
  });

  it("does not match across different beats", () => {
    const acts: DialogueAct[] = [
      makeAct({ id: "a1", beatId: "b1", speakerId: "hero" }),
    ];
    const panels: PanelTextForActCheck[] = [
      { beatId: "b2", speakerId: "hero", text: "Dialog" },
    ];
    const result = validateDialogueActs(acts, panels);
    expect(result.ok).toBe(false);
  });
});
