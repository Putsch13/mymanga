import { describe, expect, it } from "vitest";
import {
  assertStableImageUrl,
  isStableImageUrl,
  filterStableImageUrls,
  checkStableImageUrl,
} from "@/lib/images/assert-stable-image-url";

/**
 * P5.1 / P0.3 — Garde-fou « aucune URL signée ou temporaire ne peut
 * atterrir dans une colonne canonique ». Ce test caractérise le contrat
 * du helper pour éviter toute régression silencieuse.
 */
describe("stable image url guard", () => {
  it("accepte une URL Supabase public stable", () => {
    const url = "https://demo.supabase.co/storage/v1/object/public/mymanga-images/projects/demo/ref.png";
    expect(isStableImageUrl(url)).toBe(true);
    expect(() => assertStableImageUrl(url)).not.toThrow();
  });

  it("rejette une URL signée (token=...) comme canonique", () => {
    const signed =
      "https://demo.supabase.co/storage/v1/object/sign/mymanga-images/projects/demo/ref.png?token=abc.def.ghi";
    expect(isStableImageUrl(signed)).toBe(false);
    expect(() => assertStableImageUrl(signed, "test")).toThrow(/assertStableImageUrl/);
    const reason = checkStableImageUrl(signed);
    expect(reason.ok).toBe(false);
  });

  it("rejette les hosts provider temporaires (fal/bfl)", () => {
    expect(isStableImageUrl("https://v3b.fal.media/files/abc.png")).toBe(false);
    expect(isStableImageUrl("https://delivery-eu4.bfl.ai/foo/bar.png")).toBe(false);
    expect(isStableImageUrl("https://cdn.fal.ai/whatever.png")).toBe(false);
  });

  it("filterStableImageUrls ne retient que les URLs stables", () => {
    const mixed = [
      "https://demo.supabase.co/storage/v1/object/public/mymanga-images/a.png",
      "https://v3b.fal.media/files/b.png",
      "https://demo.supabase.co/storage/v1/object/sign/x?token=y",
      "not a url",
      null,
      undefined,
    ];
    const stable = filterStableImageUrls(mixed);
    expect(stable).toHaveLength(1);
    expect(stable[0]).toMatch(/\/object\/public\//);
  });
});
