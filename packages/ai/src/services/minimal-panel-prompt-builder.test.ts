import { describe, expect, it } from "vitest";
import {
  buildMinimalPanelPrompt,
  buildPromptNegativeBlock,
  describeCharacterWithCanon,
  detectNegationsInPositive,
  formatEnvironmentDnaForPrompt,
} from "./minimal-panel-prompt-builder";
import { createDefaultChapterStyleBible } from "../contracts/chapter-style-bible";
import type { PanelRenderSpec } from "../contracts/panel-render-spec";

function makeSpec(overrides: Partial<PanelRenderSpec> = {}): PanelRenderSpec {
  return {
    panelId: "p",
    pageNumber: 1,
    panelNumberInPage: 1,
    panelPurpose: "reaction_closeup",
    renderMode: "reaction_closeup",
    shotType: "closeup",
    cameraAngle: "eye_level",
    subjectFocus: "reaction",
    cutawayType: "reaction",
    locationName: "corridor",
    actionLine: "recoil",
    emotionLine: "shock",
    dialogueIntent: null,
    visibleCharacters: [
      { characterId: "c1", name: "Hero", role: "hero", poseIntent: null, expressionIntent: null },
    ],
    styleBible: createDefaultChapterStyleBible(),
    continuityLocks: { outfitLocks: [], bodyStateLocks: [], propLocks: [], environmentLocks: [] },
    imageReferences: { characterRefs: [], environmentRefs: [], panelRefs: [], styleRefs: [] },
    constraints: { mustShow: [], mustNotShow: [], forbiddenDrift: [], noTextInsideImage: true },
    ...overrides,
  };
}

