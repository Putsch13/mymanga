/**
 * TODO-23 (MAJEUR) — Tests des acting notes de dialogue.
 *
 * Le prompt image ne doit JAMAIS exposer le texte littéral des dialogues
 * (sinon Flux/SDXL l'écrit sur le panel). On vérifie ici que :
 *  - le texte exact n'apparaît jamais dans la note,
 *  - le speaker reste présent (utile pour le mouth movement),
 *  - une intention dramatique est inférée du texte.
 */
import { describe, expect, it } from "vitest";
import {
  dialogueLineToActingNote,
  dialogueLinesToActingNote,
} from "./dialogue-acting-note";

describe("dialogueLineToActingNote (TODO-23)", () => {
  it("ne contient JAMAIS le texte littéral du dialogue", () => {
    const line = { speaker: "Florent", text: "Les ombres dansent autour de nous." };
    const note = dialogueLineToActingNote(line);
    expect(note).not.toContain("Les ombres dansent");
    expect(note).not.toContain("autour de nous");
    expect(note).toContain("Florent");
  });

  it("infère une intention 'urgent warning' sur un dialogue d'alerte", () => {
    const note = dialogueLineToActingNote({ speaker: "Lux", text: "Attention, recule !" });
    expect(note).toMatch(/urgent warning|urgency/i);
    expect(note).toContain("Lux");
  });

  it("infère 'tenderness' sur un dialogue intime", () => {
    const note = dialogueLineToActingNote({ speaker: "Tess", text: "Je t'aime, mon amour." });
    expect(note).toMatch(/tender/i);
  });

  it("infère 'concealed truth' quand le dialogue parle de secret", () => {
    const note = dialogueLineToActingNote({
      speaker: "Kai",
      text: "Je sais ce que tu caches.",
    });
    expect(note).toMatch(/concealed|truth/i);
  });

  it("retombe sur 'measured intent' pour un dialogue neutre", () => {
    const note = dialogueLineToActingNote({ speaker: "X", text: "Bonjour." });
    expect(note).toMatch(/measured intent|measured/i);
  });
});

describe("dialogueLinesToActingNote (TODO-23)", () => {
  it("agrège plusieurs lignes sans jamais exposer le texte littéral", () => {
    const lines = [
      { speaker: "A", text: "Tu mens." },
      { speaker: "B", text: "Pardon, je t'aime." },
    ];
    const note = dialogueLinesToActingNote(lines);
    expect(note).not.toContain("Tu mens");
    expect(note).not.toContain("Pardon, je t'aime");
    expect(note).toContain("A");
    expect(note).toContain("B");
  });

  it("plafonne à 3 lignes pour ne pas saturer le prompt", () => {
    const lines = Array.from({ length: 10 }, (_, i) => ({
      speaker: `S${i}`,
      text: "phrase neutre",
    }));
    const note = dialogueLinesToActingNote(lines);
    expect(note).toContain("S0");
    expect(note).toContain("S2");
    expect(note).not.toContain("S3");
  });

  it("retourne une chaîne vide si aucune ligne", () => {
    expect(dialogueLinesToActingNote([])).toBe("");
  });
});
