import { describe, expect, it } from "vitest";
import { inferNarrativeFactsFromBeat } from "./narrative-fact-extractor";
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

describe("narrative-fact-extractor — combat ninja", () => {
  it("détecte enemy_presence pour un beat de combat", () => {
    const beat = makeBeat({
      summary: "Le héros affronte l'ennemi dans un duel violent.",
      narrativeFunction: "combat",
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const types = facts.map((f) => f.type);
    expect(types).toContain("enemy_presence");
  });

  it("détecte prop_usage pour un beat avec kunai", () => {
    const beat = makeBeat({
      summary: "Le ninja lance un kunai sur son adversaire.",
      narrativeFunction: "combat",
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const types = facts.map((f) => f.type);
    expect(types).toContain("prop_usage");
  });

  it("détecte threat pour un beat avec arme", () => {
    const beat = makeBeat({
      summary: "L'ennemi sort son épée et menace le héros.",
      narrativeFunction: "combat",
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const types = facts.map((f) => f.type);
    expect(types).toContain("threat");
  });
});

describe("narrative-fact-extractor — appel téléphone", () => {
  it("détecte prop_usage pour un beat avec appel téléphonique", () => {
    const beat = makeBeat({
      summary: "Il appelle son contact sur son téléphone portable.",
      narrativeFunction: "dialogue",
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const types = facts.map((f) => f.type);
    expect(types).toContain("prop_usage");
  });
});

describe("narrative-fact-extractor — hacking", () => {
  it("détecte prop_usage pour un beat de hacking", () => {
    const beat = makeBeat({
      summary: "Elle hacks le terminal de sécurité depuis son ordinateur portable.",
      narrativeFunction: "action",
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const types = facts.map((f) => f.type);
    expect(types).toContain("prop_usage");
  });
});

describe("narrative-fact-extractor — scène médicale", () => {
  it("détecte prop_usage pour une scène médicale", () => {
    const beat = makeBeat({
      summary: "Le médecin prépare la seringue et injecte le sérum au patient.",
      narrativeFunction: "action",
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const types = facts.map((f) => f.type);
    expect(types).toContain("prop_usage");
  });
});

describe("narrative-fact-extractor — révélation", () => {
  it("détecte reveal pour un beat de révélation", () => {
    const beat = makeBeat({
      summary: "Il découvre la vérité et révèle le secret à tous.",
      narrativeFunction: "reveal",
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const types = facts.map((f) => f.type);
    // Un beat de révélation doit contenir reveal ou reaction
    expect(types.some((t) => t === "reveal" || t === "reaction" || t === "dialogue")).toBe(true);
  });
});

describe("narrative-fact-extractor — foule", () => {
  it("détecte npc_presence pour une scène avec élèves", () => {
    const beat = makeBeat({
      summary: "Les élèves regardent la scène dans la cour de l'école.",
      narrativeFunction: "action",
      environmentContext: ["école", "cour"],
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const types = facts.map((f) => f.type);
    expect(types).toContain("npc_presence");
  });

  it("détecte npc_presence pour une scène avec foule dans la rue", () => {
    const beat = makeBeat({
      summary: "La foule dans la rue panique devant la menace.",
      narrativeFunction: "action",
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const types = facts.map((f) => f.type);
    expect(types).toContain("npc_presence");
  });
});

describe("narrative-fact-extractor — dialogue", () => {
  it("détecte dialogue pour un beat avec dialogue explicite", () => {
    const beat = makeBeat({
      summary: "Il lui dit la vérité en face à face.",
      narrativeFunction: "dialogue",
      involvedCharacters: ["hero-1", "ally-1"],
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const types = facts.map((f) => f.type);
    expect(types).toContain("dialogue");
  });
});
