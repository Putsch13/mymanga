import { describe, expect, it } from "vitest";
import {
  getStableImageUrl,
  getStableImageUrlOrEmpty,
  hasDisplayableImageUrl,
} from "@/lib/images/get-stable-image-url";

describe("getStableImageUrl (P0.4)", () => {
  it("persistedUrl prioritaire sur imageUrl", () => {
    expect(getStableImageUrl({ persistedUrl: "https://stable.url/a", imageUrl: "https://legacy/a" }))
      .toBe("https://stable.url/a");
  });

  it("fallback imageUrl si persistedUrl manquant", () => {
    expect(getStableImageUrl({ persistedUrl: null, imageUrl: "https://legacy/a" }))
      .toBe("https://legacy/a");
    expect(getStableImageUrl({ imageUrl: "https://legacy/a" }))
      .toBe("https://legacy/a");
  });

  it("retourne null si les deux absents / vides / null / undefined", () => {
    expect(getStableImageUrl(null)).toBeNull();
    expect(getStableImageUrl(undefined)).toBeNull();
    expect(getStableImageUrl({})).toBeNull();
    expect(getStableImageUrl({ persistedUrl: null, imageUrl: null })).toBeNull();
    expect(getStableImageUrl({ persistedUrl: "", imageUrl: "" })).toBeNull();
  });

  it("getStableImageUrlOrEmpty retourne '' au lieu de null", () => {
    expect(getStableImageUrlOrEmpty(null)).toBe("");
    expect(getStableImageUrlOrEmpty({ persistedUrl: "https://x/y" })).toBe("https://x/y");
  });

  it("hasDisplayableImageUrl booléen", () => {
    expect(hasDisplayableImageUrl({ persistedUrl: "https://x/y" })).toBe(true);
    expect(hasDisplayableImageUrl(null)).toBe(false);
    expect(hasDisplayableImageUrl({})).toBe(false);
  });
});
