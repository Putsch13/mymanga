/**
 * P2-7 — Golden fixtures for production plan QA.
 *
 * 10 scenario fixtures covering the full spectrum of chapter types.
 * Each fixture provides beats + VisualWorldContract + expected assertions.
 */

import type { NormalizedBeat } from "../../normalize-outline";

export interface GoldenFixture {
  id: string;
  label: string;
  beats: NormalizedBeat[];
  visualWorld: {
    props: Array<{
      id: string;
      canonicalName: string;
      category: string;
      visualDescription: string;
      continuityPolicy: string;
      visibilityPolicy: string | null;
      requiredBeatIds: string[];
    }>;
    npcGroups: Array<{
      id: string;
      label: string;
      role: string;
      visualProfile: string;
      requiredBeatIds: string[];
      recurrencePolicy: string;
    }>;
    locations: Array<{
      id: string;
      label: string;
      kind: string;
      description: string;
      source: string;
      canonPolicy: string;
    }>;
    beatBindings: Array<{
      beatId: string;
      locationId: string | null;
      primaryPropIds: string[];
      npcGroupIds: string[];
    }>;
  } | null;
  assertions: {
    expectPropInsert: boolean;
    expectNpcPanel: boolean;
    expectEnvironment: boolean;
    expectEnemyFocus: boolean;
    expectNoBlockingViolations: boolean;
    minPanels: number;
    maxPanels: number;
  };
}

function makeBeat(overrides: Partial<NormalizedBeat> & { beatId: string; beatIndex: number }): NormalizedBeat {
  return {
    summary: "Beat summary",
    narrativeFunction: "escalation",
    whyThisBeatExists: "narrative progression",
    dramaticChange: "tension rises",
    involvedCharacters: ["char_hero"],
    entities: [],
    props: [],
    locations: [],
    environmentContext: [],
    dialogueIntent: null,
    hasDialogue: false,
    hasAction: false,
    hasCombat: false,
    hasEmotion: false,
    hasTension: false,
    estimatedPanels: 4,
    criticality: "medium",
    sceneContext: null,
    opponent: null,
    unresolvedCharacterRefs: [],
    ...overrides,
  };
}

