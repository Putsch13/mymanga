/**
 * P8.25-32 — Tests anti-régression pour le pipeline premium stabilisé.
 *
 * Ces tests vérifient les comportements critiques qui ne doivent jamais
 * régresser après les corrections P0-P7.
 *
 * @module p8-anti-regression
 */

import { describe, expect, it } from "vitest";
import {
  buildChapterCastContract,
  buildChapterStoryContract,
  isSpeakerPanelForDialogueBeat,
  findBeatsWithMissingSpeakerPanels,
  isHeroRole,
} from "@manga-ai-studio/core";
import { runVisualDiscoveryPass } from "../passes/visual-discovery-pass";
import {
  runPropsQaPass,
  isNarrativeFunctionProp,
  isLocationAsProps,
} from "../passes/props-qa-pass";
import { runEnvironmentAnchorPass, extractPrimaryEnvironmentAnchorId } from "../passes/environment-anchor-pass";
import { runRenderModeNormalizer } from "../passes/render-mode-normalizer";
import { runCharacterIdentityFallback } from "../passes/character-identity-fallback";
import { runDialogueAutoRepairPass } from "../passes/dialogue-auto-repair-pass";
import { runRenderSpecRepairPass } from "../passes/render-spec-repair-pass";
import { validateRenderSpec, createDefaultChapterStyleBible } from "@manga-ai-studio/ai";

