import { describe, it, expect } from "vitest";
import { isValidCharacterReference } from "./fal-adapter-shared";

describe("isValidCharacterReference", () => {
  it("returns invalid for empty URL", () => {
    const result = isValidCharacterReference("");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("empty_url");
  });

  it("returns invalid for null URL", () => {
    const result = isValidCharacterReference(null);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("empty_url");
  });

  it("returns invalid for undefined URL", () => {
    const result = isValidCharacterReference(undefined);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("empty_url");
  });

  it("returns valid for character_reference metadata", () => {
    const result = isValidCharacterReference(
      "https://example.com/some-image.jpg",
      { assetKind: "character_reference" },
    );
    expect(result.valid).toBe(true);
    expect(result.reason).toBe("metadata_character");
  });

  it("returns valid for character_portrait metadata", () => {
    const result = isValidCharacterReference(
      "https://example.com/some-image.jpg",
      { assetKind: "character_portrait" },
    );
    expect(result.valid).toBe(true);
    expect(result.reason).toBe("metadata_character");
  });

  it("returns invalid for scene_keyframe metadata", () => {
    const result = isValidCharacterReference(
      "https://example.com/some-image.jpg",
      { assetKind: "scene_keyframe" },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("metadata_excluded_scene_keyframe");
  });

  it("returns invalid for background metadata", () => {
    const result = isValidCharacterReference(
      "https://example.com/some-image.jpg",
      { assetKind: "background" },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("metadata_excluded_background");
  });

  it("returns invalid for sceneKeyframes URL pattern", () => {
    const result = isValidCharacterReference(
      "https://storage.example.com/projects/123/sceneKeyframes/abc.jpg",
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("url_pattern_excluded");
  });

  it("returns invalid for backgrounds URL pattern", () => {
    const result = isValidCharacterReference(
      "https://storage.example.com/projects/123/backgrounds/forest.jpg",
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("url_pattern_excluded");
  });

  it("returns invalid for environments URL pattern", () => {
    const result = isValidCharacterReference(
      "https://storage.example.com/projects/123/environments/city.jpg",
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("url_pattern_excluded");
  });

  it("returns valid for characters URL pattern", () => {
    const result = isValidCharacterReference(
      "https://storage.example.com/projects/123/characters/hero.jpg",
    );
    expect(result.valid).toBe(true);
    expect(result.reason).toBe("url_characters_path");
  });

  it("returns valid for portraits URL pattern", () => {
    const result = isValidCharacterReference(
      "https://storage.example.com/projects/123/portraits/face.jpg",
    );
    expect(result.valid).toBe(true);
    expect(result.reason).toBe("url_portrait_path");
  });

  it("returns invalid for unknown URL with no character signal", () => {
    const result = isValidCharacterReference(
      "https://fal.cdn/some-random-image-abc123.jpg",
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("no_character_signal");
  });

  it("metadata takes priority over URL patterns", () => {
    const result = isValidCharacterReference(
      "https://storage.example.com/projects/123/characters/hero.jpg",
      { assetKind: "scene_keyframe" },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("metadata_excluded_scene_keyframe");
  });
});
