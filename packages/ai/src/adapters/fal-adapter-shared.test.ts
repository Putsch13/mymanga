import { describe, it, expect } from "vitest";
import { buildFalGenerationRequest, buildFalNegativePrompt } from "./fal-adapter-shared";

/**
 * BUG-02 regression tests : l'ancienne implémentation filtrait 90% du négatif
 * via une regex très restrictive et n'envoyait que 5 fallbacks "composition".
 *
 * P0-2 (audit DIAG) : la cap de 22 était trop basse (jetait les drift guards
 * à partir de 2 persos). Nouvelle cap : 80 termes, 6 groupes priorisés
 * (drift / format / anatomy / composition / quality / rest).
 *
 * On vérifie qu'après la refonte :
 *   - les drift guards personnage SURVIVENT,
 *   - les garde-formats (photorealistic, 3d, cgi…) SURVIVENT,
 *   - les anti-anatomies SURVIVENT,
 *   - on reste sous ~80 termes (cap FLUX-friendly).
 */
describe("buildFalNegativePrompt — BUG-02 drift guards priorisation", () => {
  it("retourne '' si le prompt brut est vide ou blank", () => {
    expect(buildFalNegativePrompt(undefined)).toBe("");
    expect(buildFalNegativePrompt("")).toBe("");
    expect(buildFalNegativePrompt("   ")).toBe("");
  });

  it("conserve les drift guards personnage (wrong hair/eye/outfit)", () => {
    const raw = [
      "wrong hair color for Lyra",
      "wrong eye color for Kai",
      "empty background",
      "studio backdrop",
    ].join(", ");
    const out = buildFalNegativePrompt(raw);
    expect(out).toContain("wrong hair color for lyra");
    expect(out).toContain("wrong eye color for kai");
  });

  it("conserve les format guards (photorealistic, 3d render, cgi, western comics)", () => {
    const raw = "photorealistic, 3d render, cgi, western comics, disney style";
    const out = buildFalNegativePrompt(raw);
    expect(out).toContain("photorealistic");
    expect(out).toContain("3d render");
    expect(out).toContain("cgi");
    expect(out).toContain("western comics");
  });

  it("conserve les anti-anatomies (deformed, extra fingers, bad anatomy)", () => {
    const raw = "deformed hands, extra fingers, bad anatomy, malformed";
    const out = buildFalNegativePrompt(raw);
    expect(out).toContain("deformed hands");
    expect(out).toContain("extra fingers");
    expect(out).toContain("bad anatomy");
  });

  it("priorise drift > format > anatomy > composition quand on dépasse la cap", () => {
    // Génère 30 termes : 5 drift + 5 format + 5 anatomy + 5 composition + 10 rest.
    const raw = [
      "wrong hair color for a",
      "wrong hair color for b",
      "wrong eye color for c",
      "character drift",
      "visual drift",
      "photorealistic",
      "3d render",
      "cgi",
      "octane render",
      "unreal engine",
      "deformed hands",
      "extra fingers",
      "malformed",
      "bad anatomy",
      "extra limbs",
      "empty background",
      "studio backdrop",
      "isolated centered portrait",
      "blurry environment",
      "floating character",
      "rest term 1",
      "rest term 2",
      "rest term 3",
      "rest term 4",
      "rest term 5",
      "rest term 6",
      "rest term 7",
      "rest term 8",
      "rest term 9",
      "rest term 10",
    ].join(", ");
    const out = buildFalNegativePrompt(raw);
    // Drift guards DOIVENT être dans l'output (prioritaires).
    expect(out).toContain("wrong hair color for a");
    expect(out).toContain("character drift");
    // Format guards DOIVENT être présents.
    expect(out).toContain("photorealistic");
    // On reste sous 80 termes.
    const count = out.split(",").filter(Boolean).length;
    expect(count).toBeLessThanOrEqual(80);
  });

  it("P0-2 — étend la cap à 80 termes pour capter tous les drift guards multi-persos", () => {
    // 8 drift guards par personnage × 4 persos = 32, + format/anatomy/composition = ~50.
    const driftForChar = (name: string) => [
      `wrong hair color for ${name}`,
      `wrong eye color for ${name}`,
      `wrong outfit for ${name}`,
      `wrong skin color for ${name}`,
      `character drift ${name}`,
    ];
    const chars = ["lyra", "kai", "ren", "aiko"];
    const raw = [
      ...chars.flatMap(driftForChar),
      "photorealistic", "3d render", "cgi", "western comics", "disney style",
      "deformed hands", "extra fingers", "bad anatomy", "malformed",
      "empty background", "studio backdrop", "isolated centered portrait",
      "blurry", "low quality", "watermark", "jpeg artifacts",
    ].join(", ");
    const out = buildFalNegativePrompt(raw);
    // Tous les drift guards doivent passer.
    for (const name of chars) {
      expect(out).toContain(`wrong hair color for ${name}`);
      expect(out).toContain(`wrong eye color for ${name}`);
    }
    // Format + anatomy + quality aussi.
    expect(out).toContain("photorealistic");
    expect(out).toContain("deformed hands");
    expect(out).toContain("watermark");
  });

  it("ne duplique pas les termes (set dedup)", () => {
    const raw = "empty background, empty background, photorealistic, photorealistic";
    const out = buildFalNegativePrompt(raw);
    const empties = out.match(/empty background/g);
    const photos = out.match(/photorealistic/g);
    expect(empties?.length).toBe(1);
    expect(photos?.length).toBe(1);
  });
});

