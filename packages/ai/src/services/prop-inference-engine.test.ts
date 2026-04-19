import { describe, expect, it } from "vitest";
import { inferRequiredPropsFromBeat, inferNarrativeFactsFromBeat } from "@manga-ai-studio/ai";
import type { ProductionBeat } from "@manga-ai-studio/core";

function makeBeat(overrides: Partial<ProductionBeat> = {}): ProductionBeat {
  return {
    beatId: "beat-test",
    summary: overrides.summary ?? "Un beat de test",
    narrativeFunction: overrides.narrativeFunction ?? "test",
    whyThisBeatExists: "test",
    dramaticChange: "test",
    involvedCharacters: overrides.involvedCharacters ?? ["hero-1"],
    activeCanonConstraints: [],
    environmentContext: overrides.environmentContext ?? ["lieu de test"],
    visualPriority: "medium",
    estimatedPanels: 4,
    criticality: "medium",
    continuityDependencies: [],
    infoGained: null,
    emotionProduced: null,
    indispensabilityScore: 60,
    redundancyRisk: 20,
    ...overrides,
  };
}

describe("prop-inference-engine — kunai/shuriken ninja", () => {
  it("infère kunai comme prop obligatoire pour un beat ninja", () => {
    const beat = makeBeat({
      summary: "Le ninja lance un kunai sur son adversaire.",
      narrativeFunction: "combat",
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const props = inferRequiredPropsFromBeat(beat, facts, { universeType: "ninja" });
    const names = props.map((p) => p.canonicalName.toLowerCase());
    expect(names.some((n) => n.includes("kunai") || n.includes("shuriken") || n.includes("arme"))).toBe(true);
  });
});

describe("prop-inference-engine — téléphone/laptop", () => {
  it("infère téléphone comme prop pour un beat d'appel", () => {
    const beat = makeBeat({
      summary: "Il reçoit un appel urgent sur son téléphone portable.",
      narrativeFunction: "dialogue",
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const props = inferRequiredPropsFromBeat(beat, facts, {});
    const names = props.map((p) => p.canonicalName.toLowerCase());
    expect(names.some((n) => n.includes("téléphone") || n.includes("telephone") || n.includes("phone") || n.includes("portable"))).toBe(true);
  });

  it("infère laptop/ordinateur pour un beat de hacking", () => {
    const beat = makeBeat({
      summary: "Elle pirate le système depuis son ordinateur portable.",
      narrativeFunction: "action",
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const props = inferRequiredPropsFromBeat(beat, facts, {});
    const names = props.map((p) => p.canonicalName.toLowerCase());
    expect(names.some((n) => n.includes("ordinateur") || n.includes("laptop") || n.includes("terminal"))).toBe(true);
  });
});

describe("prop-inference-engine — laboratoire/seringue", () => {
  it("infère syringe comme prop pour une scène médicale avec seringue", () => {
    const beat = makeBeat({
      summary: "Le médecin prépare la seringue pour l'injection.",
      narrativeFunction: "action",
      environmentContext: ["laboratoire", "salle médicale"],
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const props = inferRequiredPropsFromBeat(beat, facts, { universeType: "medical" });
    const names = props.map((p) => p.canonicalName.toLowerCase());
    expect(names.some((n) => n.includes("syringe") || n.includes("seringue") || n.includes("medical kit"))).toBe(true);
  });
});

describe("prop-inference-engine — parchemin/rituel", () => {
  it("infère parchemin pour un beat de rituel mystique", () => {
    const beat = makeBeat({
      summary: "Il déroule le parchemin ancien et trace le sceau mystique.",
      narrativeFunction: "action",
      environmentContext: ["autel", "temple"],
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const props = inferRequiredPropsFromBeat(beat, facts, { universeType: "fantasy" });
    const names = props.map((p) => p.canonicalName.toLowerCase());
    expect(names.some((n) => n.includes("parchemin") || n.includes("sceau") || n.includes("scroll") || n.includes("talisman"))).toBe(true);
  });
});

describe("prop-inference-engine — bureau/badge/dossier", () => {
  it("infère dossier pour un beat de bureau", () => {
    const beat = makeBeat({
      summary: "L'agent consulte le dossier confidentiel sur son bureau.",
      narrativeFunction: "observation",
      environmentContext: ["bureau", "salle de réunion"],
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const props = inferRequiredPropsFromBeat(beat, facts, {});
    const names = props.map((p) => p.canonicalName.toLowerCase());
    expect(names.some((n) => n.includes("dossier") || n.includes("document") || n.includes("fichier"))).toBe(true);
  });
});

describe("prop-inference-engine — règle objet utilisé = objet visible", () => {
  it("marque mustBeVisible=true pour un prop utilisé en action de combat", () => {
    const beat = makeBeat({
      summary: "Il tranche l'ennemi avec sa lame.",
      narrativeFunction: "combat",
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const props = inferRequiredPropsFromBeat(beat, facts, { universeType: "ninja" });
    // Au moins un prop doit être inféré
    expect(props.length).toBeGreaterThan(0);
    // Au moins un prop doit être visible (action_tool ou verbe d'usage)
    const visibleProp = props.find((p) => p.mustBeVisible === true);
    expect(visibleProp).toBeDefined();
  });
});

describe("P0.4 — prop-inference-engine — ownership category", () => {
  it("attribue ownerCategory=guard pour des fusils dans un contexte de gardes", () => {
    const beat = makeBeat({
      summary: "Les gardes patrouillent avec leurs fusils dans le couloir.",
      narrativeFunction: "observation",
      environmentContext: ["couloir sécurisé", "poste de garde"],
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const props = inferRequiredPropsFromBeat(beat, facts, { universeType: "military" });
    const rifle = props.find((p) => p.canonicalName.toLowerCase().includes("rifle") || p.canonicalName.toLowerCase().includes("fusil"));
    expect(rifle).toBeDefined();
    expect(rifle?.ownerCategory).toBe("guard");
  });

  it("attribue ownerCategory=enemy pour des armes dans un contexte d'ennemis", () => {
    const beat = makeBeat({
      summary: "L'ennemi tire avec son pistolet vers le héros.",
      narrativeFunction: "combat",
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const props = inferRequiredPropsFromBeat(beat, facts, { universeType: "military" });
    const handgun = props.find((p) => p.canonicalName.toLowerCase().includes("handgun") || p.canonicalName.toLowerCase().includes("pistolet"));
    expect(handgun).toBeDefined();
    expect(handgun?.ownerCategory).toBe("enemy");
  });

  it("attribue ownerCategory=hero quand le héros est explicitement mentionné comme utilisant l'arme", () => {
    const beat = makeBeat({
      summary: "Le héros dégaine son pistolet et vise l'ennemi.",
      narrativeFunction: "combat",
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const props = inferRequiredPropsFromBeat(beat, facts, { universeType: "military", heroCharacterId: "hero-1" });
    const handgun = props.find((p) => p.canonicalName.toLowerCase().includes("handgun") || p.canonicalName.toLowerCase().includes("pistolet"));
    expect(handgun).toBeDefined();
    expect(handgun?.ownerCategory).toBe("hero");
  });

  it("attribue ownerCategory=guard pour des soldats avec armes", () => {
    const beat = makeBeat({
      summary: "Les soldats prennent position avec leurs fusils pointés vers l'entrée.",
      narrativeFunction: "observation",
      environmentContext: ["base militaire"],
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const props = inferRequiredPropsFromBeat(beat, facts, { universeType: "military" });
    // Au moins un prop weapon devrait être ownerCategory=guard
    const guardWeapon = props.find((p) => p.ownerCategory === "guard" && p.category === "weapon");
    expect(guardWeapon).toBeDefined();
  });

  it("conserve ownerCategory=unassigned pour des props ambigus", () => {
    const beat = makeBeat({
      summary: "Un téléphone sonne dans la pièce.",
      narrativeFunction: "dialogue",
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const props = inferRequiredPropsFromBeat(beat, facts, {});
    const phone = props.find((p) => p.canonicalName.toLowerCase().includes("phone") || p.canonicalName.toLowerCase().includes("smartphone"));
    // Sans contexte clair de propriétaire, le téléphone reste unassigned ou hero si heroCharacterId est fourni
    expect(phone).toBeDefined();
    expect(["unassigned", "hero"]).toContain(phone?.ownerCategory);
  });
});
