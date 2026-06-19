/**
 * P1.2 — Tests des helpers purs de `species-resolver`.
 *
 * On ne teste PAS `resolveSpeciesArchetype` directement ici (il nécessite un
 * PrismaClient). On cible :
 *   - la validation Zod stricte (`parseSpeciesAIResponse`),
 *   - le hash stable de prompt (`computePromptHash`),
 *   - l'invariant SPECIES_ARCHETYPE_SCHEMA_VERSION,
 *   - la détection d'espèce (`detectSpeciesInDescription`).
 */
import { describe, it, expect } from "vitest";
import {
  parseSpeciesAIResponse,
  computePromptHash,
  SPECIES_ARCHETYPE_SCHEMA_VERSION,
  detectSpeciesInDescription,
  buildSpeciesMemberPromptFragment,
} from "./species-resolver";

describe("parseSpeciesAIResponse (Zod strict)", () => {
  const validResponse = JSON.stringify({
    morphology: "humanoïde élancé aux oreilles pointues",
    skinTexture: "peau lisse légèrement luminescente",
    distinctiveMarkers: ["oreilles pointues", "yeux ambrés"],
    colorPalette: "teintes bleu nuit et argent",
    heightProfile: "1m80 à 2m, silhouette fine",
    clothingStyle: "robes fluides ornées de runes",
    promptFragment: "elven humanoid, pointed ears, luminescent pale skin, silver hair",
  });

  it("accepte une réponse JSON conforme", () => {
    const r = parseSpeciesAIResponse(validResponse);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.traits.morphology).toContain("humanoïde");
      expect(r.traits.distinctiveMarkers).toHaveLength(2);
    }
  });

  it("strip les fences ```json correctement", () => {
    const fenced = "```json\n" + validResponse + "\n```";
    const r = parseSpeciesAIResponse(fenced);
    expect(r.ok).toBe(true);
  });

  it("rejette un JSON invalide", () => {
    const r = parseSpeciesAIResponse("not json {{{");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("json_parse");
  });

  it("rejette un JSON avec champ manquant (schema_mismatch)", () => {
    const r = parseSpeciesAIResponse(JSON.stringify({ morphology: "ok" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("schema_mismatch");
  });

  it("rejette un distinctiveMarkers vide (min=1)", () => {
    const r = parseSpeciesAIResponse(JSON.stringify({
      morphology: "ok morphology here",
      skinTexture: "skin texture description",
      distinctiveMarkers: [],
      colorPalette: "color",
      heightProfile: "height",
      clothingStyle: "clothing",
      promptFragment: "prompt fragment for image gen",
    }));
    expect(r.ok).toBe(false);
  });

  it("rejette un JSON avec champ supplémentaire (strict mode)", () => {
    const r = parseSpeciesAIResponse(JSON.stringify({
      morphology: "humanoïde élancé aux oreilles pointues",
      skinTexture: "peau lisse",
      distinctiveMarkers: ["marque"],
      colorPalette: "bleu",
      heightProfile: "grand",
      clothingStyle: "robes",
      promptFragment: "elven humanoid",
      extraField: "pirates!", // strict → refused
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("schema_mismatch");
  });
});

describe("computePromptHash", () => {
  it("produit un hex SHA-256 de 64 caractères", () => {
    const h = computePromptHash("hello world");
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it("est déterministe pour la même entrée", () => {
    expect(computePromptHash("abc")).toEqual(computePromptHash("abc"));
  });

  it("change si le prompt change", () => {
    expect(computePromptHash("abc")).not.toEqual(computePromptHash("abd"));
  });
});

describe("SPECIES_ARCHETYPE_SCHEMA_VERSION", () => {
  it("est un entier positif (contrat de versioning)", () => {
    expect(SPECIES_ARCHETYPE_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(SPECIES_ARCHETYPE_SCHEMA_VERSION)).toBe(true);
  });
});

describe("detectSpeciesInDescription", () => {
  it("détecte 'peuple des elfes'", () => {
    expect(detectSpeciesInDescription("un peuple des elfes vivant dans la forêt"))
      .toContain("elfes");
  });

  it("détecte un suffixe -folk avec tiret", () => {
    expect(detectSpeciesInDescription("a sea-folk wanderer")).toBeTruthy();
  });

  it("retourne null pour du texte neutre", () => {
    expect(detectSpeciesInDescription("le héros traverse la ville")).toBeNull();
  });
});

describe("buildSpeciesMemberPromptFragment", () => {
  it("combine promptFragment + premiers marqueurs + variation individuelle", () => {
    const fragment = buildSpeciesMemberPromptFragment(
      {
        morphology: "",
        skinTexture: "",
        distinctiveMarkers: ["pointed ears", "amber eyes", "ignored third"],
        colorPalette: "",
        heightProfile: "",
        clothingStyle: "",
        promptFragment: "elven humanoid",
      },
      "scar on left cheek",
    );
    expect(fragment).toContain("elven humanoid");
    expect(fragment).toContain("pointed ears");
    expect(fragment).toContain("amber eyes");
    expect(fragment).not.toContain("ignored third");
    expect(fragment).toContain("scar on left cheek");
  });
});