/**
 * DIFF-4 — vérifie la propagation multi-ref (IP-Adapter style) dans le payload Fal.
 */
describe("buildFalGenerationRequest — DIFF-4 multi-image refs", () => {
  it("reste mono-ref si une seule URL canon est fournie (pas de image_urls dans le payload)", () => {
    const req = buildFalGenerationRequest({
      mode: "PANEL_FINAL",
      positivePrompt: "hero in action",
      negativePrompt: "",
      referenceImageUrls: ["https://example.com/characters/hero-canon.jpg"],
      providerParams: { referencePolicy: "STRONG", panelCategory: "CHARACTER_LOCK" },
    });
    expect(req.effectiveReferenceUrls).toEqual(["https://example.com/characters/hero-canon.jpg"]);
    expect(req.ipAdapterReferenceUrls).toEqual(["https://example.com/characters/hero-canon.jpg"]);
    expect((req.payload as Record<string, unknown>).image_urls).toBeUndefined();
    expect((req.payload as Record<string, unknown>).reference_images).toBeUndefined();
  });

  it("expose image_urls et reference_images quand plusieurs refs sont données (IP-Adapter)", () => {
    // Les URLs doivent contenir "/characters/" pour passer le guard isValidCharacterReference
    // qui gate l'activation du mode Redux (img2img).
    const refs = [
      "https://example.com/characters/hero-canon.jpg",
      "https://example.com/characters/hero-closeup.jpg",
      "https://example.com/characters/hero-action.jpg",
    ];
    const req = buildFalGenerationRequest({
      mode: "PANEL_FINAL",
      positivePrompt: "hero closeup",
      negativePrompt: "",
      referenceImageUrls: refs,
      providerParams: { referencePolicy: "STRONG", panelCategory: "CHARACTER_LOCK" },
    });
    expect(req.ipAdapterReferenceUrls.length).toBeGreaterThanOrEqual(2);
    const payload = req.payload as Record<string, unknown>;
    expect(payload.image_urls).toEqual(req.ipAdapterReferenceUrls);
    expect(payload.reference_images).toEqual(req.ipAdapterReferenceUrls);
    expect(payload.image_url).toBe(refs[0]);
  });

  it("cappe à 4 refs max pour éviter la dilution des poids IP-Adapter", () => {
    const refs = Array.from({ length: 8 }, (_, i) => `https://example.com/characters/ref-${i}.jpg`);
    const req = buildFalGenerationRequest({
      mode: "PANEL_FINAL",
      positivePrompt: "scene",
      negativePrompt: "",
      referenceImageUrls: refs,
      providerParams: { referencePolicy: "STRONG", panelCategory: "CHARACTER_LOCK" },
    });
    expect(req.ipAdapterReferenceUrls.length).toBe(4);
  });

  it("dédoublonne les refs en conservant l'ordre d'origine", () => {
    const refs = [
      "https://example.com/characters/a.jpg",
      "https://example.com/characters/b.jpg",
      "https://example.com/characters/a.jpg",
      "https://example.com/characters/c.jpg",
    ];
    const req = buildFalGenerationRequest({
      mode: "PANEL_FINAL",
      positivePrompt: "scene",
      negativePrompt: "",
      referenceImageUrls: refs,
      providerParams: { referencePolicy: "STRONG", panelCategory: "CHARACTER_LOCK" },
    });
    expect(req.ipAdapterReferenceUrls).toEqual([
      "https://example.com/characters/a.jpg",
      "https://example.com/characters/b.jpg",
      "https://example.com/characters/c.jpg",
    ]);
  });

  it("ignore les refs si referencePolicy=NONE", () => {
    const req = buildFalGenerationRequest({
      mode: "PANEL_FINAL",
      positivePrompt: "scene",
      negativePrompt: "",
      referenceImageUrls: ["https://example.com/characters/a.jpg", "https://example.com/characters/b.jpg"],
      providerParams: { referencePolicy: "NONE" },
    });
    expect(req.effectiveReferenceUrls).toEqual([]);
    expect(req.ipAdapterReferenceUrls).toEqual([]);
    const payload = req.payload as Record<string, unknown>;
    expect(payload.image_urls).toBeUndefined();
  });
});
