import { describe, expect, it } from "vitest";
import {
  makeVisibilityMode,
  matchesStrictPremiumPropEvidence,
  requiresVisibility,
  STRICT_PREMIUM_PROP_NAMES,
} from "./prop-evidence-validator";

describe("matchesStrictPremiumPropEvidence", () => {
  it("smartphone : exige le mot smartphone / téléphone portable / marque ou (appel + portable)", () => {
    expect(
      matchesStrictPremiumPropEvidence(
        { canonicalName: "smartphone", triggers: [] },
        "Il consulte son smartphone pour lire le message.",
      ),
    ).toBe(true);
    expect(
      matchesStrictPremiumPropEvidence(
        { canonicalName: "smartphone", triggers: [] },
        "Elle compose sur son téléphone portable.",
      ),
    ).toBe(true);
    expect(
      matchesStrictPremiumPropEvidence(
        { canonicalName: "smartphone", triggers: [] },
        "Il reçoit un appel sur son mobile.",
      ),
    ).toBe(true);
    expect(
      matchesStrictPremiumPropEvidence(
        { canonicalName: "smartphone", triggers: [] },
        "Il parle au téléphone fixe du bureau.",
      ),
    ).toBe(false);
    expect(
      matchesStrictPremiumPropEvidence(
        { canonicalName: "smartphone", triggers: [] },
        "Un livre ouvert sur la table.",
      ),
    ).toBe(false);
  });

  it("grimoire / talisman : mots dédiés", () => {
    expect(matchesStrictPremiumPropEvidence({ canonicalName: "grimoire", triggers: [] }, "Le grimoire s'ouvre seul.")).toBe(
      true,
    );
    expect(matchesStrictPremiumPropEvidence({ canonicalName: "grimoire", triggers: [] }, "Son spell book brûle.")).toBe(
      true,
    );
    expect(matchesStrictPremiumPropEvidence({ canonicalName: "grimoire", triggers: [] }, "Un livre de cuisine.")).toBe(
      false,
    );
    expect(matchesStrictPremiumPropEvidence({ canonicalName: "talisman", triggers: [] }, "Elle serre son talisman.")).toBe(
      true,
    );
    expect(matchesStrictPremiumPropEvidence({ canonicalName: "talisman", triggers: [] }, "Une amulette oubliée.")).toBe(
      true,
    );
  });

  it("document / photo evidence : preuves explicites", () => {
    expect(
      matchesStrictPremiumPropEvidence(
        { canonicalName: "document / dossier", triggers: [] },
        "Le dossier contient la preuve décisive.",
      ),
    ).toBe(true);
    expect(
      matchesStrictPremiumPropEvidence(
        { canonicalName: "photo / evidence", triggers: [] },
        "La photographie montre le suspect.",
      ),
    ).toBe(true);
    expect(
      matchesStrictPremiumPropEvidence(
        { canonicalName: "document / dossier", triggers: [] },
        "Il feuillette un roman policier.",
      ),
    ).toBe(false);
  });

  it("laptop / tablet : termes matériels explicites", () => {
    expect(
      matchesStrictPremiumPropEvidence({ canonicalName: "laptop", triggers: [] }, "Il code sur son laptop.")).toBe(true);
    expect(
      matchesStrictPremiumPropEvidence({ canonicalName: "laptop", triggers: [] }, "Ordinateur portable sur le bureau."),
    ).toBe(true);
    expect(
      matchesStrictPremiumPropEvidence({ canonicalName: "tablet", triggers: [] }, "Elle dessine sur sa tablette."),
    ).toBe(true);
    expect(matchesStrictPremiumPropEvidence({ canonicalName: "laptop", triggers: [] }, "Il écrit à la main.")).toBe(false);
  });

  it("STRICT_PREMIUM_PROP_NAMES couvre les canoniques sensibles", () => {
    for (const name of STRICT_PREMIUM_PROP_NAMES) {
      expect(name.length).toBeGreaterThan(0);
    }
    expect(STRICT_PREMIUM_PROP_NAMES.has("smartphone")).toBe(true);
    expect(STRICT_PREMIUM_PROP_NAMES.has("grimoire")).toBe(true);
  });
});

describe("requiresVisibility", () => {
  it("détecte les verbes d'usage explicite", () => {
    expect(requiresVisibility("Le héros brandit son sabre.")).toBe(true);
    expect(requiresVisibility("Elle saisit le dossier.")).toBe(true);
    expect(requiresVisibility("Discussion calme au café.")).toBe(false);
  });
});

describe("makeVisibilityMode", () => {
  it("passe en used_in_action quand requiresVisibility", () => {
    expect(makeVisibilityMode("Il tire avec son arme.", "on_body")).toBe("used_in_action");
  });

  it("conserve le défaut sinon", () => {
    expect(makeVisibilityMode("Vue d'ensemble de la ville.", "background_support")).toBe("background_support");
  });
});
