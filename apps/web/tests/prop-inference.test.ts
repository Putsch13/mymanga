import { describe, expect, it } from "vitest";
import { inferRequiredPropsFromBeat } from "@manga-ai-studio/ai";
import type { ProductionBeat } from "@manga-ai-studio/core";

function makeBeat(overrides: Partial<ProductionBeat> = {}): ProductionBeat {
  return {
    beatId: "beat-test-1",
    summary: overrides.summary ?? "Un beat de test",
    narrativeFunction: overrides.narrativeFunction ?? "test",
    whyThisBeatExists: "test",
    dramaticChange: "test",
    involvedCharacters: [],
    activeCanonConstraints: [],
    environmentContext: overrides.environmentContext ?? [],
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

describe("prop-inference — alignement estimate (premium + monde visuel)", () => {
  it("injecte une prop VW avec suppressUniverseTemplateProps (même combinaison que la route estimate)", async () => {
    const { inferRequiredPropsFromBeat, indexVisualWorldPropsByBeat } = await import("@manga-ai-studio/ai");
    const beat = makeBeat({
      beatId: "beat-est-parity",
      summary: "Scène sobre sans mot-clé catalogue.",
      narrativeFunction: "dialogue",
    });
    const vwIndex = indexVisualWorldPropsByBeat({
      props: [
        {
          id: "p-parity",
          canonicalName: "Amulette du pacte",
          category: "accessory",
          visualDescription: "obsidienne",
          ownerCharacterId: null,
          locationId: null,
          requiredBeatIds: ["beat-est-parity"],
          continuityPolicy: "recurring",
        },
      ],
    });
    const props = inferRequiredPropsFromBeat(beat, [], {
      suppressUniverseTemplateProps: true,
      premiumStrictChapterSourcing: true,
      visualWorldPropsForBeat: vwIndex,
    });
    const amulet = props.find((p) => p.canonicalName === "Amulette du pacte");
    expect(amulet?.source).toBe("visual_world_contract");
    expect(amulet?.id.startsWith("prop_vw_")).toBe(true);
  });
});

describe("prop-inference — combat ninja", () => {
  it("infère kunai et shuriken pour un beat ninja avec action de lancer", () => {
    const beat = makeBeat({
      summary: "Le ninja lance un kunai sur l'ennemi et dégaine son shuriken.",
      narrativeFunction: "combat",
      environmentContext: ["forêt ninja"],
    });
    const props = inferRequiredPropsFromBeat(beat, [], { universeType: "ninja" });
    const names = props.map((p) => p.canonicalName);
    expect(names).toContain("kunai");
    expect(names).toContain("shuriken");
  });

  it("marque le kunai comme mustBeVisible quand il est lancé", () => {
    const beat = makeBeat({
      summary: "Le ninja lance un kunai sur l'adversaire.",
    });
    const props = inferRequiredPropsFromBeat(beat, [], { universeType: "ninja" });
    const kunai = props.find((p) => p.canonicalName === "kunai");
    expect(kunai).toBeDefined();
    expect(kunai?.mustBeVisible).toBe(true);
  });
});

describe("prop-inference — communication / appel", () => {
  it("infère un téléphone pour un beat d'appel", () => {
    const beat = makeBeat({
      summary: "Le personnage appelle son contact depuis son téléphone.",
      narrativeFunction: "communication",
    });
    const props = inferRequiredPropsFromBeat(beat, [], { universeType: "urban" });
    const names = props.map((p) => p.canonicalName);
    expect(names).toContain("smartphone");
  });

  it("marque le téléphone comme mustBeVisible lors d'un appel", () => {
    const beat = makeBeat({
      summary: "Elle appelle en urgence depuis son mobile.",
    });
    const props = inferRequiredPropsFromBeat(beat, [], {});
    const phone = props.find((p) => p.canonicalName === "smartphone");
    expect(phone?.mustBeVisible).toBe(true);
  });
});

describe("prop-inference — hacking / ordinateur", () => {
  it("infère laptop et terminal pour un beat de hacking", () => {
    const beat = makeBeat({
      summary: "Il tape sur son ordinateur pour pirater le système de sécurité.",
      narrativeFunction: "hacking",
      environmentContext: ["salle de serveurs"],
    });
    const props = inferRequiredPropsFromBeat(beat, [], { universeType: "cyberpunk" });
    const names = props.map((p) => p.canonicalName);
    expect(names.some((n) => n === "laptop" || n === "terminal")).toBe(true);
  });
});

describe("prop-inference — scène médicale", () => {
  it("infère bandage et kit médical pour un beat de soin", () => {
    const beat = makeBeat({
      summary: "Elle soigne la blessure avec un bandage et sa mallette médicale.",
      narrativeFunction: "medical",
    });
    const props = inferRequiredPropsFromBeat(beat, [], { universeType: "medical" });
    const names = props.map((p) => p.canonicalName);
    expect(names).toContain("bandage");
  });
});

describe("prop-inference — scène mystique", () => {
  it("infère talisman et grimoire pour un beat de rituel", () => {
    const beat = makeBeat({
      summary: "Le mage consulte son grimoire et active le talisman pour le rituel.",
      narrativeFunction: "ritual",
    });
    const props = inferRequiredPropsFromBeat(beat, [], { universeType: "fantasy" });
    const names = props.map((p) => p.canonicalName);
    expect(names).toContain("talisman");
    expect(names).toContain("grimoire");
  });
});

describe("prop-inference — règle objet utilisé = objet visible", () => {
  it("marque visibilityMode=used_in_action quand le verbe implique un usage actif", () => {
    const beat = makeBeat({
      summary: "Il tire avec son pistolet sur la cible.",
    });
    const props = inferRequiredPropsFromBeat(beat, [], { universeType: "military" });
    const gun = props.find((p) => p.canonicalName === "handgun");
    expect(gun).toBeDefined();
    expect(gun?.visibilityMode).toBe("used_in_action");
    expect(gun?.mustBeVisible).toBe(true);
  });
});
