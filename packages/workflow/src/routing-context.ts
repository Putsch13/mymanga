/**
 * `buildRoutingContext` — construit le `RoutingContext` consommé par
 * `computeFalSceneAssessment` et par le moteur de reference-policy.
 *
 * Extrait de `pipeline-scene-builder.ts` pour isoler la logique de routing
 * (P0.1 — wiring `cutawayType`) et garder chaque module sous 250 lignes.
 *
 * Règles canoniques appliquées ici :
 *   - `cutawayType` non-héros prime sur toute déduction héros (env, prop,
 *     aftermath, reaction, crowd, npc_group, surveillance, threat_insert).
 *     `enemy` / `enemy_reveal` restent centrés personnage (sans biais héros).
 *   - `heroFocus` n'est vrai que si `subjectFocus === "hero"` OU qu'il n'y a
 *     aucun focus explicite ET que le héros est le seul perso dans le cast.
 *   - `dominantSubject` est calculé une seule fois ici et reste la source de
 *     vérité unique pour tous les consommateurs (fal-scene-strategy,
 *     reroll/retry, panel-blueprint).
 */
import type { StoryboardPanel, RoutingContext } from "@manga-ai-studio/ai";
import { resolveDominantSubject } from "./dominant-subject";

export interface BuildRoutingContextInput {
  intensityLayer: string;
  panel: StoryboardPanel;
  panelContract?: {
    purpose?: string;
    shotType?: "wide" | "medium" | "closeup" | "extreme_closeup" | "over_shoulder";
    cameraAngle?: string;
    npcPresence?: string[];
    npcGroupPresence?: string[];
    creaturePresence?: string[];
    mustShowLocationSignals?: string[];
    cutawayType?: string | null;
  };
  stylePack?: { backgroundDensity?: string | null } | null;
  hasCanonRef: boolean;
  adultEngine?: "realistic" | "fantasy";
  panelCharacterRoles?: string[];
  panelCharacterImportanceTiers?: Array<
    "MAIN_HERO" | "SECONDARY_CORE" | "IMPORTANT_SUPPORTING_CHARACTER" | "RECURRING_NPC" | "BACKGROUND_EXTRA"
  >;
  chapterLookProfileMode?: string | null;
  beatEventType?: string | null;
  subjectFocus?: RoutingContext["subjectFocus"];
}

const NON_HERO_FOCI = new Set([
  "npc",
  "important_npc",
  "enemy",
  "antagonist",
  "group",
  "environment",
  "aftermath",
  "prop",
  "reaction",
]);

function isCutawayNonHeroLike(cutawayType: string | null): boolean {
  if (cutawayType === null || cutawayType === "none") return false;
  // `enemy` / `enemy_reveal` → cutaway perso, mais pas héros (dominantSubject
  // renverra enemy, donc heroFocus sera déjà bloqué par `domForcesNonHero`).
  return cutawayType !== "enemy" && cutawayType !== "enemy_reveal";
}

export function buildRoutingContextV2(input: BuildRoutingContextInput): RoutingContext {
  const {
    intensityLayer,
    panel,
    panelContract,
    stylePack,
    hasCanonRef,
    adultEngine,
    panelCharacterRoles = [],
    panelCharacterImportanceTiers = [],
    chapterLookProfileMode,
    beatEventType,
    subjectFocus,
  } = input;

  const text = `${panel.camera} ${panel.caption} ${panel.prompt}`.toLowerCase();
  const heroPresent = panelCharacterRoles.some((role) => /hero|protagon|main_hero|héros|heros/i.test(role));
  const shotType = panelContract?.shotType ?? (/(wide|establishing|panorama|vue d'ensemble)/.test(text)
    ? "wide"
    : /(over shoulder|over-shoulder|par-dessus l'épaule)/.test(text)
      ? "over_shoulder"
      : /(extreme close)/.test(text)
        ? "extreme_closeup"
        : /(close-up|closeup|gros plan)/.test(text)
          ? "closeup"
          : "medium");

  const cutawayType = panelContract?.cutawayType ?? null;
  const cutawayNonHero = isCutawayNonHeroLike(cutawayType);
  const heroFocus =
    !cutawayNonHero
    && (subjectFocus === "hero"
      || (!subjectFocus && !NON_HERO_FOCI.has(subjectFocus ?? "") && heroPresent && panel.characters.length === 1));

  const dominantSubject = resolveDominantSubject({
    subjectFocus: subjectFocus ?? null,
    cutawayType,
    shotType,
    panelCharacterRoles,
    panelCharacterImportanceTiers,
  });

  return {
    mode: "PANEL_DRAFT",
    contentIntensityLayer: intensityLayer,
    adultEngine,
    isNewCharacter: false,
    hasCanonReferences: hasCanonRef,
    characterCountInScene: panel.characters.length,
    panelCharacterRoles,
    panelCharacterImportanceTiers,
    heroPresent,
    heroFocus,
    dominantSubject,
    purpose: panelContract?.purpose,
    npcCount:
      (panelContract?.npcPresence?.length ?? 0) > 0
        || /(crowd|guard|merchant|passant|client|audience|foule|garde)/.test(text)
        ? 1
        : 0,
    creatureCount:
      (panelContract?.creaturePresence?.length ?? 0) > 0
        || /(creature|monster|spirit|dragon|familiar|beast|mutant)/.test(text)
        ? 1
        : 0,
    hasNpcGroup: (panelContract?.npcGroupPresence?.length ?? 0) > 0,
    hasCreatureGroup: (panelContract?.creaturePresence?.length ?? 0) > 1,
    shotType,
    cameraAngle: panelContract?.cameraAngle,
    environmentPriority:
      (panelContract?.mustShowLocationSignals?.length ?? 0) >= 2
        || /(environment|decor|décor|background|ruins|city|forest|garden|lab|arena|crowd|school|campus|courtyard)/.test(text)
        ? "high"
        : panel.characters.length >= 2
          ? "medium"
          : "low",
    locationComplexity: Math.min(30, (panelContract?.mustShowLocationSignals?.length ?? 0) * 6),
    environmentDensityRequired:
      stylePack?.backgroundDensity === "high" || panelContract?.shotType === "wide"
        ? "high"
        : stylePack?.backgroundDensity === "low"
          ? "low"
          : "medium",
    continuityWeight: hasCanonRef ? 70 : 35,
    scenePurpose: panel.caption,
    styleBackgroundDensity: stylePack?.backgroundDensity ?? null,
    styleReferenceRequired: hasCanonRef || /(style|render family|ink|shading)/.test(text),
    needsInpaint: false,
    needsPoseVariation: false,
    preferPhotorealCover: false,
    explicitBlocked: intensityLayer === "RESTRICTED_BLOCKED_VISUAL",
    goreStylizedMature:
      intensityLayer === "MATURE_DRAMA"
      || intensityLayer === "MATURE_VISUAL"
      || intensityLayer === "ADULT_EXPLICIT",
    chapterLookProfileMode: chapterLookProfileMode ?? null,
    beatEventType: beatEventType ?? null,
    subjectFocus: subjectFocus ?? null,
    cutawayType,
  };
}
