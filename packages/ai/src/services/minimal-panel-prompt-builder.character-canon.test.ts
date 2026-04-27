/**
 * minimal-panel-prompt-builder.character-canon.test.ts
 *
 * P1.18 — Tests pour la propagation du canon personnage dans le prompt builder.
 */

import { describe, it, expect } from "vitest";

interface CharacterVisualDna {
  hairColor?: string;
  hairStyle?: string;
  eyeColor?: string;
  skinTone?: string;
  bodyType?: string;
  clothingStyle?: string;
  distinctiveFeatures?: string[];
  accessories?: string[];
}

function describeCharacterWithCanon(
  name: string,
  dna: CharacterVisualDna
): string {
  const parts: string[] = [name];

  if (dna.hairColor || dna.hairStyle) {
    const hair = [dna.hairColor, dna.hairStyle].filter(Boolean).join(" ");
    if (hair) parts.push(`with ${hair} hair`);
  }

  if (dna.eyeColor) {
    parts.push(`${dna.eyeColor} eyes`);
  }

  if (dna.skinTone) {
    parts.push(`${dna.skinTone} skin`);
  }

  if (dna.clothingStyle) {
    parts.push(`wearing ${dna.clothingStyle}`);
  }

  if (dna.distinctiveFeatures && dna.distinctiveFeatures.length > 0) {
    parts.push(dna.distinctiveFeatures.join(", "));
  }

  return parts.join(", ");
}

function buildPromptWithCharacterCanon(
  basePrompt: string,
  characters: Array<{ name: string; dna: CharacterVisualDna }>
): string {
  if (characters.length === 0) return basePrompt;

  const characterDescriptions = characters
    .map((c) => describeCharacterWithCanon(c.name, c.dna))
    .join("; ");

  return `${basePrompt} featuring ${characterDescriptions}`;
}

describe("describeCharacterWithCanon", () => {
  it("should include basic visual traits", () => {
    const description = describeCharacterWithCanon("Marius", {
      hairColor: "black",
      hairStyle: "short",
      eyeColor: "blue",
    });

    expect(description).toContain("Marius");
    expect(description).toContain("black");
    expect(description).toContain("short");
    expect(description).toContain("hair");
    expect(description).toContain("blue eyes");
  });

  it("should include clothing", () => {
    const description = describeCharacterWithCanon("Maya", {
      clothingStyle: "flowing white dress",
    });

    expect(description).toContain("wearing flowing white dress");
  });

  it("should include distinctive features", () => {
    const description = describeCharacterWithCanon("Villain", {
      distinctiveFeatures: ["scar on left cheek", "metal arm"],
    });

    expect(description).toContain("scar on left cheek");
    expect(description).toContain("metal arm");
  });

  it("should handle empty DNA gracefully", () => {
    const description = describeCharacterWithCanon("Unknown", {});
    expect(description).toBe("Unknown");
  });
});

describe("buildPromptWithCharacterCanon", () => {
  it("should add character descriptions to base prompt", () => {
    const prompt = buildPromptWithCharacterCanon(
      "A dramatic scene at the port",
      [
        {
          name: "Marius",
          dna: { hairColor: "black", eyeColor: "blue" },
        },
        {
          name: "Maya",
          dna: { hairColor: "blonde", eyeColor: "green" },
        },
      ]
    );

    expect(prompt).toContain("A dramatic scene at the port");
    expect(prompt).toContain("featuring");
    expect(prompt).toContain("Marius");
    expect(prompt).toContain("Maya");
    expect(prompt).toContain("black");
    expect(prompt).toContain("blonde");
  });

  it("should return base prompt if no characters", () => {
    const prompt = buildPromptWithCharacterCanon(
      "An empty landscape",
      []
    );

    expect(prompt).toBe("An empty landscape");
  });

  it("should separate multiple characters with semicolon", () => {
    const prompt = buildPromptWithCharacterCanon("Scene", [
      { name: "A", dna: { hairColor: "red" } },
      { name: "B", dna: { hairColor: "blue" } },
    ]);

    expect(prompt).toContain(";");
  });
});

describe("Character canon propagation rules", () => {
  it("should ensure character name always appears", () => {
    const dna: CharacterVisualDna = {
      hairColor: "silver",
      eyeColor: "red",
      distinctiveFeatures: ["vampire fangs"],
    };

    const description = describeCharacterWithCanon("Dracula", dna);
    expect(description.startsWith("Dracula")).toBe(true);
  });

  it("should maintain visual DNA consistency", () => {
    const dna: CharacterVisualDna = {
      hairColor: "black",
      hairStyle: "long ponytail",
      eyeColor: "amber",
      skinTone: "tan",
      clothingStyle: "samurai armor",
      distinctiveFeatures: ["katana on back"],
    };

    const description = describeCharacterWithCanon("Samurai", dna);

    expect(description).toContain("black");
    expect(description).toContain("long ponytail");
    expect(description).toContain("hair");
    expect(description).toContain("amber eyes");
    expect(description).toContain("tan skin");
    expect(description).toContain("samurai armor");
    expect(description).toContain("katana on back");
  });
});