describe("buildMinimalPanelPrompt", () => {
  it("reaction_closeup ne contient PAS 'wide establishing'", () => {
    const r = buildMinimalPanelPrompt(makeSpec());
    expect(r.positive.toLowerCase()).not.toContain("wide establishing");
  });

  it("insert_object ne contient PAS 'hero portrait' ni 'full character portrait'", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        renderMode: "insert_object",
        subjectFocus: "prop",
        shotType: "extreme_closeup",
        visibleCharacters: [],
      }),
    );
    expect(r.positive.toLowerCase()).not.toContain("hero portrait");
    expect(r.positive.toLowerCase()).not.toContain("full character portrait");
  });

  it("establishing_environment ne contient PAS 'tight face'", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        renderMode: "establishing_environment",
        subjectFocus: "environment",
        shotType: "wide",
        visibleCharacters: [],
      }),
    );
    expect(r.positive.toLowerCase()).not.toContain("tight face");
    expect(r.positive.toLowerCase()).not.toContain("hero portrait");
    expect(r.negative.toLowerCase()).toContain("tight face");
  });

  it("le prompt final tient entre 200 (plancher raisonnable) et 1200 chars max", () => {
    const r = buildMinimalPanelPrompt(makeSpec());
    expect(r.length).toBeLessThanOrEqual(1200);
    expect(r.length).toBeGreaterThan(200);
  });

  it("le negative contient toujours les interdits basiques (watermark, logo, 3d, photorealistic)", () => {
    const r = buildMinimalPanelPrompt(makeSpec());
    const neg = r.negative.toLowerCase();
    for (const tok of ["watermark", "logo", "3d render", "photorealistic"]) {
      expect(neg).toContain(tok);
    }
  });

  it("injecte une acting note de dialogue sans demander du texte dans l'image (TODO-23 / TODO-24)", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        renderMode: "dialogue_two_shot",
        panelPurpose: "dialogue_anchor",
        shotType: "medium",
        subjectFocus: "group",
        dialogueIntent: "Miya accuses Nelo of hiding the truth",
        visibleCharacters: [
          { characterId: "c1", name: "Miya", role: "hero", poseIntent: null, expressionIntent: null },
          { characterId: "c2", name: "Nelo", role: "support", poseIntent: null, expressionIntent: null },
        ],
      }),
    );
    // TODO-23 — la directive est désormais "Dialogue acting:" (pas "subtext:")
    // et l'intention dramatique est portée par la note, plus jamais le texte
    // littéral.
    expect(r.positive).toContain("Dialogue acting:");
    // TODO-24 — la négation "no speech bubbles or text in image" sort du
    // prompt positif (les modèles diffusion ignorent les négations dans le
    // positif). Les bulles / texte sont déjà bannis dans le negative.
    expect(r.positive).not.toContain("no speech bubbles or text in image");
    const neg = r.negative.toLowerCase();
    expect(neg).toContain("speech bubble");
    expect(neg).toContain("text in image");
  });

  it("un dialogue_two_shot ne présente plus un primary subject unique", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        renderMode: "dialogue_two_shot",
        panelPurpose: "dialogue_anchor",
        shotType: "medium",
        subjectFocus: "group",
        visibleCharacters: [
          { characterId: "c1", name: "Miya", role: "hero", poseIntent: null, expressionIntent: null },
          { characterId: "c2", name: "Nelo", role: "support", poseIntent: null, expressionIntent: null },
        ],
      }),
    );
    expect(r.positive.toLowerCase()).not.toContain("as primary subject");
    expect(r.positive).toContain("balanced framing");
  });

  it("injecte eyeColor du personnage dans le prompt positif", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        visibleCharacters: [
          {
            characterId: "c1",
            name: "Miya",
            role: "hero",
            poseIntent: null,
            expressionIntent: null,
            eyeColor: "amber",
          },
        ],
      }),
    );
    expect(r.positive.toLowerCase()).toContain("amber eyes");
  });

  it("injecte hairColor du personnage dans le prompt positif", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        visibleCharacters: [
          {
            characterId: "c1",
            name: "Miya",
            role: "hero",
            poseIntent: null,
            expressionIntent: null,
            hairColor: "crimson",
          },
        ],
      }),
    );
    expect(r.positive.toLowerCase()).toContain("crimson hair");
  });

  it("injecte les trigger words LoRA dans le bloc STYLE (PR7)", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        loraBindings: [
          {
            characterId: "c1",
            characterName: "Miya",
            url: "https://example.com/lora.safetensors",
            triggerWord: "miyastyle",
            scale: 0.85,
            source: "character_lora",
          },
        ],
      }),
    );
    expect(r.positive).toContain("LoRA cues:");
    expect(r.positive.toLowerCase()).toContain("miyastyle");
  });

  it("injecte hairColor + eyeColor du personnage dans le prompt", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        visibleCharacters: [
          {
            characterId: "c1",
            name: "Miya",
            role: "hero",
            poseIntent: null,
            expressionIntent: null,
            hairColor: "black",
            eyeColor: "blue",
            canonSignatureText: "short bob haircut",
            forbiddenDrift: ["red eyes", "long silver hair"],
          },
        ],
        constraints: {
          mustShow: [],
          mustNotShow: [],
          forbiddenDrift: ["red eyes", "long silver hair"],
          noTextInsideImage: true,
        },
      }),
    );
    expect(r.positive.toLowerCase()).toContain("black hair");
    expect(r.positive.toLowerCase()).toContain("blue eyes");
    expect(r.negative.toLowerCase()).toContain("red eyes");
  });

  it("creature_reveal: le positif impose la créature, pas un sujet environment-first", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        renderMode: "creature_reveal",
        panelPurpose: "creature_reveal",
        subjectFocus: "creature",
        shotType: "wide",
        visibleCharacters: [],
      }),
    );
    expect(r.positive.toLowerCase()).toContain("creature");
    expect(r.positive.toLowerCase()).toContain("non-human");
    expect(r.positive.toLowerCase()).not.toContain("environment-first panel");
  });

  it("hero_closeup garde les traits canoniques (signature + couleurs + drift interdit)", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        renderMode: "hero_closeup",
        panelPurpose: "hero_focus",
        subjectFocus: "hero",
        visibleCharacters: [
          {
            characterId: "h1",
            name: "Kael",
            role: "hero",
            poseIntent: null,
            expressionIntent: null,
            hairColor: "silver",
            eyeColor: "violet",
            canonSignatureText: "scarred left cheek",
            forbiddenDrift: ["bald", "beard"],
          },
        ],
        constraints: {
          mustShow: [],
          mustNotShow: [],
          forbiddenDrift: ["bald"],
          noTextInsideImage: true,
        },
      }),
    );
    expect(r.positive.toLowerCase()).toContain("scarred left cheek");
    expect(r.positive.toLowerCase()).toContain("silver hair");
    expect(r.positive.toLowerCase()).toContain("violet eyes");
    expect(r.negative.toLowerCase()).toContain("bald");
  });

  it("describeCharacterWithCanon inclut visualDNA (hairStyle, outfit)", () => {
    const line = describeCharacterWithCanon({
      characterId: "c1",
      name: "Rin",
      role: "hero",
      poseIntent: null,
      expressionIntent: null,
      visualDNA: {
        eyeColor: "amber",
        hairColor: "white",
        hairStyle: "twin tails with red ribbons",
        outfitSignature: "school blazer with armband",
      },
    });
    expect(line).toContain("amber eyes");
    expect(line).toContain("white hair");
    expect(line).toContain("twin tails with red ribbons");
    expect(line).toContain("wearing school blazer with armband");
  });

  it("describeCharacterWithCanon inclut les traits configurateur (structure)", () => {
    const line = describeCharacterWithCanon({
      characterId: "c1",
      name: "Kai",
      role: "hero",
      poseIntent: null,
      expressionIntent: null,
      visualDNA: {
        eyeColor: "green",
        hairColor: "black",
        faceShape: "heart-shaped",
        jawline: "angular",
        eyeShape: "almond",
        noseStyle: "straight narrow",
      },
    });
    expect(line).toContain("structure:");
    expect(line.toLowerCase()).toContain("heart-shaped");
    expect(line.toLowerCase()).toContain("angular");
    expect(line.toLowerCase()).toContain("almond");
  });

  it("ENVIRONMENT: sans locationName mais avec environmentLocks, évite neutral setting", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        locationName: "   ",
        continuityLocks: {
          outfitLocks: [],
          bodyStateLocks: [],
          propLocks: [],
          environmentLocks: ["rain-soaked neon alley with vending glow"],
        },
      }),
    );
    expect(r.positive).toContain("rain-soaked neon alley with vending glow");
    expect(r.positive.toLowerCase()).not.toContain("neutral setting");
  });

  it("hero_closeup inclut jusqu’à 5 mustShow dans ACTION", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        renderMode: "hero_closeup",
        panelPurpose: "hero_focus",
        subjectFocus: "hero",
        constraints: {
          mustShow: [
            "blade glint",
            "blood fleck",
            "torn sleeve",
            "dojo floor",
            "sweat bead",
            "sixth-must-not-appear-in-prompt",
          ],
          mustNotShow: [],
          forbiddenDrift: [],
          noTextInsideImage: true,
        },
      }),
    );
    expect(r.positive).toContain("blade glint");
    expect(r.positive).toContain("sweat bead");
    expect(r.positive).not.toContain("sixth-must-not-appear-in-prompt");
  });

  it("creature_reveal: le négatif interdit explicitement les contournements créature", () => {
    const neg = buildPromptNegativeBlock(
      makeSpec({
        renderMode: "creature_reveal",
        subjectFocus: "creature",
        panelPurpose: "creature_reveal",
        visibleCharacters: [],
      }),
    ).toLowerCase();
    expect(neg).toContain("no creature visible");
    expect(neg).toContain("environment only");
    expect(neg).toContain("hero only close-up");
  });

  it("combat_aftermath + mustShow créature: négatif renforcé (entités requises)", () => {
    const neg = buildPromptNegativeBlock(
      makeSpec({
        renderMode: "combat_aftermath",
        panelPurpose: "combat_aftermath",
        subjectFocus: "environment",
        shotType: "wide",
        visibleCharacters: [],
        constraints: {
          mustShow: ["creature corpse in foreground"],
          mustNotShow: [],
          forbiddenDrift: [],
          noTextInsideImage: true,
        },
      }),
    ).toLowerCase();
    expect(neg).toContain("environment only");
    expect(neg).toContain("empty battlefield");
  });

  it("n'utilise jamais 'ENVIRONMENT: unknown' dans le prompt", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        locationName: "unknown",
        continuityLocks: {
          outfitLocks: [],
          bodyStateLocks: [],
          propLocks: [],
          environmentLocks: [],
        },
      }),
    );
    expect(r.positive.toLowerCase()).not.toContain("environment: unknown");
  });

  it("remplace locationName='unknown' par le fallback story-consistent", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        locationName: "unknown",
        continuityLocks: {
          outfitLocks: [],
          bodyStateLocks: [],
          propLocks: [],
          environmentLocks: [],
        },
      }),
    );
    expect(r.positive.toLowerCase()).toContain("story-consistent");
  });

  it("utilise environmentLocks quand locationName est 'unknown'", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        locationName: "unknown",
        continuityLocks: {
          outfitLocks: [],
          bodyStateLocks: [],
          propLocks: [],
          environmentLocks: ["Clairière magique"],
        },
      }),
    );
    expect(r.positive).toContain("Clairière magique");
    expect(r.positive.toLowerCase()).not.toContain("environment: unknown");
  });

  it("capte environmentDNA avec plafonds (anchors, arch, atmos, lighting, props, avoid)", () => {
    const dna = formatEnvironmentDnaForPrompt({
      description: "D".repeat(300),
      visualAnchors: ["a1", "a2", "a3", "a4", "a5"],
      architectureHints: ["col1", "col2", "col3", "col4"],
      atmosphere: ["m1", "m2", "m3"],
      lighting: ["overcast", "rim light", "neon spill"],
      recurringProps: ["p1", "p2", "p3", "p4"],
      negativeConstraints: ["n1", "n2", "n3"],
    });
    expect(dna.startsWith("D".repeat(200))).toBe(true);
    expect(dna).toContain("a1");
    expect(dna).toContain("a3");
    expect(dna).not.toContain("a4");
    expect(dna).toContain("Arch: col1; col2; col3.");
    expect(dna).not.toContain("col4");
    expect(dna).toContain("Atmos: m1; m2.");
    expect(dna).not.toContain("m3");
    expect(dna).toContain("Light: overcast; rim light.");
    expect(dna).not.toContain("neon spill");
    expect(dna).toContain("Props: p1; p2; p3.");
    expect(dna).not.toContain("p4");
    expect(dna).toContain("Avoid: n1; n2.");
    expect(dna).not.toContain("n3");
    expect(dna.length).toBeLessThanOrEqual(520);
  });

  it("injecte le suffixe DNA dans le prompt positif", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        environmentDNA: {
          visualAnchors: ["stone arch", "wet cobbles"],
          lighting: ["overcast"],
        },
      }),
    );
    expect(r.positive).toContain("LOCATION:");
    expect(r.positive).toContain("stone arch");
    expect(r.positive).toContain("overcast");
  });

  it("injecte npcVisualDna (bloc NPCS) dans le bloc ENVIRONMENT du prompt", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        npcVisualDna: [
          {
            continuityId: "npc-dock-1",
            displayName: "Dock worker",
            category: "laborer",
            visualMarkers: ["oil-stained coveralls", "hard hat"],
          },
        ],
      }),
    );
    expect(r.positive).toContain("NPCS:");
    expect(r.positive).toContain("Dock worker");
    expect(r.positive.toLowerCase()).toContain("hard hat");
  });

  it("priorise créature / véhicule / faction avant les PNJ crowd dans le prompt (tableaux dédiés P0.12)", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        npcVisualDna: [
          {
            continuityId: "npc-a",
            displayName: "Crowd A",
            category: "passerby",
            visualMarkers: ["blurred"],
          },
        ],
        creatureVisualDna: [
          {
            id: "cre-1",
            label: "River wyrm",
            visualDescription: "iridescent scales, steam from nostrils",
            requiredBeatIds: [],
            threatLevel: "high",
          },
        ],
        vehicleVisualDna: [
          {
            id: "veh-1",
            label: "Patrol skiff",
            visualDescription: "rusted hull",
            requiredBeatIds: [],
            scale: "medium",
          },
        ],
      }),
    );
    const idxCreature = r.positive.indexOf("CREATURES:");
    const idxCrowd = r.positive.indexOf("NPCS:");
    expect(idxCreature).toBeGreaterThan(-1);
    expect(idxCrowd).toBeGreaterThan(-1);
    expect(idxCreature).toBeLessThan(idxCrowd);
    expect(r.positive).toContain("VEHICLES:");
  });

  it("injecte worldPropsVisualDna (bloc PROPS) dans le bloc ENVIRONMENT", () => {
    const r = buildMinimalPanelPrompt(
      makeSpec({
        worldPropsVisualDna: [
          {
            id: "prop-1",
            canonicalName: "Sealed crate",
            category: "container",
            visualDescription: "wooden crate with wax seals and rope handles",
            ownerCharacterId: null,
            locationId: null,
            requiredBeatIds: ["b1"],
            continuityPolicy: "recurring",
          },
        ],
      }),
    );
    expect(r.positive).toContain("PROPS:");
    expect(r.positive).toContain("Sealed crate");
    expect(r.positive.toLowerCase()).toContain("wax");
  });
});

