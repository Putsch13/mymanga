/**
 * P0.3 (sprint 5) — Tests de la politique `manual-visual-ref-policy`.
 *
 * Vérifie que :
 *   - toute ref manuelle (sans mediaAssetId) est marquée non-canonique et
 *     tracable (source/assetProvenance/importedBy/importedAt),
 *   - `resolveIsPrimary` refuse de promouvoir une ref manuelle en primary
 *     même si le payload le demande,
 *   - `resolveIsPrimary` respecte le `isPrimary` d'une ref canonique existante
 *     (liée à un mediaAsset).
 */
import { describe, it, expect } from "vitest";
import {
  buildManualRefMetadata,
  resolveIsPrimary,
} from "@/lib/character/manual-visual-ref-policy";

describe("buildManualRefMetadata", () => {
  it("marque source=manual_import + isCanonical=false + assetProvenance=external_stable_url", () => {
    const meta = buildManualRefMetadata("user-123");
    expect(meta.source).toBe("manual_import");
    expect(meta.isCanonical).toBe(false);
    expect(meta.assetProvenance).toBe("external_stable_url");
    expect(meta.importedByUserId).toBe("user-123");
    expect(typeof meta.importedAt).toBe("string");
    expect(new Date(meta.importedAt).toString()).not.toBe("Invalid Date");
  });

  it("utilise la date passée en paramètre pour traçabilité déterministe", () => {
    const fixed = new Date("2026-04-19T10:30:00Z");
    const meta = buildManualRefMetadata("user-123", fixed);
    expect(meta.importedAt).toBe(fixed.toISOString());
  });
});

describe("resolveIsPrimary", () => {
  it("refuse isPrimary=true sur une ref sans mediaAssetId (nouvelle ou manuelle)", () => {
    expect(resolveIsPrimary({ requestedIsPrimary: true, prevMediaAssetId: null })).toBe(false);
    expect(resolveIsPrimary({ requestedIsPrimary: true, prevMediaAssetId: undefined })).toBe(false);
  });

  it("retourne toujours false si la ref est manuelle (prevMediaAssetId=null)", () => {
    expect(resolveIsPrimary({ requestedIsPrimary: false, prevMediaAssetId: null })).toBe(false);
  });

  it("respecte le isPrimary demandé si la ref est canonique (prevMediaAssetId présent)", () => {
    expect(
      resolveIsPrimary({ requestedIsPrimary: true, prevMediaAssetId: "media-asset-abc" }),
    ).toBe(true);
    expect(
      resolveIsPrimary({ requestedIsPrimary: false, prevMediaAssetId: "media-asset-abc" }),
    ).toBe(false);
  });
});
