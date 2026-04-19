/**
 * P2.3 — Eval harness fixtures.
 *
 * Dataset métier minimal pour détecter les régressions de routing / focus.
 * Chaque fixture définit :
 *   - `input` (strict subset de `BuildRoutingContextInput`)
 *   - `expected.dominantKind` (canonical DominantKind)
 *   - `expected.heroFocus` (boolean)
 *   - `expected.panelCategory` (sortie de `computeFalSceneAssessment`)
 *   - `expected.referencePolicy` (pas l'exhaustif, juste la classe)
 *   - `forbiddenModes` (ex: un cutaway décor NE DOIT PAS être CHARACTER_LOCK)
 *
 * Les fixtures sont consommées par `fixtures.test.ts` qui exécute
 * `buildRoutingContextV2` + `computeFalSceneAssessment` sur chaque cas et
 * vérifie les invariants.
 */

import type { BuildRoutingContextInput } from "../routing-context";
import type { DominantSubjectKind } from "../dominant-subject";

export type RoutingPolicy = "STRONG" | "LIGHT" | "NONE";
export type RoutingPanelCategory =
  | "CHARACTER_LOCK"
  | "ESTABLISHING_ENVIRONMENT"
  | "CHARACTER_IN_SCENE"
  | "ACTION_BEAT"
  | "UNKNOWN";

export type RoutingFixture = {
  id: string;
  description: string;
  input: BuildRoutingContextInput;
  expected: {
    dominantKind: DominantSubjectKind;
    heroFocus: boolean;
    panelCategory?: RoutingPanelCategory;
    referencePolicyIn?: RoutingPolicy[];
  };
  forbidden: {
    panelCategoryNotIn?: RoutingPanelCategory[];
    heroFocusMustBeFalse?: boolean;
  };
};

const emptyPanel = {
  panelNumber: 1,
  camera: "",
  caption: "",
  prompt: "",
  characters: [] as string[],
} as const;

/**
 * Dataset v1 : 10 fixtures minimum couvrant les cas essentiels listés dans
 * le TODO. Ajoutable par la suite sans toucher au harness.
 */