describe("P0.5 — detectNegationsInPositive", () => {
  it("détecte 'no hero portrait' comme négation problématique", () => {
    const result = detectNegationsInPositive("wide view of the port, no hero portrait in frame");
    expect(result.length).toBeGreaterThan(0);
  });

  it("détecte 'without any characters' comme négation problématique", () => {
    const result = detectNegationsInPositive("establishing shot without any characters visible");
    expect(result.length).toBeGreaterThan(0);
  });

  it("détecte 'avoid showing hero' comme négation problématique", () => {
    const result = detectNegationsInPositive("environment panel, avoid showing hero or faces");
    expect(result.length).toBeGreaterThan(0);
  });

  it("tolère 'no dominant solo portrait' dans un contexte dialogue structuré", () => {
    const result = detectNegationsInPositive(
      "SUBJECT: dialogue staging, balanced framing, no dominant solo portrait",
    );
    expect(result).toHaveLength(0);
  });

  it("tolère 'composition excludes people' (formulation positive)", () => {
    const result = detectNegationsInPositive(
      "SUBJECT: isolated object, composition excludes people and faces",
    );
    expect(result).toHaveLength(0);
  });

  it("ne détecte rien dans un prompt positif propre", () => {
    const result = detectNegationsInPositive(
      "wide establishing shot of the port, morning light, fishing boats, atmospheric perspective",
    );
    expect(result).toHaveLength(0);
  });
});
