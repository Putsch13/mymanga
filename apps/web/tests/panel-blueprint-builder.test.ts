import { describe, expect, it } from "vitest";
import {
  buildPanelBlueprintsFromBeat,
  inferNarrativeFactsFromBeat,
  inferRequiredPropsFromBeat,
} from "@manga-ai-studio/ai";
import type { ProductionBeat } from "@manga-ai-studio/core";

function makeBeat(overrides: Partial<ProductionBeat> = {}): ProductionBeat {
  return {
    beatId: "beat-1",
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

const context = { heroCharacterId: "hero-1" };

describe("panel-blueprint-builder — beat combat", () => {
  it("génère un panel focus ennemi pour un beat de combat", () => {
    const beat = makeBeat({
      summary: "Le héros affronte l'ennemi dans un duel violent.",
      narrativeFunction: "combat",
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const props = inferRequiredPropsFromBeat(beat, facts, {});
    const blueprints = buildPanelBlueprintsFromBeat(beat, facts, props, context);

    const enemyPanel = blueprints.find((bp) => bp.subjectFocus === "enemy");
    expect(enemyPanel).toBeDefined();
    expect(enemyPanel?.mustShowEnemy).toBe(true);
  });

  it("génère un panel aftermath pour un beat de combat", () => {
    const beat = makeBeat({
      summary: "Le héros combat l'ennemi et le frappe violemment.",
      narrativeFunction: "combat",
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const props = inferRequiredPropsFromBeat(beat, facts, {});
    const blueprints = buildPanelBlueprintsFromBeat(beat, facts, props, context);

    const aftermathPanel = blueprints.find((bp) => bp.subjectFocus === "aftermath" || bp.cutawayType === "aftermath");
    expect(aftermathPanel).toBeDefined();
  });

  it("génère un insert prop pour un beat de combat avec arme", () => {
    const beat = makeBeat({
      summary: "Le ninja lance un kunai sur l'ennemi.",
      narrativeFunction: "combat",
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const props = inferRequiredPropsFromBeat(beat, facts, { universeType: "ninja" });
    const blueprints = buildPanelBlueprintsFromBeat(beat, facts, props, context);

    const propPanel = blueprints.find((bp) => bp.subjectFocus === "prop" || bp.cutawayType === "prop_insert");
    expect(propPanel).toBeDefined();
  });
});

describe("panel-blueprint-builder — beat dialogue tendu", () => {
  it("génère un panel avec speaker anchor pour un beat de dialogue tendu", () => {
    const beat = makeBeat({
      summary: "Le héros dit la vérité à son adversaire dans une tension extrême et lui annonce l'ultimatum.",
      narrativeFunction: "dialogue",
      dramaticChange: "confrontation directe",
      involvedCharacters: ["hero-1", "villain-1"],
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const props = inferRequiredPropsFromBeat(beat, facts, {});
    const blueprints = buildPanelBlueprintsFromBeat(beat, facts, props, context);

    const speakerPanel = blueprints.find((bp) => bp.dialogueCarrier === "speaker_visible");
    expect(speakerPanel).toBeDefined();
  });

  it("génère un panel de réaction pour un beat de dialogue tendu", () => {
    const beat = makeBeat({
      summary: "Il annonce la nouvelle et attend la réaction de son interlocuteur.",
      narrativeFunction: "dialogue",
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const props = inferRequiredPropsFromBeat(beat, facts, {});
    const blueprints = buildPanelBlueprintsFromBeat(beat, facts, props, context);

    const reactionPanel = blueprints.find((bp) => bp.subjectFocus === "reaction");
    expect(reactionPanel).toBeDefined();
  });
});

describe("panel-blueprint-builder — scène publique", () => {
  it("génère des panels avec requiredNpcCount > 0 pour une scène de foule", () => {
    const beat = makeBeat({
      summary: "Le héros traverse le marché bondé en cherchant sa cible dans la foule.",
      narrativeFunction: "movement",
      environmentContext: ["marché", "rue animée"],
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const props = inferRequiredPropsFromBeat(beat, facts, {});
    const blueprints = buildPanelBlueprintsFromBeat(beat, facts, props, context);

    const npcPanel = blueprints.find((bp) => bp.requiredNpcCount > 0);
    expect(npcPanel).toBeDefined();
    expect(npcPanel?.requiredNpcCount).toBeGreaterThan(0);
  });
});

describe("panel-blueprint-builder — objet clé", () => {
  it("génère un panel prop insert obligatoire si un objet est clé d'intrigue", () => {
    const beat = makeBeat({
      summary: "Il découvre la preuve cachée dans le dossier compromettant.",
      narrativeFunction: "reveal",
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const props = inferRequiredPropsFromBeat(beat, facts, {});
    const blueprints = buildPanelBlueprintsFromBeat(beat, facts, props, context);

    const propPanel = blueprints.find((bp) => bp.subjectFocus === "prop" || bp.cutawayType === "prop_insert");
    expect(propPanel).toBeDefined();
  });
});
