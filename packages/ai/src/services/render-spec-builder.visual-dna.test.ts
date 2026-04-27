/**
 * render-spec-builder.visual-dna.test.ts
 *
 * P1.18 — Tests pour l'intégration du visual DNA dans les render specs.
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
}

interface RenderSpecCharacter {
  characterId: string;
  name: string;
  role: "focus" | "speaker" | "secondary";
  visualDna?: CharacterVisualDna;
  loraUrl?: string;
  loraTriggerWord?: string;
}

interface RenderSpec {
  panelId: string;
  characters: RenderSpecCharacter[];
  prompt: string;
  negativePrompt: string[];
}

function buildRenderSpecWithVisualDna(
  panelId: string,
  characters: RenderSpecCharacter[],
  basePrompt: string
): RenderSpec {
  const characterPrompts = characters
    .filter((c) => c.visualDna)
    .map((c) => {
      const dna = c.visualDna!;
      const parts = [c.name];

      if (dna.hairColor) parts.push(`${dna.hairColor} hair`);
      if (dna.eyeColor) parts.push(`${dna.eyeColor} eyes`);
      if (dna.clothingStyle) parts.push(`wearing ${dna.clothingStyle}`);
      if (dna.distinctiveFeatures) parts.push(...dna.distinctiveFeatures);

      return parts.join(", ");
    });

  const fullPrompt =
    characterPrompts.length > 0
      ? `${basePrompt}, ${characterPrompts.join("; ")}`
      : basePrompt;

  const negativePrompt: string[] = [];
  for (const c of characters) {
    if (c.visualDna?.hairColor) {
      const otherColors = ["black", "blonde", "red", "white", "blue"].filter(
        (color) => color !== c.visualDna!.hairColor
      );
      negativePrompt.push(`${c.name} with ${otherColors[0]} hair`);
    }
  }

  return {
    panelId,
    characters,
    prompt: fullPrompt,
    negativePrompt,
  };
}

function validateRenderSpecVisualDna(spec: RenderSpec): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  for (const c of spec.characters) {
    if (c.role === "focus" && !c.visualDna) {
      errors.push(`focus_character_missing_visual_dna:${c.characterId}`);
    }

    if (c.visualDna && !spec.prompt.toLowerCase().includes(c.name.toLowerCase())) {
      errors.push(`character_not_in_prompt:${c.characterId}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

describe("buildRenderSpecWithVisualDna", () => {
  it("should include visual DNA in prompt", () => {
    const spec = buildRenderSpecWithVisualDna(
      "panel-1",
      [
        {
          characterId: "marius",
          name: "Marius",
          role: "focus",
          visualDna: {
            hairColor: "black",
            eyeColor: "blue",
            clothingStyle: "leather jacket",
          },
        },
      ],
      "A dramatic scene"
    );

    expect(spec.prompt).toContain("Marius");
    expect(spec.prompt).toContain("black hair");
    expect(spec.prompt).toContain("blue eyes");
    expect(spec.prompt).toContain("leather jacket");
  });

  it("should generate negative prompts for visual consistency", () => {
    const spec = buildRenderSpecWithVisualDna(
      "panel-2",
      [
        {
          characterId: "maya",
          name: "Maya",
          role: "focus",
          visualDna: {
            hairColor: "blonde",
          },
        },
      ],
      "Scene"
    );

    expect(spec.negativePrompt.length).toBeGreaterThan(0);
    expect(spec.negativePrompt.some((n) => n.includes("Maya"))).toBe(true);
  });

  it("should handle characters without visual DNA", () => {
    const spec = buildRenderSpecWithVisualDna(
      "panel-3",
      [
        {
          characterId: "unknown",
          name: "Stranger",
          role: "secondary",
        },
      ],
      "A mysterious figure appears"
    );

    expect(spec.prompt).toBe("A mysterious figure appears");
    expect(spec.characters).toHaveLength(1);
  });

  it("should combine multiple characters", () => {
    const spec = buildRenderSpecWithVisualDna(
      "panel-4",
      [
        {
          characterId: "a",
          name: "Alice",
          role: "focus",
          visualDna: { hairColor: "red" },
        },
        {
          characterId: "b",
          name: "Bob",
          role: "speaker",
          visualDna: { hairColor: "brown" },
        },
      ],
      "Conversation"
    );

    expect(spec.prompt).toContain("Alice");
    expect(spec.prompt).toContain("Bob");
    expect(spec.prompt).toContain("red hair");
    expect(spec.prompt).toContain("brown hair");
  });
});

describe("validateRenderSpecVisualDna", () => {
  it("should pass for valid spec", () => {
    const spec: RenderSpec = {
      panelId: "p1",
      characters: [
        {
          characterId: "hero",
          name: "Hero",
          role: "focus",
          visualDna: { hairColor: "black" },
        },
      ],
      prompt: "Hero stands tall with black hair",
      negativePrompt: [],
    };

    const result = validateRenderSpecVisualDna(spec);
    expect(result.valid).toBe(true);
  });

  it("should fail for focus character without visual DNA", () => {
    const spec: RenderSpec = {
      panelId: "p2",
      characters: [
        {
          characterId: "hero",
          name: "Hero",
          role: "focus",
        },
      ],
      prompt: "A scene",
      negativePrompt: [],
    };

    const result = validateRenderSpecVisualDna(spec);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("focus_character_missing_visual_dna:hero");
  });

  it("should fail if character with DNA not in prompt", () => {
    const spec: RenderSpec = {
      panelId: "p3",
      characters: [
        {
          characterId: "hero",
          name: "SpecificHero",
          role: "focus",
          visualDna: { hairColor: "black" },
        },
      ],
      prompt: "A generic scene without character names",
      negativePrompt: [],
    };

    const result = validateRenderSpecVisualDna(spec);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("character_not_in_prompt:hero");
  });
});
