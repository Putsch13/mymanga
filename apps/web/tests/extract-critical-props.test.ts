/**
 * P1.4 (sprint 3) — Tests du helper `extractCriticalPropsFromPanelContractMeta`.
 *
 * Garanties métier vérifiées :
 *   - un prop `mustBeVisible: true` survit à la normalisation
 *   - un prop sans `canonicalName` est ignoré silencieusement (pas de crash)
 *   - une entrée non-objet (string, null, undefined) est ignorée
 *   - `hasMandatoryProps` = true dès qu'au moins un prop est mustBeVisible
 *   - `mandatoryCanonicalNames` reflète EXACTEMENT les props requis et
 *     permet donc au reroll de réinjecter ces noms dans le prompt positif.
 *   - metadata sans `requiredPropsTyped` ou mal typé retourne une extraction
 *     vide — pas d'exception.
 */

import { describe, it, expect } from "vitest";
import { extractCriticalPropsFromPanelContractMeta } from "@/lib/retry/extract-critical-props";

describe("extractCriticalPropsFromPanelContractMeta (P1.4)", () => {
  it("retourne une extraction vide pour undefined / null / non-objet", () => {
    expect(extractCriticalPropsFromPanelContractMeta(undefined).hasMandatoryProps).toBe(false);
    expect(extractCriticalPropsFromPanelContractMeta(null).hasMandatoryProps).toBe(false);
    expect(extractCriticalPropsFromPanelContractMeta("not-an-object").allProps).toEqual([]);
    expect(extractCriticalPropsFromPanelContractMeta(42).allProps).toEqual([]);
  });

  it("retourne une extraction vide si requiredPropsTyped est absent ou mal typé", () => {
    expect(
      extractCriticalPropsFromPanelContractMeta({ foo: "bar" }).allProps,
    ).toEqual([]);
    expect(
      extractCriticalPropsFromPanelContractMeta({ requiredPropsTyped: "nope" }).allProps,
    ).toEqual([]);
    expect(
      extractCriticalPropsFromPanelContractMeta({ requiredPropsTyped: {} }).allProps,
    ).toEqual([]);
  });

  it("normalise correctement un prop complet mustBeVisible=true", () => {
    const out = extractCriticalPropsFromPanelContractMeta({
      requiredPropsTyped: [
        {
          canonicalName: "katana",
          mustBeVisible: true,
          narrativeRole: "weapon",
          visibilityMode: "in_hand",
          category: "weapon",
        },
      ],
    });
    expect(out.allProps).toHaveLength(1);
    expect(out.mandatoryProps).toHaveLength(1);
    expect(out.hasMandatoryProps).toBe(true);
    expect(out.mandatoryCanonicalNames).toEqual(["katana"]);
    expect(out.mandatoryProps[0]).toMatchObject({
      canonicalName: "katana",
      mustBeVisible: true,
      narrativeRole: "weapon",
      visibilityMode: "in_hand",
      category: "weapon",
    });
  });

  it("ignore les entrées sans canonicalName ou non-objet", () => {
    const out = extractCriticalPropsFromPanelContractMeta({
      requiredPropsTyped: [
        { canonicalName: "phone", mustBeVisible: true },
        { mustBeVisible: true }, // pas de canonicalName
        null,
        "string",
        { canonicalName: "  ", mustBeVisible: true }, // whitespace only
      ],
    });
    expect(out.allProps).toHaveLength(1);
    expect(out.allProps[0]!.canonicalName).toBe("phone");
    expect(out.hasMandatoryProps).toBe(true);
  });

  it("distingue props mustBeVisible true/false et expose les deux listes", () => {
    const out = extractCriticalPropsFromPanelContractMeta({
      requiredPropsTyped: [
        { canonicalName: "evidence photo", mustBeVisible: true },
        { canonicalName: "background poster", mustBeVisible: false },
        { canonicalName: "pendant", mustBeVisible: true },
      ],
    });
    expect(out.allProps).toHaveLength(3);
    expect(out.mandatoryProps).toHaveLength(2);
    expect(out.mandatoryCanonicalNames).toEqual(["evidence photo", "pendant"]);
    expect(out.hasMandatoryProps).toBe(true);
  });

  it("mustBeVisible est stricte : ni \"true\" string, ni 1, ni undefined ne comptent", () => {
    const out = extractCriticalPropsFromPanelContractMeta({
      requiredPropsTyped: [
        { canonicalName: "a", mustBeVisible: "true" },
        { canonicalName: "b", mustBeVisible: 1 },
        { canonicalName: "c" }, // undefined → false
      ],
    });
    expect(out.allProps).toHaveLength(3);
    expect(out.mandatoryProps).toHaveLength(0);
    expect(out.hasMandatoryProps).toBe(false);
  });

  it("garantit que les noms canoniques critiques peuvent être réinjectés dans le prompt reroll (invariant)", () => {
    // Invariant : un retry sur un panel avec prop(s) critique(s) DOIT pouvoir
    // récupérer les noms canoniques pour les inscrire dans le prompt
    // positif sans jamais les perdre silencieusement.
    const out = extractCriticalPropsFromPanelContractMeta({
      requiredPropsTyped: [
        { canonicalName: "ancient talisman", mustBeVisible: true, narrativeRole: "payoff", visibilityMode: "foreground_insert" },
      ],
    });
    expect(out.mandatoryCanonicalNames).toContain("ancient talisman");
    expect(out.mandatoryProps[0]!.narrativeRole).toBe("payoff");
  });
});