export const GOLDEN_FIXTURES: GoldenFixture[] = [
  {
    id: "1_mandatory_prop",
    label: "Chapitre avec objet narratif obligatoire (mustBeVisible=true)",
    beats: [
      makeBeat({ beatId: "ch1-beat1", beatIndex: 0, summary: "Hero discovers the ancient sword", props: ["ancient_sword"], hasAction: true }),
      makeBeat({ beatId: "ch1-beat2", beatIndex: 1, summary: "Hero trains with the sword", hasAction: true }),
      makeBeat({ beatId: "ch1-beat3", beatIndex: 2, summary: "Hero faces a challenge", hasCombat: true, opponent: "enemy_1" }),
      makeBeat({ beatId: "ch1-beat4", beatIndex: 3, summary: "Hero defeats the challenge", hasTension: true }),
      makeBeat({ beatId: "ch1-beat5", beatIndex: 4, summary: "Hero reflects on the journey", hasEmotion: true }),
      makeBeat({ beatId: "ch1-beat6", beatIndex: 5, summary: "Cliffhanger ending", narrativeFunction: "cliffhanger", hasTension: true }),
    ],
    visualWorld: {
      props: [{ id: "prop_sword", canonicalName: "Ancient Sword", category: "weapon", visualDescription: "A glowing ancient sword", continuityPolicy: "symbolic", visibilityPolicy: "visible", requiredBeatIds: ["ch1-beat1"] }],
      npcGroups: [],
      locations: [{ id: "loc_forest", label: "Dark Forest", kind: "outdoor", description: "Dense forest", source: "ai_generated", canonPolicy: "temporary" }],
      beatBindings: [{ beatId: "ch1-beat1", locationId: "loc_forest", primaryPropIds: ["prop_sword"], npcGroupIds: [] }],
    },
    assertions: { expectPropInsert: true, expectNpcPanel: false, expectEnvironment: true, expectEnemyFocus: true, expectNoBlockingViolations: true, minPanels: 70, maxPanels: 75 },
  },
  {
    id: "2_contractual_weapon",
    label: "Chapitre avec arme contractuelle",
    beats: [
      makeBeat({ beatId: "ch2-beat1", beatIndex: 0, summary: "A weapon is revealed", props: ["magic_staff"], hasAction: true }),
      makeBeat({ beatId: "ch2-beat2", beatIndex: 1, summary: "Fight breaks out", hasCombat: true, opponent: "dark_mage" }),
      makeBeat({ beatId: "ch2-beat3", beatIndex: 2, summary: "Weapon is used in battle", hasCombat: true }),
      makeBeat({ beatId: "ch2-beat4", beatIndex: 3, summary: "Victory through weapon power", hasTension: true }),
      makeBeat({ beatId: "ch2-beat5", beatIndex: 4, summary: "Aftermath of battle", hasEmotion: true }),
      makeBeat({ beatId: "ch2-beat6", beatIndex: 5, summary: "Next threat revealed", narrativeFunction: "cliffhanger" }),
    ],
    visualWorld: {
      props: [{ id: "prop_staff", canonicalName: "Magic Staff", category: "weapon", visualDescription: "Ornate staff with crystal", continuityPolicy: "symbolic", visibilityPolicy: "visible", requiredBeatIds: ["ch2-beat1", "ch2-beat3"] }],
      npcGroups: [],
      locations: [{ id: "loc_arena", label: "Battle Arena", kind: "indoor", description: "Ancient arena", source: "ai_generated", canonPolicy: "temporary" }],
      beatBindings: [{ beatId: "ch2-beat1", locationId: "loc_arena", primaryPropIds: ["prop_staff"], npcGroupIds: [] }],
    },
    assertions: { expectPropInsert: true, expectNpcPanel: false, expectEnvironment: true, expectEnemyFocus: true, expectNoBlockingViolations: true, minPanels: 70, maxPanels: 75 },
  },
  {
    id: "3_npc_group",
    label: "Chapitre avec groupe NPC requis",
    beats: [
      makeBeat({ beatId: "ch3-beat1", beatIndex: 0, summary: "Hero arrives at the village", locations: ["village"], hasDialogue: true }),
      makeBeat({ beatId: "ch3-beat2", beatIndex: 1, summary: "Meeting with fishermen group", hasDialogue: true, involvedCharacters: ["char_hero", "npc_fishermen"] }),
      makeBeat({ beatId: "ch3-beat3", beatIndex: 2, summary: "Fishermen warn about danger", hasDialogue: true }),
      makeBeat({ beatId: "ch3-beat4", beatIndex: 3, summary: "Hero investigates the threat", hasAction: true }),
      makeBeat({ beatId: "ch3-beat5", beatIndex: 4, summary: "Discovery of the truth", hasEmotion: true }),
      makeBeat({ beatId: "ch3-beat6", beatIndex: 5, summary: "Decision to act", hasTension: true }),
    ],
    visualWorld: {
      props: [],
      npcGroups: [{ id: "npc_fishermen", label: "Groupe de pêcheurs", role: "population", visualProfile: "Rugged sea folk", requiredBeatIds: ["ch3-beat2"], recurrencePolicy: "story_locked" }],
      locations: [{ id: "loc_village", label: "Fishing Village", kind: "outdoor", description: "Coastal village", source: "ai_generated", canonPolicy: "temporary" }],
      beatBindings: [{ beatId: "ch3-beat2", locationId: "loc_village", primaryPropIds: [], npcGroupIds: ["npc_fishermen"] }],
    },
    assertions: { expectPropInsert: false, expectNpcPanel: true, expectEnvironment: true, expectEnemyFocus: false, expectNoBlockingViolations: true, minPanels: 70, maxPanels: 75 },
  },
  {
    id: "4_visible_adversary",
    label: "Chapitre avec adversaire visible",
    beats: [
      makeBeat({ beatId: "ch4-beat1", beatIndex: 0, summary: "Tension builds", hasTension: true }),
      makeBeat({ beatId: "ch4-beat2", beatIndex: 1, summary: "Adversary appears", hasCombat: true, opponent: "boss_monster" }),
      makeBeat({ beatId: "ch4-beat3", beatIndex: 2, summary: "Initial clash", hasCombat: true, opponent: "boss_monster" }),
      makeBeat({ beatId: "ch4-beat4", beatIndex: 3, summary: "Hero is pushed back", hasTension: true }),
      makeBeat({ beatId: "ch4-beat5", beatIndex: 4, summary: "Counter-attack", hasCombat: true, hasAction: true }),
      makeBeat({ beatId: "ch4-beat6", beatIndex: 5, summary: "Cliffhanger", narrativeFunction: "cliffhanger", hasTension: true }),
    ],
    visualWorld: null,
    assertions: { expectPropInsert: false, expectNpcPanel: false, expectEnvironment: true, expectEnemyFocus: true, expectNoBlockingViolations: true, minPanels: 70, maxPanels: 75 },
  },
  {
    id: "5_no_mandatory_props",
    label: "Chapitre sans props obligatoires",
    beats: [
      makeBeat({ beatId: "ch5-beat1", beatIndex: 0, summary: "Morning routine", hasEmotion: true }),
      makeBeat({ beatId: "ch5-beat2", beatIndex: 1, summary: "Conversation with friend", hasDialogue: true }),
      makeBeat({ beatId: "ch5-beat3", beatIndex: 2, summary: "Walking through town", hasAction: true }),
      makeBeat({ beatId: "ch5-beat4", beatIndex: 3, summary: "Unexpected encounter", hasTension: true }),
      makeBeat({ beatId: "ch5-beat5", beatIndex: 4, summary: "Emotional revelation", hasEmotion: true }),
      makeBeat({ beatId: "ch5-beat6", beatIndex: 5, summary: "Quiet ending", hasEmotion: true }),
    ],
    visualWorld: null,
    assertions: { expectPropInsert: false, expectNpcPanel: false, expectEnvironment: true, expectEnemyFocus: false, expectNoBlockingViolations: true, minPanels: 70, maxPanels: 75 },
  },
  {
    id: "6_multi_locations",
    label: "Chapitre multi-lieux",
    beats: [
      makeBeat({ beatId: "ch6-beat1", beatIndex: 0, summary: "Scene at the harbor", locations: ["harbor"] }),
      makeBeat({ beatId: "ch6-beat2", beatIndex: 1, summary: "Travel to the mountain", locations: ["mountain_path"], hasAction: true }),
      makeBeat({ beatId: "ch6-beat3", beatIndex: 2, summary: "Arrival at the temple", locations: ["ancient_temple"] }),
      makeBeat({ beatId: "ch6-beat4", beatIndex: 3, summary: "Inside the temple", locations: ["temple_interior"], hasTension: true }),
      makeBeat({ beatId: "ch6-beat5", beatIndex: 4, summary: "Discovery in the depths", locations: ["temple_depths"], hasEmotion: true }),
      makeBeat({ beatId: "ch6-beat6", beatIndex: 5, summary: "Return to harbor", locations: ["harbor"], narrativeFunction: "cliffhanger" }),
    ],
    visualWorld: {
      props: [],
      npcGroups: [],
      locations: [
        { id: "loc_harbor", label: "Harbor", kind: "outdoor", description: "Busy port", source: "ai_generated", canonPolicy: "temporary" },
        { id: "loc_mountain", label: "Mountain Path", kind: "outdoor", description: "Rocky trail", source: "ai_generated", canonPolicy: "temporary" },
        { id: "loc_temple", label: "Ancient Temple", kind: "indoor", description: "Ruined temple", source: "ai_generated", canonPolicy: "temporary" },
      ],
      beatBindings: [
        { beatId: "ch6-beat1", locationId: "loc_harbor", primaryPropIds: [], npcGroupIds: [] },
        { beatId: "ch6-beat3", locationId: "loc_temple", primaryPropIds: [], npcGroupIds: [] },
      ],
    },
    assertions: { expectPropInsert: false, expectNpcPanel: false, expectEnvironment: true, expectEnemyFocus: false, expectNoBlockingViolations: true, minPanels: 70, maxPanels: 75 },
  },
  {
    id: "7_single_location",
    label: "Chapitre huis clos (1 lieu unique)",
    beats: [
      makeBeat({ beatId: "ch7-beat1", beatIndex: 0, summary: "Trapped in the room", locations: ["locked_room"], hasTension: true }),
      makeBeat({ beatId: "ch7-beat2", beatIndex: 1, summary: "Arguments between characters", hasDialogue: true, involvedCharacters: ["char_hero", "char_ally"] }),
      makeBeat({ beatId: "ch7-beat3", beatIndex: 2, summary: "Discovery of clue", hasTension: true }),
      makeBeat({ beatId: "ch7-beat4", beatIndex: 3, summary: "Tension peaks", hasEmotion: true }),
      makeBeat({ beatId: "ch7-beat5", beatIndex: 4, summary: "Resolution attempt", hasAction: true }),
      makeBeat({ beatId: "ch7-beat6", beatIndex: 5, summary: "Escape or failure", narrativeFunction: "cliffhanger" }),
    ],
    visualWorld: null,
    assertions: { expectPropInsert: false, expectNpcPanel: false, expectEnvironment: true, expectEnemyFocus: false, expectNoBlockingViolations: true, minPanels: 70, maxPanels: 75 },
  },
  {
    id: "8_combat_chapter",
    label: "Chapitre combat",
    beats: [
      makeBeat({ beatId: "ch8-beat1", beatIndex: 0, summary: "Before the fight", hasTension: true }),
      makeBeat({ beatId: "ch8-beat2", beatIndex: 1, summary: "Combat begins", hasCombat: true, opponent: "rival" }),
      makeBeat({ beatId: "ch8-beat3", beatIndex: 2, summary: "Exchange of blows", hasCombat: true, hasAction: true }),
      makeBeat({ beatId: "ch8-beat4", beatIndex: 3, summary: "Critical moment", hasCombat: true, criticality: "critical" }),
      makeBeat({ beatId: "ch8-beat5", beatIndex: 4, summary: "Final strike", hasCombat: true, hasAction: true }),
      makeBeat({ beatId: "ch8-beat6", beatIndex: 5, summary: "Aftermath", hasEmotion: true }),
    ],
    visualWorld: null,
    assertions: { expectPropInsert: false, expectNpcPanel: false, expectEnvironment: true, expectEnemyFocus: true, expectNoBlockingViolations: true, minPanels: 70, maxPanels: 75 },
  },
  {
    id: "9_emotional_dialogue",
    label: "Chapitre dialogue émotionnel (haute densité dialogue)",
    beats: [
      makeBeat({ beatId: "ch9-beat1", beatIndex: 0, summary: "Quiet morning", hasEmotion: true }),
      makeBeat({ beatId: "ch9-beat2", beatIndex: 1, summary: "Deep conversation begins", hasDialogue: true, hasEmotion: true }),
      makeBeat({ beatId: "ch9-beat3", beatIndex: 2, summary: "Painful confession", hasDialogue: true, hasEmotion: true }),
      makeBeat({ beatId: "ch9-beat4", beatIndex: 3, summary: "Emotional breakdown", hasEmotion: true }),
      makeBeat({ beatId: "ch9-beat5", beatIndex: 4, summary: "Reconciliation attempt", hasDialogue: true }),
      makeBeat({ beatId: "ch9-beat6", beatIndex: 5, summary: "Bittersweet conclusion", hasEmotion: true }),
    ],
    visualWorld: null,
    assertions: { expectPropInsert: false, expectNpcPanel: false, expectEnvironment: true, expectEnemyFocus: false, expectNoBlockingViolations: true, minPanels: 70, maxPanels: 75 },
  },
  {
    id: "10_revelation_cliffhanger",
    label: "Chapitre révélation finale (cliffhanger)",
    beats: [
      makeBeat({ beatId: "ch10-beat1", beatIndex: 0, summary: "Mysterious signs appear", hasTension: true }),
      makeBeat({ beatId: "ch10-beat2", beatIndex: 1, summary: "Investigation deepens", hasAction: true }),
      makeBeat({ beatId: "ch10-beat3", beatIndex: 2, summary: "Key witness speaks", hasDialogue: true }),
      makeBeat({ beatId: "ch10-beat4", beatIndex: 3, summary: "Evidence uncovered", hasTension: true }),
      makeBeat({ beatId: "ch10-beat5", beatIndex: 4, summary: "The truth is revealed", narrativeFunction: "reveal", hasEmotion: true, criticality: "critical" }),
      makeBeat({ beatId: "ch10-beat6", beatIndex: 5, summary: "Shocking cliffhanger", narrativeFunction: "cliffhanger", hasTension: true, criticality: "critical" }),
    ],
    visualWorld: null,
    assertions: { expectPropInsert: false, expectNpcPanel: false, expectEnvironment: true, expectEnemyFocus: false, expectNoBlockingViolations: true, minPanels: 70, maxPanels: 75 },
  },
];
