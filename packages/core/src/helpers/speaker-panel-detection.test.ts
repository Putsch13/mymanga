/**
 * Tests pour le helper isSpeakerPanelForDialogueBeat.
 */

import { describe, it, expect } from "vitest";
import {
  isSpeakerPanelForDialogueBeat,
  beatHasSpeakerPanelForDialogue,
  findBeatsWithMissingSpeakerPanels,
} from "./speaker-panel-detection";

describe("isSpeakerPanelForDialogueBeat", () => {
  it("retourne true si dialogueCarrier=speaker_visible + speakerAnchorCharacterId", () => {
    const panel = {
      dialogueCarrier: "speaker_visible" as const,
      speakerAnchorCharacterId: "char_1",
      subjectFocus: "environment" as const,
    };
    expect(isSpeakerPanelForDialogueBeat(panel)).toBe(true);
  });

  it("retourne true si subjectFocus=speaker + dialogueLines", () => {
    const panel = {
      subjectFocus: "speaker" as const,
      dialogueLines: [{ speaker: "char_1", text: "Hello" }],
    };
    expect(isSpeakerPanelForDialogueBeat(panel)).toBe(true);
  });

  it("retourne true si subjectFocus=duo + dialogueLines", () => {
    const panel = {
      subjectFocus: "duo" as const,
      dialogueLines: [{ speaker: "char_1", text: "Hello" }],
    };
    expect(isSpeakerPanelForDialogueBeat(panel)).toBe(true);
  });

  it("retourne true si mangaPanelFunction=dialogue_speaker", () => {
    const panel = {
      mangaPanelFunction: "dialogue_speaker",
      subjectFocus: "environment" as const,
    };
    expect(isSpeakerPanelForDialogueBeat(panel)).toBe(true);
  });

  it("retourne true si dialogueLinesAnchored > 0", () => {
    const panel = {
      dialogueLinesAnchored: 2,
      subjectFocus: "environment" as const,
    };
    expect(isSpeakerPanelForDialogueBeat(panel)).toBe(true);
  });

  it("retourne true si hero focus avec dialogue et personnages visibles", () => {
    const panel = {
      subjectFocus: "hero" as const,
      dialogueLines: [{ speaker: "char_1", text: "Hello" }],
      mustShowCharacterIds: ["char_1"],
    };
    expect(isSpeakerPanelForDialogueBeat(panel)).toBe(true);
  });

  it("retourne false si aucun critère n'est satisfait", () => {
    const panel = {
      subjectFocus: "environment" as const,
      dialogueLines: [],
    };
    expect(isSpeakerPanelForDialogueBeat(panel)).toBe(false);
  });

  it("retourne false si dialogueCarrier=speaker_visible mais sans anchor", () => {
    const panel = {
      dialogueCarrier: "speaker_visible" as const,
      speakerAnchorCharacterId: null,
      subjectFocus: "environment" as const,
    };
    expect(isSpeakerPanelForDialogueBeat(panel)).toBe(false);
  });

  it("retourne false si subjectFocus=speaker mais sans dialogueLines", () => {
    const panel = {
      subjectFocus: "speaker" as const,
      dialogueLines: [],
    };
    expect(isSpeakerPanelForDialogueBeat(panel)).toBe(false);
  });
});

describe("beatHasSpeakerPanelForDialogue", () => {
  it("retourne true si le beat n'a pas de dialogue", () => {
    const blueprints = [
      { beatId: "beat_1", subjectFocus: "environment" as const },
    ];
    expect(beatHasSpeakerPanelForDialogue("beat_1", blueprints)).toBe(true);
  });

  it("retourne true si le beat a un dialogue et un speaker panel", () => {
    const blueprints = [
      {
        beatId: "beat_1",
        subjectFocus: "speaker" as const,
        dialogueLines: [{ speaker: "char_1", text: "Hello" }],
      },
    ];
    expect(beatHasSpeakerPanelForDialogue("beat_1", blueprints)).toBe(true);
  });

  it("retourne false si le beat a un dialogue mais pas de speaker panel", () => {
    const blueprints = [
      {
        beatId: "beat_1",
        subjectFocus: "environment" as const,
        dialogueLines: [{ speaker: "char_1", text: "Hello" }],
      },
    ];
    expect(beatHasSpeakerPanelForDialogue("beat_1", blueprints)).toBe(false);
  });
});

describe("findBeatsWithMissingSpeakerPanels", () => {
  it("retourne les beats avec dialogues mais sans speaker panel", () => {
    const blueprints = [
      {
        beatId: "beat_1",
        subjectFocus: "speaker" as const,
        dialogueLines: [{ speaker: "char_1", text: "OK" }],
      },
      {
        beatId: "beat_2",
        subjectFocus: "environment" as const,
        dialogueLines: [{ speaker: "char_1", text: "Problem" }],
      },
    ];
    const missing = findBeatsWithMissingSpeakerPanels(blueprints);
    expect(missing).toEqual(["beat_2"]);
  });

  it("retourne un tableau vide si tous les beats sont valides", () => {
    const blueprints = [
      {
        beatId: "beat_1",
        dialogueCarrier: "speaker_visible" as const,
        speakerAnchorCharacterId: "char_1",
        dialogueLines: [{ speaker: "char_1", text: "OK" }],
      },
    ];
    const missing = findBeatsWithMissingSpeakerPanels(blueprints);
    expect(missing).toEqual([]);
  });
});
