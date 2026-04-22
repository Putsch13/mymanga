/**
 * AUDIT COMMIT 7 — helpers partagés pour character canon.
 * On s'assure que studio et runtime s'appuieront sur la même logique :
 *  - collecte des refs (priorité lock, dédoublonnage)
 *  - binding LoRA actif (structure objet, scale 0.85 par défaut)
 *  - merge fingerprint (stableDNA <- fingerprint + bodyState)
 */
import { describe, it, expect } from "vitest";
import {
  collectCharacterReferenceAssets,
  encodeLegacyLoraBindingString,
  mergeCharacterFingerprint,
  resolveActiveCharacterLoraBinding,
} from "@/lib/canon/character-canon-helpers";

describe("collectCharacterReferenceAssets", () => {
  it("priorise les refs du lock puis les visualRefs, sans doublons", () => {
    const refs = collectCharacterReferenceAssets({
      lockCanonicalRefUrls: ["https://cdn/ref1.png", "https://cdn/ref2.png"],
      visualRefs: [
        { mediaAsset: { publicUrl: "https://cdn/ref2.png" }, imageUrl: null },
        { mediaAsset: null, imageUrl: "https://cdn/ref3.png" },
      ],
    });
    expect(refs).toEqual([
      "https://cdn/ref1.png",
      "https://cdn/ref2.png",
      "https://cdn/ref3.png",
    ]);
  });

  it("ignore les valeurs non string et renvoie tableau vide si rien d'exploitable", () => {
    const refs = collectCharacterReferenceAssets({
      lockCanonicalRefUrls: ["", null, 42],
      visualRefs: null,
    });
    expect(refs).toEqual([]);
  });
});

describe("resolveActiveCharacterLoraBinding", () => {
  it("retourne null sans triggerWord", () => {
    expect(
      resolveActiveCharacterLoraBinding({ activeLock: { triggerWord: "", loraAsset: null } }),
    ).toBeNull();
    expect(resolveActiveCharacterLoraBinding({ activeLock: null })).toBeNull();
  });

  it("construit un objet normalisé avec scale par défaut 0.85", () => {
    const b = resolveActiveCharacterLoraBinding({
      activeLock: {
        triggerWord: "hero_lock_v1",
        loraAsset: { publicUrl: "https://cdn/lora.safetensors" },
      },
    });
    expect(b).toEqual({
      triggerWord: "hero_lock_v1",
      url: "https://cdn/lora.safetensors",
      scale: 0.85,
    });
  });
});

describe("encodeLegacyLoraBindingString", () => {
  it("produit le format legacy triggerWord|url attendu par CharacterCanon", () => {
    expect(
      encodeLegacyLoraBindingString({
        triggerWord: "hero_lock_v1",
        url: "https://cdn/lora.safetensors",
        scale: 0.85,
      }),
    ).toBe("hero_lock_v1|https://cdn/lora.safetensors");
  });

  it("gère l'absence d'URL en chaîne vide (back-compat exacte)", () => {
    expect(
      encodeLegacyLoraBindingString({ triggerWord: "x", url: null, scale: 0.85 }),
    ).toBe("x|");
    expect(encodeLegacyLoraBindingString(null)).toBeNull();
  });
});

describe("mergeCharacterFingerprint", () => {
  it("renvoie stableDNA seul si fingerprint vide", () => {
    const dna = { hairColor: "black" };
    const out = mergeCharacterFingerprint({
      stableDNA: dna,
      characterFingerprint: {},
      bodyState: { injuries: [] },
    });
    expect(out).toBe(dna);
  });

  it("merge stableDNA + fingerprint + bodyState", () => {
    const out = mergeCharacterFingerprint({
      stableDNA: { hairColor: "black", scars: [] },
      characterFingerprint: { hairColor: "white", hardTraits: ["tall"] },
      bodyState: { currentInjuries: ["scratch"] },
    });
    expect(out.hairColor).toBe("white");
    expect(out.hardTraits).toEqual(["tall"]);
    expect(out.bodyState).toEqual({ currentInjuries: ["scratch"] });
  });
});
