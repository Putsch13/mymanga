import { describe, it, expect } from "vitest";
import {
  resolveLocationVisualCanon,
  isLocationCanonical,
  locationRequiresVisualContinuity,
} from "@/lib/canon/resolve-location-visual-canon";

describe("resolveLocationVisualCanon (P3.1/P3.4)", () => {
  it("source = empty quand aucune donnée", () => {
    const r = resolveLocationVisualCanon({ id: "loc_1", name: "Nowhere" });
    expect(r.source).toBe("empty");
    expect(r.referenceAssets).toEqual([]);
    expect(r.isCanonicalLocation).toBe(false);
    expect(r.requiresVisualContinuity).toBe(false);
  });

  it("source = description_fallback quand seuls description/type", () => {
    const r = resolveLocationVisualCanon({
      id: "loc_2",
      name: "Forêt",
      description: "Une forêt dense",
      type: "outdoor",
    });
    expect(r.source).toBe("description_fallback");
    expect(r.density).toBe("outdoor");
  });

  it("source = metadata_only quand propriétés canoniques dans metadata", () => {
    const r = resolveLocationVisualCanon({
      id: "loc_3",
      name: "Temple",
      metadata: {
        palette: ["rouge sang", "or"],
        architecture: ["colonnes de marbre"],
      },
    });
    expect(r.source).toBe("metadata_only");
    expect(r.canonicalPalette).toContain("rouge sang");
    expect(r.permanentArchitecture).toContain("colonnes de marbre");
  });

  it("source = canon_image_and_refs avec canonImageUrl Supabase stable", () => {
    const stableUrl = "https://xxx.supabase.co/storage/v1/object/public/assets/loc-4.png";
    const r = resolveLocationVisualCanon({
      id: "loc_4",
      name: "Shrine",
      canonImageUrl: stableUrl,
    });
    expect(r.source).toBe("canon_image_and_refs");
    expect(r.referenceAssets[0].url).toBe(stableUrl);
    expect(r.referenceAssets[0].type).toBe("canon_image");
    expect(r.isCanonicalLocation).toBe(true);
    expect(r.requiresVisualContinuity).toBe(true);
  });

  it("rejette une URL signée (non stable) en referenceAssets", () => {
    const signedUrl = "https://xxx.supabase.co/storage/v1/object/sign/assets/loc.png?token=abcd";
    const r = resolveLocationVisualCanon({
      id: "loc_5",
      name: "Harbor",
      canonImageUrl: signedUrl,
    });
    expect(r.referenceAssets).toEqual([]);
    expect(r.isCanonicalLocation).toBe(false);
  });

  it("rejette une URL provider temporaire (fal/bfl) en referenceAssets", () => {
    const r = resolveLocationVisualCanon({
      id: "loc_6",
      name: "Arena",
      visualRefs: [
        { url: "https://v3b.fal.media/files/xxx.png", type: "generated" },
        { url: "https://xxx.supabase.co/storage/v1/object/public/assets/x.png", type: "keyframe" },
      ],
    });
    expect(r.referenceAssets).toHaveLength(1);
    expect(r.referenceAssets[0].type).toBe("keyframe");
  });

  it("isCanonicalLocation forcé via metadata.isCanonicalLocation", () => {
    expect(
      isLocationCanonical({
        id: "loc_7",
        name: "Mountain",
        metadata: { isCanonicalLocation: true },
      }),
    ).toBe(true);
    expect(
      locationRequiresVisualContinuity({
        id: "loc_7",
        name: "Mountain",
        metadata: { requiresVisualContinuity: true },
      }),
    ).toBe(true);
  });

  it("canonLocked=true → isCanonicalLocation=true", () => {
    expect(
      isLocationCanonical({
        id: "loc_8",
        name: "Castle",
        canonLocked: true,
      }),
    ).toBe(true);
  });

  it("déduplique palette/architecture", () => {
    const r = resolveLocationVisualCanon({
      id: "loc_9",
      name: "Bazar",
      metadata: {
        palette: ["or"],
        colorPalette: ["or"],
        canonicalPalette: ["rouge"],
      },
    });
    expect(r.canonicalPalette.filter((c) => c === "or")).toHaveLength(1);
  });
});
