/**
 * P0 (mai 2026) — DialogueContract en mode strict premium :
 *   - speakerId === "unknown"           -> error
 *   - speaker not in known characters   -> error (au lieu de warning)
 *   - dialogue floating (speaker hidden)-> error (au lieu de warning)
 *   - dialogue trop long                 -> error (au lieu de warning)
 */

import { describe, expect, it } from "vitest";
import {
  buildDialogueContractFromBlueprints,
  validateDialogueContract,
  type DialogueContractBlueprintInput,
} from "./dialogue-contract";

const characterNameById = {
  char_hero: "Akira",
  char_mentor: "Tetsuo",
};

function blueprint(
  panelId: string,
  patch: Partial<DialogueContractBlueprintInput>,
): DialogueContractBlueprintInput {
  return {
    panelId,
    dialogueLines: [],
    requiredCharacterIds: [],
    visibleCharacterIds: [],
    mustShowCharacterIds: [],
    speakerAnchorCharacterId: null,
    dialogueLinesAnchored: 0,
    ...patch,
  };
}

describe("DialogueContract — characterId-first", () => {
  it("priorise characterId sur speaker textuel", () => {
    const contract = buildDialogueContractFromBlueprints(
      "ch1",
      [
        blueprint("p1", {
          dialogueLines: [{ speaker: "Hero", text: "Allons-y", characterId: "char_hero" }],
          mustShowCharacterIds: ["char_hero"],
          speakerAnchorCharacterId: "char_hero",
        }),
      ],
      characterNameById,
    );
    expect(contract.lines[0]!.speakerId).toBe("char_hero");
    expect(contract.lines[0]!.speakerName).toBe("Akira");
    expect(contract.uniqueSpeakers).toContain("char_hero");
  });

  it("retombe sur speakerName quand aucun characterId fourni", () => {
    const contract = buildDialogueContractFromBlueprints(
      "ch1",
      [blueprint("p1", { dialogueLines: [{ speaker: "Inconnu", text: "?" }] })],
      characterNameById,
    );
    expect(contract.lines[0]!.speakerId).toBe("Inconnu");
  });
});

describe("validateDialogueContract — strictMode (premium)", () => {
  const knownIds = ["char_hero", "char_mentor"];

  it("speakerId 'unknown' -> error en strict, warning sinon", () => {
    const contract = buildDialogueContractFromBlueprints(
      "ch1",
      [blueprint("p1", { dialogueLines: [{ text: "Bulle orpheline" }] })],
      characterNameById,
    );

    const lax = validateDialogueContract(contract, { panelIds: ["p1"], characterIds: knownIds });
    expect(lax.ok).toBe(true);
    expect(lax.issues.some((i) => i.code === "E_DIALOGUE_SPEAKER_NOT_IDENTIFIED" && i.severity === "warning")).toBe(true);

    const strict = validateDialogueContract(contract, {
      panelIds: ["p1"],
      characterIds: knownIds,
      strictMode: true,
    });
    expect(strict.ok).toBe(false);
    expect(strict.issues.some((i) => i.code === "E_DIALOGUE_SPEAKER_NOT_IDENTIFIED" && i.severity === "error")).toBe(true);
  });

  it("speaker absent du catalogue -> error en strict", () => {
    const contract = buildDialogueContractFromBlueprints(
      "ch1",
      [
        blueprint("p1", {
          dialogueLines: [{ speaker: "Akira", text: "Salut", characterId: "char_inexistant" }],
          mustShowCharacterIds: ["char_inexistant"],
          speakerAnchorCharacterId: "char_inexistant",
        }),
      ],
      characterNameById,
    );

    const strict = validateDialogueContract(contract, {
      panelIds: ["p1"],
      characterIds: knownIds,
      strictMode: true,
    });
    expect(strict.ok).toBe(false);
    expect(
      strict.issues.some(
        (i) => i.code === "E_DIALOGUE_SPEAKER_NOT_IDENTIFIED" && i.severity === "error",
      ),
    ).toBe(true);
  });

  it("texte > 220 chars -> error en strict, warning sinon", () => {
    const longText = "a".repeat(240);
    const contract = buildDialogueContractFromBlueprints(
      "ch1",
      [
        blueprint("p1", {
          dialogueLines: [{ speaker: "Akira", text: longText, characterId: "char_hero" }],
          mustShowCharacterIds: ["char_hero"],
          speakerAnchorCharacterId: "char_hero",
        }),
      ],
      characterNameById,
    );

    const lax = validateDialogueContract(contract, { panelIds: ["p1"], characterIds: knownIds });
    expect(lax.issues.find((i) => i.code === "E_DIALOGUE_TOO_LONG")?.severity).toBe("warning");

    const strict = validateDialogueContract(contract, {
      panelIds: ["p1"],
      characterIds: knownIds,
      strictMode: true,
    });
    expect(strict.issues.find((i) => i.code === "E_DIALOGUE_TOO_LONG")?.severity).toBe("error");
    expect(strict.ok).toBe(false);
  });

  it("dialogue valide premium -> ok=true en strict", () => {
    const contract = buildDialogueContractFromBlueprints(
      "ch1",
      [
        blueprint("p1", {
          dialogueLines: [{ speaker: "Akira", text: "Allons-y", characterId: "char_hero" }],
          mustShowCharacterIds: ["char_hero"],
          speakerAnchorCharacterId: "char_hero",
          dialogueCarrier: "speaker_visible",
        }),
      ],
      characterNameById,
    );
    const strict = validateDialogueContract(contract, {
      panelIds: ["p1"],
      characterIds: knownIds,
      strictMode: true,
    });
    expect(strict.ok).toBe(true);
  });
});