export const ROUTING_FIXTURES: RoutingFixture[] = [
  {
    id: "hero-closeup",
    description: "Gros plan du héros sur une expression clé",
    input: {
      intensityLayer: "TEEN",
      panel: { ...emptyPanel, characters: ["hero"], camera: "closeup", caption: "le héros sourit" },
      panelContract: { shotType: "closeup", purpose: "reaction" },
      hasCanonRef: true,
      subjectFocus: "hero",
    },
    expected: {
      dominantKind: "hero",
      heroFocus: true,
      panelCategory: "CHARACTER_LOCK",
      referencePolicyIn: ["STRONG"],
    },
    forbidden: {},
  },
  {
    id: "enemy-closeup-with-hero-present",
    description: "Gros plan sur un antagoniste alors que le héros est dans la scène",
    input: {
      intensityLayer: "TEEN",
      panel: { ...emptyPanel, characters: ["hero", "antagonist"], camera: "closeup", caption: "l'antagoniste parle" },
      panelContract: { shotType: "closeup", purpose: "reaction" },
      hasCanonRef: true,
      subjectFocus: "enemy",
      panelCharacterImportanceTiers: ["MAIN_HERO", "IMPORTANT_SUPPORTING_CHARACTER"],
    },
    expected: {
      dominantKind: "enemy",
      heroFocus: false,
    },
    forbidden: { heroFocusMustBeFalse: true },
  },
  {
    id: "reaction-npc",
    description: "Plan réaction d'un PNJ important (subjectFocus=npc)",
    input: {
      intensityLayer: "TEEN",
      panel: { ...emptyPanel, characters: ["npc-1"], camera: "closeup", caption: "le PNJ écarquille les yeux" },
      panelContract: { shotType: "closeup", purpose: "reaction", cutawayType: "reaction" },
      hasCanonRef: false,
      subjectFocus: "npc",
    },
    expected: {
      dominantKind: "npc",
      heroFocus: false,
    },
    forbidden: { panelCategoryNotIn: ["CHARACTER_LOCK"] },
  },
  {
    id: "crowd-scene",
    description: "Panel foule : subjectFocus=group, héros dans le cast",
    input: {
      intensityLayer: "TEEN",
      panel: { ...emptyPanel, characters: ["hero", "npc-1", "npc-2"], camera: "wide", caption: "la foule s'agite autour du héros" },
      panelContract: { shotType: "wide", purpose: "dialogue", cutawayType: "crowd", npcGroupPresence: ["foule"] },
      hasCanonRef: true,
      subjectFocus: "group",
    },
    expected: {
      dominantKind: "group",
      heroFocus: false,
    },
    forbidden: { panelCategoryNotIn: ["CHARACTER_LOCK"], heroFocusMustBeFalse: true },
  },
  {
    id: "prop-insert",
    description: "Insert objet : une lettre posée sur une table, héros hors champ",
    input: {
      intensityLayer: "TEEN",
      panel: { ...emptyPanel, characters: [], camera: "extreme_closeup", caption: "une lettre pliée sur la table", prompt: "gros plan sur la lettre" },
      panelContract: { shotType: "extreme_closeup", purpose: "reveal", cutawayType: "prop_insert" },
      hasCanonRef: false,
      subjectFocus: "prop",
    },
    expected: {
      dominantKind: "prop",
      heroFocus: false,
    },
    forbidden: { panelCategoryNotIn: ["CHARACTER_LOCK"], heroFocusMustBeFalse: true },
  },
  {
    id: "environment-establishing",
    description: "Plan d'ensemble d'un lieu, héros présent en silhouette",
    input: {
      intensityLayer: "TEEN",
      panel: { ...emptyPanel, characters: ["hero"], camera: "wide", caption: "vue d'ensemble de la cité", prompt: "panoramic establishing shot of the city" },
      panelContract: { shotType: "wide", purpose: "establishing", cutawayType: "environment_establishing" },
      hasCanonRef: true,
      subjectFocus: "environment",
    },
    expected: {
      dominantKind: "environment",
      heroFocus: false,
      panelCategory: "ESTABLISHING_ENVIRONMENT",
    },
    forbidden: {
      panelCategoryNotIn: ["CHARACTER_LOCK"],
      heroFocusMustBeFalse: true,
    },
  },
  {
    id: "aftermath-panel",
    description: "Panel aftermath : champ de bataille après combat",
    input: {
      intensityLayer: "TEEN",
      panel: { ...emptyPanel, characters: [], camera: "wide", caption: "champ de bataille fumant", prompt: "wide shot of the aftermath" },
      panelContract: { shotType: "wide", purpose: "aftermath", cutawayType: "aftermath" },
      hasCanonRef: false,
      subjectFocus: "aftermath",
    },
    expected: {
      dominantKind: "aftermath",
      heroFocus: false,
    },
    forbidden: { panelCategoryNotIn: ["CHARACTER_LOCK"], heroFocusMustBeFalse: true },
  },
  {
    id: "transition-panel",
    description: "Transition temporelle : ciel qui passe du jour à la nuit",
    input: {
      intensityLayer: "TEEN",
      panel: { ...emptyPanel, characters: [], camera: "wide", caption: "passage jour → nuit", prompt: "transition environment" },
      panelContract: { shotType: "wide", purpose: "establishing", cutawayType: "environment_establishing" },
      hasCanonRef: false,
      subjectFocus: "environment",
    },
    expected: {
      dominantKind: "environment",
      heroFocus: false,
      panelCategory: "ESTABLISHING_ENVIRONMENT",
    },
    forbidden: { panelCategoryNotIn: ["CHARACTER_LOCK"] },
  },
  {
    id: "enemy-reveal-with-hero-absent",
    description: "Reveal d'un antagoniste, cast ne contient QUE l'ennemi",
    input: {
      intensityLayer: "TEEN",
      panel: { ...emptyPanel, characters: ["antagonist"], camera: "medium", caption: "l'antagoniste apparaît" },
      panelContract: { shotType: "medium", purpose: "reveal", cutawayType: "enemy_reveal" },
      hasCanonRef: true,
      subjectFocus: "enemy",
      panelCharacterImportanceTiers: ["IMPORTANT_SUPPORTING_CHARACTER"],
    },
    expected: {
      dominantKind: "enemy",
      heroFocus: false,
    },
    forbidden: { heroFocusMustBeFalse: true },
  },
  {
    id: "hero-action-no-cutaway",
    description: "Héros en action sans cutaway, subjectFocus explicite=hero",
    input: {
      intensityLayer: "TEEN",
      panel: { ...emptyPanel, characters: ["hero"], camera: "medium", caption: "le héros saute", prompt: "hero leaps into action" },
      panelContract: { shotType: "medium", purpose: "action" },
      hasCanonRef: true,
      subjectFocus: "hero",
    },
    expected: {
      dominantKind: "hero",
      heroFocus: true,
    },
    forbidden: {},
  },
];
