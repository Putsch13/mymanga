import { describe, it, expect } from "vitest";

// Tests unitaires de la logique TagInput sans rendu DOM
// (les tests d'intégration UI nécessitent @testing-library/react)

function addTag(values: string[], raw: string, allowDuplicates = false): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return values;
  if (!allowDuplicates && values.includes(trimmed)) return values;
  return [...values, trimmed];
}

function removeTag(values: string[], index: number): string[] {
  return values.filter((_, i) => i !== index);
}

function parsePastedText(text: string, existing: string[]): string[] {
  if (!text.includes("\n") && !text.includes(";")) return existing;
  const parts = text.split(/[\n;]/).map((s) => s.trim()).filter(Boolean);
  const newValues = [...existing];
  for (const part of parts) {
    if (part && !newValues.includes(part)) {
      newValues.push(part);
    }
  }
  return newValues;
}

describe("TagInput — logique pure", () => {
  it("accepte des valeurs multi-mots", () => {
    const result = addTag([], "katana brisé");
    expect(result).toEqual(["katana brisé"]);
  });

  it("accepte des valeurs avec des espaces", () => {
    const result = addTag([], "armure dorée du roi");
    expect(result).toEqual(["armure dorée du roi"]);
  });

  it("n'ajoute pas de doublons par défaut", () => {
    const result = addTag(["héros principal"], "héros principal");
    expect(result).toEqual(["héros principal"]);
  });

  it("autorise les doublons si allowDuplicates=true", () => {
    const result = addTag(["héros principal"], "héros principal", true);
    expect(result).toEqual(["héros principal", "héros principal"]);
  });

  it("ignore les valeurs vides", () => {
    const result = addTag(["existant"], "   ");
    expect(result).toEqual(["existant"]);
  });

  it("supprime un tag par index", () => {
    const result = removeTag(["a", "b", "c"], 1);
    expect(result).toEqual(["a", "c"]);
  });

  it("parse un collage multi-lignes", () => {
    const result = parsePastedText("ligne 1\nligne 2\nligne 3", []);
    expect(result).toEqual(["ligne 1", "ligne 2", "ligne 3"]);
  });

  it("parse un collage avec séparateur ;", () => {
    const result = parsePastedText("item 1;item 2;item 3", []);
    expect(result).toEqual(["item 1", "item 2", "item 3"]);
  });

  it("ne duplique pas lors du collage", () => {
    const result = parsePastedText("existant\nnouveau", ["existant"]);
    expect(result).toEqual(["existant", "nouveau"]);
  });

  it("retourne le tableau existant si pas de séparateur dans le collage", () => {
    const result = parsePastedText("texte simple", ["existant"]);
    expect(result).toEqual(["existant"]);
  });
});
