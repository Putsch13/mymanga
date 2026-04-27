/**
 * render-pass.visual-qa-stable-url.test.ts
 *
 * P1.18 — Tests pour la stabilité des URLs avant Vision QA.
 */

import { describe, it, expect } from "vitest";

const TEMPORARY_URL_PATTERNS = [
  /fal\.media/i,
  /fal-cdn\.media/i,
  /storage\.fal\.ai/i,
  /oaidalleapiprodscus/i,
  /replicate\.delivery/i,
];

function isTemporaryUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return TEMPORARY_URL_PATTERNS.some((p) => p.test(url));
}

function isStableUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return (
    url.startsWith("/storage/") ||
    url.includes("supabase.co/storage") ||
    url.includes("amazonaws.com") ||
    url.includes("cloudflare")
  );
}

interface RenderPassQaInput {
  imageUrl: string | null;
  storageKey: string | null;
  isPremium: boolean;
}

function assertStableUrlForVisionQa(input: RenderPassQaInput): void {
  if (!input.isPremium) return;

  if (!input.imageUrl) {
    throw new Error("E_VISION_QA_NO_URL: No image URL provided");
  }

  if (isTemporaryUrl(input.imageUrl) && !input.storageKey) {
    throw new Error(
      "E_VISION_QA_TEMPORARY_URL: Image URL is temporary and no storageKey exists. " +
      "Vision QA requires stable URLs."
    );
  }
}

function getStableUrlForQa(input: RenderPassQaInput): string | null {
  if (input.storageKey) {
    return `/storage/${input.storageKey}`;
  }

  if (input.imageUrl && isStableUrl(input.imageUrl)) {
    return input.imageUrl;
  }

  return null;
}

describe("isTemporaryUrl", () => {
  it("should detect FAL temporary URLs", () => {
    expect(isTemporaryUrl("https://fal.media/files/abc123/image.png")).toBe(true);
    expect(isTemporaryUrl("https://storage.fal.ai/outputs/xyz.jpg")).toBe(true);
    expect(isTemporaryUrl("https://fal-cdn.media/files/test.png")).toBe(true);
  });

  it("should detect Replicate temporary URLs", () => {
    expect(isTemporaryUrl("https://replicate.delivery/abc/image.png")).toBe(true);
  });

  it("should detect DALL-E temporary URLs", () => {
    expect(
      isTemporaryUrl("https://oaidalleapiprodscus.blob.core.windows.net/image.png")
    ).toBe(true);
  });

  it("should not flag stable URLs", () => {
    expect(isTemporaryUrl("/storage/images/abc.png")).toBe(false);
    expect(isTemporaryUrl("https://example.supabase.co/storage/v1/object/img.png")).toBe(false);
    expect(isTemporaryUrl("https://s3.amazonaws.com/bucket/image.png")).toBe(false);
  });

  it("should handle null/undefined", () => {
    expect(isTemporaryUrl(null)).toBe(false);
    expect(isTemporaryUrl(undefined)).toBe(false);
  });
});

describe("isStableUrl", () => {
  it("should recognize local storage paths", () => {
    expect(isStableUrl("/storage/images/abc.png")).toBe(true);
  });

  it("should recognize Supabase storage URLs", () => {
    expect(isStableUrl("https://proj.supabase.co/storage/v1/object/img.png")).toBe(true);
  });

  it("should recognize S3 URLs", () => {
    expect(isStableUrl("https://bucket.s3.amazonaws.com/image.png")).toBe(true);
  });

  it("should reject temporary URLs", () => {
    expect(isStableUrl("https://fal.media/files/abc/image.png")).toBe(false);
  });
});

describe("assertStableUrlForVisionQa", () => {
  it("should throw for temporary URL without storageKey in premium mode", () => {
    expect(() =>
      assertStableUrlForVisionQa({
        imageUrl: "https://fal.media/files/abc/image.png",
        storageKey: null,
        isPremium: true,
      })
    ).toThrow(/E_VISION_QA_TEMPORARY_URL/);
  });

  it("should not throw if storageKey exists", () => {
    expect(() =>
      assertStableUrlForVisionQa({
        imageUrl: "https://fal.media/files/abc/image.png",
        storageKey: "images/abc.png",
        isPremium: true,
      })
    ).not.toThrow();
  });

  it("should not throw for stable URL", () => {
    expect(() =>
      assertStableUrlForVisionQa({
        imageUrl: "/storage/images/abc.png",
        storageKey: null,
        isPremium: true,
      })
    ).not.toThrow();
  });

  it("should not throw in non-premium mode", () => {
    expect(() =>
      assertStableUrlForVisionQa({
        imageUrl: "https://fal.media/files/abc/image.png",
        storageKey: null,
        isPremium: false,
      })
    ).not.toThrow();
  });

  it("should throw for missing URL in premium mode", () => {
    expect(() =>
      assertStableUrlForVisionQa({
        imageUrl: null,
        storageKey: null,
        isPremium: true,
      })
    ).toThrow(/E_VISION_QA_NO_URL/);
  });
});

describe("getStableUrlForQa", () => {
  it("should prefer storageKey over imageUrl", () => {
    const url = getStableUrlForQa({
      imageUrl: "https://fal.media/files/abc/image.png",
      storageKey: "images/abc.png",
      isPremium: true,
    });

    expect(url).toBe("/storage/images/abc.png");
  });

  it("should return imageUrl if stable and no storageKey", () => {
    const url = getStableUrlForQa({
      imageUrl: "https://proj.supabase.co/storage/v1/object/img.png",
      storageKey: null,
      isPremium: true,
    });

    expect(url).toBe("https://proj.supabase.co/storage/v1/object/img.png");
  });

  it("should return null for temporary URL without storageKey", () => {
    const url = getStableUrlForQa({
      imageUrl: "https://fal.media/files/abc/image.png",
      storageKey: null,
      isPremium: true,
    });

    expect(url).toBeNull();
  });
});