describe("P8.25-32 — Tests anti-régression pipeline premium", () => {
  // P8.25 — Test héros unique
  it("P8.25 — buildChapterCastContract lance une erreur si aucun héros", () => {
    expect(() =>
      buildChapterCastContract({
        chapterId: "ch-1",
        heroCharacterId: null,
        focusCharacterIds: [],
        characters: [],
      }),
    ).toThrow(/E_CAST_HERO_MISSING/);
  });

  it("P8.25 — buildChapterCastContract accepte un héros unique", () => {
    const contract = buildChapterCastContract({
      chapterId: "ch-1",
      heroCharacterId: "hero-1",
      focusCharacterIds: ["hero-1", "support-1"],
      characters: [
        { id: "hero-1", name: "Hero", roleType: "hero" },
        { id: "support-1", name: "Support", roleType: "support" },
      ],
    });
    expect(contract.heroCharacterId).toBe("hero-1");
    expect(contract.activeCharacterIds).toContain("hero-1");
    expect(contract.activeCharacterIds).toContain("support-1");
  });

  // P8.26 — Test détection PNJ
  it("P8.26 — VisualDiscoveryPass détecte les groupes PNJ", () => {
    const result = runVisualDiscoveryPass({
      chapterId: "ch-1",
      beats: [
        { beatId: "b1", summary: "Marius observe les pêcheurs au travail sur le port" },
      ],
      chapterSummary: "Une scène au port avec des marins",
      knownCharacters: [{ id: "hero", name: "Marius" }],
      knownLocations: [],
    });

    expect(result.contract.npcGroups.length).toBeGreaterThan(0);
    const pecheurs = result.contract.npcGroups.find(
      (n) => n.label === "pêcheurs" || n.label === "marins",
    );
    expect(pecheurs).toBeDefined();
  });

  // P8.27 — Test props interdits (fonctions narratives)
  it("P8.27 — isNarrativeFunctionProp détecte les fonctions narratives", () => {
    expect(isNarrativeFunctionProp("tension")).toBe(true);
    expect(isNarrativeFunctionProp("conflict")).toBe(true);
    expect(isNarrativeFunctionProp("mystery")).toBe(true);
    expect(isNarrativeFunctionProp("sword")).toBe(false);
    expect(isNarrativeFunctionProp("book")).toBe(false);
  });

  // P8.28 — Test lieux comme props interdits
  it("P8.28 — isLocationAsProps détecte les lieux utilisés comme props", () => {
    expect(isLocationAsProps("port")).toBe(true);
    expect(isLocationAsProps("forêt")).toBe(true);
    expect(isLocationAsProps("château")).toBe(true);
    expect(isLocationAsProps("épée")).toBe(false);
    expect(isLocationAsProps("livre")).toBe(false);
  });

  // P8.29 — Test speaker panel detection
  it("P8.29 — isSpeakerPanelForDialogueBeat détecte les panels speaker valides", () => {
    expect(
      isSpeakerPanelForDialogueBeat({
        dialogueCarrier: "speaker_visible",
        speakerAnchorCharacterId: "hero-1",
      }),
    ).toBe(true);

    expect(
      isSpeakerPanelForDialogueBeat({
        subjectFocus: "speaker",
        dialogueLines: [{ speaker: "Marius", text: "Hello" }],
      }),
    ).toBe(true);

    expect(
      isSpeakerPanelForDialogueBeat({
        mangaPanelFunction: "dialogue_speaker",
      }),
    ).toBe(true);

    expect(
      isSpeakerPanelForDialogueBeat({
        subjectFocus: "environment",
        dialogueLines: [],
      }),
    ).toBe(false);
  });

  // P8.30 — Test environment anchor
  it("P8.30 — extractPrimaryEnvironmentAnchorId extrait l'anchor correct", () => {
    const anchorId = extractPrimaryEnvironmentAnchorId(
      [{ id: "loc-1", name: "Port de Marseille" }],
      [{ id: "temp-1", label: "Quai" }],
    );
    expect(anchorId).toBe("loc-1");
  });

  it("P8.30 — extractPrimaryEnvironmentAnchorId retourne null si aucun lieu", () => {
    const anchorId = extractPrimaryEnvironmentAnchorId([], []);
    expect(anchorId).toBeNull();
  });

  // P8.31 — Test render mode normalizer
  it("P8.31 — runRenderModeNormalizer corrige character_focus + wide", () => {
    const result = runRenderModeNormalizer({
      panels: [
        {
          panelId: "p1",
          renderMode: "character_focus",
          shotType: "wide",
          promptIntent: "establishing shot of the port",
        },
      ],
    });

    expect(result.fixed).toBe(1);
    expect(result.contradictions.length).toBe(1);
    expect(result.panels[0]!.renderMode).toBe("establishing_environment");
  });

  // P8.32 — Test fatal vs non-fatal errors
  it("P8.32 — validateRenderSpec distingue erreurs fatales et non-fatales", () => {
    const styleBible = createDefaultChapterStyleBible();

    // Erreur fatale: renderMode sentinel
    const fatalResult = validateRenderSpec({
      panelId: "p1",
      pageNumber: 1,
      panelNumberInPage: 1,
      panelPurpose: "hero_focus",
      renderMode: "unknown" as never,
      shotType: "medium",
      subjectFocus: "hero",
      cameraAngle: "eye_level",
      cutawayType: "none",
      locationName: "port",
      actionLine: "Hero stands",
      emotionLine: "determined",
      dialogueIntent: null,
      visibleCharacters: [{ characterId: "c1", name: "Hero", role: "hero", poseIntent: null, expressionIntent: null }],
      styleBible,
      continuityLocks: { outfitLocks: [], bodyStateLocks: [], propLocks: [], environmentLocks: [] },
      imageReferences: { characterRefs: [{ characterId: "c1", url: "https://x/f.png", weight: 1 }], environmentRefs: [], panelRefs: [], styleRefs: [] },
      constraints: { mustShow: [], mustNotShow: [], forbiddenDrift: [], noTextInsideImage: true },
    });
    expect(fatalResult.fatalIssues.length).toBeGreaterThan(0);
    expect(fatalResult.ok).toBe(false);

    // Erreur non-fatale: contradiction
    const nonFatalResult = validateRenderSpec({
      panelId: "p1",
      pageNumber: 1,
      panelNumberInPage: 1,
      panelPurpose: "location_establishing",
      renderMode: "establishing_environment",
      shotType: "wide",
      subjectFocus: "hero", // contradiction!
      cameraAngle: "eye_level",
      cutawayType: "none",
      locationName: "port",
      actionLine: "Wide shot",
      emotionLine: "calm",
      dialogueIntent: null,
      visibleCharacters: [{ characterId: "c1", name: "Hero", role: "hero", poseIntent: null, expressionIntent: null }],
      styleBible,
      continuityLocks: { outfitLocks: [], bodyStateLocks: [], propLocks: [], environmentLocks: [] },
      imageReferences: { characterRefs: [{ characterId: "c1", url: "https://x/f.png", weight: 1 }], environmentRefs: [], panelRefs: [], styleRefs: [] },
      constraints: { mustShow: [], mustNotShow: [], forbiddenDrift: [], noTextInsideImage: true },
    });
    expect(nonFatalResult.nonFatalIssues.length).toBeGreaterThan(0);
    expect(nonFatalResult.ok).toBe(true); // Non-fatal, donc ok est true
  });

  // P8 — Test isHeroRole helper
  it("P8 — isHeroRole reconnaît les différentes variantes de héros", () => {
    expect(isHeroRole("hero")).toBe(true);
    expect(isHeroRole("HERO")).toBe(true);
    expect(isHeroRole("protagonist")).toBe(true);
    expect(isHeroRole("MAIN_CHARACTER")).toBe(true);
    expect(isHeroRole("main_hero")).toBe(true);
    expect(isHeroRole("support")).toBe(false);
    expect(isHeroRole("npc")).toBe(false);
    expect(isHeroRole(null)).toBe(false);
  });

  // P8 — Test visual discovery vehicle classification
  it("P8 — VisualDiscoveryPass classifie navire comme véhicule, pas lieu", () => {
    const result = runVisualDiscoveryPass({
      chapterId: "ch-1",
      beats: [
        { beatId: "b1", summary: "Marius monte sur le navire pour partir" },
      ],
      chapterSummary: "Voyage en bateau",
      knownCharacters: [{ id: "hero", name: "Marius" }],
      knownLocations: [{ id: "loc-1", name: "Port" }],
    });

    // Le navire doit être dans vehiclesOrLargeProps, pas dans locations
    const navireAsLocation = result.contract.locations.find(
      (l) => l.label.toLowerCase().includes("navire") || l.label.toLowerCase().includes("bateau"),
    );
    const navireAsVehicle = result.contract.vehiclesOrLargeProps.find(
      (v) => v.label.toLowerCase().includes("navire") || v.label.toLowerCase().includes("bateau"),
    );

    expect(navireAsLocation).toBeUndefined();
    expect(navireAsVehicle).toBeDefined();
  });
});
