import { describe, it, expect } from "vitest";
import { serializeSpeechProfileForPrompt } from "./prompt";

describe("serializeSpeechProfileForPrompt", () => {
  it("rend des clauses lisibles clé: valeur (pas de JSON brut)", () => {
    const out = serializeSpeechProfileForPrompt({
      tone: "sarcastique",
      registre: "familier",
      verbalTics: ["tu vois", "genre"],
    });
    expect(out).toContain("tone: sarcastique");
    expect(out).toContain("registre: familier");
    expect(out).toContain("verbalTics: tu vois, genre");
    expect(out).not.toContain("{");
    expect(out).not.toContain('"');
  });

  it("ne coupe jamais au milieu d'une clause (frontière propre)", () => {
    const out = serializeSpeechProfileForPrompt(
      { a: "x".repeat(50), b: "y".repeat(50), c: "z".repeat(50) },
      60,
    );
    // Avec maxChars=60, seule la 1re clause tient ; pas de fragment partiel.
    expect(out).toBe(`a: ${"x".repeat(50)}`);
  });

  it("ignore les valeurs nulles/objets et renvoie un fallback si vide", () => {
    expect(serializeSpeechProfileForPrompt(null)).toBe("voix non précisée");
    expect(serializeSpeechProfileForPrompt({ nested: { deep: 1 }, empty: "" })).toBe(
      "voix non précisée",
    );
  });
});
