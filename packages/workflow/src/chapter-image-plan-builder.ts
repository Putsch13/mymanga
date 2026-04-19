/**
 * ChapterImagePlanBuilder — compilateur visuel de chapitre.
 *
 * À partir du chapitre validé en 10 temps + de l'outline approuvé, produit
 * un plan complet des ~70–75 images du chapitre. Chaque item est un contrat
 * d'image minimal mais exhaustif, qui sera ensuite enrichi en
 * `CanonicalImagePromptPacket` avant l'envoi au provider.
 *
 * Règles :
 *   - aucune image n'est générée sans `ChapterImagePlanItem`
 *   - chaque image a une `imageIntentType` et un `dominantSubject` explicites
 *   - pas de "default = hero_portrait" : un cutaway reste un cutaway
 */

import type {
  ImageIntentType,
  ContentRating,
  HeroPresenceMode,
} from "@manga-ai-studio/core";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface ChapterImagePlanItem {
  imageId: string;
  projectId: string;
  chapterId: string;
  pageIndex: number;
  panelIndex: number;
  beatIndex: number;
  beatType: string;
  beatId: string;

  storyFunction: string;
  imageIntentType: ImageIntentType;
  dominantSubject: string;
  secondarySubjects: string[];
  cutawayType: string | null;

  cameraIntent: string;
  framingIntent: string;

  environmentPriority: number;
  characterPriority: number;
  npcPriority: number;
  propPriority: number;
  groupPriority: number;

  requiredCharacters: string[];
  requiredNpcs: string[];
  requiredProps: string[];
  requiredLocationSignals: string[];
  requiredDialogueLines: string[];
  requiredNarrativeContext: string[];
  continuityAnchors: string[];

  forbiddenFocus: string[];
  forbiddenFraming: string[];
  forbiddenPromptClauses: string[];

  targetLoras: string[];
  targetCanonSources: string[];
  promptLanguage: "en";
  contentRating: ContentRating;
  mangaStyleProfile: string;

  heroPresenceMode: HeroPresenceMode;
  heroVisualWeight: number;
}

export interface ChapterImagePlanBuilderInput {
  projectId: string;
  chapterId: string;
  mangaStyleProfile: string;
  contentRating: ContentRating;
  beats: ChapterBeatPlanInput[];
  totalImageTarget: number;
}

export interface ChapterBeatPlanInput {
  beatId: string;
  beatIndex: number;
  beatType: string;
  beatTitle: string;
  storyFunction: string;
  allocatedImages: number;
  panels: ChapterPanelPlanInput[];
}

export interface ChapterPanelPlanInput {
  pageIndex: number;
  panelIndex: number;
  subjectFocus?: string | null;
  cutawayType?: string | null;
  shotType?: string | null;
  cameraAngle?: string | null;
  mood?: string | null;
  panelCharacterRoles?: string[];
  panelCharacterNames?: string[];
  npcPresence?: string[];
  npcGroupPresence?: string[];
  requiredProps?: string[];
  mustShowLocationSignals?: string[];
  dialogueLines?: string[];
  narrativeContext?: string[];
  beatType?: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Intent resolution
// ────────────────────────────────────────────────────────────────────────────

const HERO_ROLE_RE = /hero|protagon|main_hero|h[eé]ros/i;
const ENEMY_ROLE_RE = /antagon|villain|rival|boss|enemy|ennemi/i;

function hasHero(roles: string[]): boolean {
  return roles.some((r) => HERO_ROLE_RE.test(r));
}

function hasEnemy(roles: string[]): boolean {
  return roles.some((r) => ENEMY_ROLE_RE.test(r));
}

/**
 * Résout le `imageIntentType` à partir des signaux du panel et du beat.
 * Ordre de priorité :
 *   1. cutawayType explicite (environment / prop / reaction / crowd / aftermath)
 *   2. group / guards / soldiers signals
 *   3. enemy_reveal / enemy_focus si ennemi dominant
 *   4. combat signals (turning_point > exchange)
 *   5. duo (hero + other)
 *   6. dialogue
 *   7. hero_action / hero_emotion / hero_focus par défaut si héros seul
 *   8. fallback = npc_focus si personnage non-héros
 *   9. environment_establishing si rien
 */
export function resolveImageIntent(panel: ChapterPanelPlanInput, beat: ChapterBeatPlanInput): ImageIntentType {
  const cutaway = (panel.cutawayType ?? "").toLowerCase();
  const focus = (panel.subjectFocus ?? "").toLowerCase();
  const roles = panel.panelCharacterRoles ?? [];
  const npcCount = (panel.npcPresence?.length ?? 0) + (panel.npcGroupPresence?.length ?? 0);
  const hero = hasHero(roles);
  const enemy = hasEnemy(roles);
  const beatType = (panel.beatType ?? beat.beatType ?? "").toLowerCase();

  // 1. Cutaways explicites
  if (cutaway === "environment" || cutaway === "environment_establishing") {
    return "environment_establishing";
  }
  if (cutaway === "location_transition") return "environment_transition";
  if (cutaway === "prop_insert" || cutaway === "object_insert") return "prop_insert";
  if (cutaway === "reaction" || cutaway === "reaction_insert") return "reaction_cutaway";
  if (cutaway === "aftermath" || cutaway === "movement_trace") return "aftermath";
  if (cutaway === "crowd") return "crowd_presence";
  if (cutaway === "npc_group" || cutaway === "surveillance") return "guard_group_focus";
  if (cutaway === "threat_insert") return "threat_presence";

  // 2. Magic / symbolic via focus
  if (focus === "magic" || /magic|spell|sort|rune/.test(beatType)) return "magic_manifestation";
  if (focus === "symbol" || /symbol|omen|pr[ée]sage/.test(beatType)) return "symbolic_insert";

  // 3. Group signals
  if (/crowd|foule|audience|masses/.test(focus)) return "crowd_presence";
  if (/guard|soldier|patrol|military/.test(focus)) {
    if (focus.includes("patrol")) return "soldier_patrol";
    return "guard_group_focus";
  }
  if (focus === "group" && npcCount >= 3) return "group_presence";

  // 4. Combat signals
  if (/turning_point|finisher|climax/.test(beatType) && (hero || enemy)) {
    return "combat_turning_point";
  }
  if (/combat|fight|duel|clash/.test(beatType) && hero && enemy) {
    return "combat_exchange";
  }

  // 5. Enemy focus
  if (focus === "enemy" || focus === "antagonist") {
    if (/reveal|introduction/.test(beatType)) return "enemy_reveal";
    return "enemy_focus";
  }

  // 6. Duo / shared spotlight
  if (hero && roles.length >= 2) {
    if (/dialog|talk|conversation|\btalk\b/.test(beatType)) return "dialogue_two_shot";
    return "hero_secondary_character";
  }

  // 7. Ally
  if (focus === "ally") return "ally_focus";

  // 8. Hero-only paths
  if (hero && roles.length === 1) {
    if (/action|combat|run|attack/.test(beatType)) return "hero_action";
    if (/emotion|reaction|react/.test(beatType) || panel.shotType === "closeup") {
      return "hero_emotion";
    }
    if (/duo/.test(beatType)) return "hero_duo";
    return "hero_focus";
  }

  // 9. Non-hero character
  if (focus === "npc" || focus === "important_npc") return "npc_focus";
  if (roles.length >= 1 && !hero) return "secondary_character_focus";

  // 10. Dialogue anchor fallback
  if (/dialog|talk|conversation/.test(beatType)) return "dialogue_anchor";

  // 11. Final fallback — environment
  return "environment_establishing";
}

// ────────────────────────────────────────────────────────────────────────────
// Dominant subject resolution (compatible avec resolveDominantSubject)
// ────────────────────────────────────────────────────────────────────────────

export function resolveDominantSubjectForIntent(intent: ImageIntentType): string {
  switch (intent) {
    case "hero_focus":
    case "hero_action":
    case "hero_emotion":
    case "hero_reaction":
      return "hero";
    case "hero_duo":
    case "hero_secondary_character":
    case "dialogue_two_shot":
      return "duo";
    case "enemy_focus":
    case "enemy_reveal":
      return "enemy";
    case "ally_focus":
      return "ally";
    case "npc_focus":
    case "secondary_character_focus":
      return "npc";
    case "guard_group_focus":
    case "soldier_patrol":
    case "threat_group_focus":
      return "guard_group";
    case "crowd_presence":
      return "crowd";
    case "group_conflict":
    case "group_presence":
      return "group";
    case "environment_establishing":
    case "environment_transition":
      return "environment";
    case "prop_insert":
    case "symbolic_insert":
      return "prop";
    case "reaction_cutaway":
      return "reaction";
    case "aftermath":
      return "aftermath";
    case "magic_manifestation":
      return "prop";
    case "combat_exchange":
    case "combat_turning_point":
    case "threat_presence":
      return "duo";
    case "dialogue_anchor":
      return "hero";
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Priorities (hiérarchie visuelle 0–100)
// ────────────────────────────────────────────────────────────────────────────

interface Priorities {
  environment: number;
  character: number;
  npc: number;
  prop: number;
  group: number;
}

function prioritiesForIntent(intent: ImageIntentType): Priorities {
  if (intent === "environment_establishing" || intent === "environment_transition") {
    return { environment: 90, character: 20, npc: 10, prop: 25, group: 5 };
  }
  if (intent === "prop_insert" || intent === "symbolic_insert") {
    return { environment: 40, character: 5, npc: 5, prop: 95, group: 0 };
  }
  if (intent === "magic_manifestation") {
    return { environment: 55, character: 35, npc: 5, prop: 85, group: 0 };
  }
  if (intent === "aftermath") {
    return { environment: 85, character: 20, npc: 20, prop: 40, group: 20 };
  }
  if (intent === "reaction_cutaway") {
    return { environment: 25, character: 70, npc: 40, prop: 15, group: 0 };
  }
  if (
    intent === "guard_group_focus" ||
    intent === "soldier_patrol" ||
    intent === "threat_group_focus"
  ) {
    return { environment: 45, character: 15, npc: 25, prop: 35, group: 90 };
  }
  if (intent === "crowd_presence" || intent === "group_presence") {
    return { environment: 55, character: 15, npc: 25, prop: 15, group: 85 };
  }
  if (intent === "group_conflict") {
    return { environment: 40, character: 40, npc: 25, prop: 30, group: 80 };
  }
  if (intent === "enemy_focus" || intent === "enemy_reveal") {
    return { environment: 40, character: 85, npc: 5, prop: 20, group: 5 };
  }
  if (intent === "npc_focus" || intent === "secondary_character_focus") {
    return { environment: 40, character: 80, npc: 70, prop: 20, group: 5 };
  }
  if (
    intent === "hero_duo" ||
    intent === "hero_secondary_character" ||
    intent === "dialogue_two_shot"
  ) {
    return { environment: 35, character: 85, npc: 40, prop: 15, group: 5 };
  }
  if (intent === "combat_exchange" || intent === "combat_turning_point") {
    return { environment: 35, character: 80, npc: 15, prop: 40, group: 25 };
  }
  if (intent === "threat_presence") {
    return { environment: 40, character: 65, npc: 25, prop: 30, group: 40 };
  }
  if (intent === "dialogue_anchor") {
    return { environment: 35, character: 80, npc: 30, prop: 15, group: 5 };
  }
  if (intent === "ally_focus") {
    return { environment: 35, character: 85, npc: 55, prop: 15, group: 5 };
  }
  // Hero-centric default
  return { environment: 35, character: 90, npc: 15, prop: 20, group: 5 };
}

// ────────────────────────────────────────────────────────────────────────────
// Framing resolution
// ────────────────────────────────────────────────────────────────────────────

function resolveFramingIntent(intent: ImageIntentType, panel: ChapterPanelPlanInput): string {
  const shot = (panel.shotType ?? "").toLowerCase();
  if (shot === "wide" || shot === "establishing") return "wide";
  if (shot === "extreme_closeup") return "extreme_closeup";
  if (shot === "closeup") return "closeup";
  if (shot === "over_shoulder") return "over_shoulder";
  if (shot === "medium") return "medium";

  // Par intent
  if (intent === "environment_establishing") return "wide";
  if (intent === "prop_insert" || intent === "symbolic_insert") return "insert";
  if (intent === "reaction_cutaway" || intent === "hero_emotion") return "closeup";
  if (
    intent === "guard_group_focus" ||
    intent === "crowd_presence" ||
    intent === "group_conflict"
  ) {
    return "medium";
  }
  if (
    intent === "hero_duo" ||
    intent === "hero_secondary_character" ||
    intent === "dialogue_two_shot"
  ) {
    return "medium";
  }
  return "medium";
}

function resolveCameraIntent(intent: ImageIntentType, panel: ChapterPanelPlanInput): string {
  if (panel.cameraAngle) return panel.cameraAngle;
  if (intent === "threat_presence" || intent === "enemy_reveal") return "low_angle";
  if (intent === "environment_establishing") return "high_angle";
  return "eye_level";
}

// ────────────────────────────────────────────────────────────────────────────
// Forbidden tokens per intent
// ────────────────────────────────────────────────────────────────────────────

function forbiddenFocusForIntent(intent: ImageIntentType): string[] {
  const blockHero = [
    "environment_establishing",
    "environment_transition",
    "prop_insert",
    "symbolic_insert",
    "aftermath",
    "reaction_cutaway",
    "guard_group_focus",
    "soldier_patrol",
    "crowd_presence",
    "threat_group_focus",
    "threat_presence",
    "enemy_focus",
    "enemy_reveal",
    "npc_focus",
    "secondary_character_focus",
  ];
  if (blockHero.includes(intent)) return ["hero_lock", "hero_portrait"];
  return [];
}

function forbiddenFramingForIntent(intent: ImageIntentType): string[] {
  if (intent === "environment_establishing" || intent === "environment_transition") {
    return ["portrait", "extreme_closeup", "closeup"];
  }
  if (intent === "prop_insert" || intent === "symbolic_insert") {
    return ["portrait", "wide"];
  }
  if (
    intent === "guard_group_focus" ||
    intent === "soldier_patrol" ||
    intent === "crowd_presence" ||
    intent === "group_conflict" ||
    intent === "group_presence"
  ) {
    return ["portrait", "extreme_closeup"];
  }
  if (
    intent === "hero_duo" ||
    intent === "hero_secondary_character" ||
    intent === "dialogue_two_shot"
  ) {
    return ["portrait"];
  }
  return [];
}

function forbiddenPromptClausesForIntent(intent: ImageIntentType): string[] {
  const base = ["face filling frame"];
  if (intent === "environment_establishing") {
    return [...base, "hero in foreground", "face close up"];
  }
  if (intent === "prop_insert") {
    return [...base, "hero centered", "full body hero"];
  }
  if (intent === "guard_group_focus" || intent === "soldier_patrol") {
    return [...base, "single hero focus", "hero portrait"];
  }
  if (intent === "crowd_presence") {
    return [...base, "hero as main subject"];
  }
  return base;
}

// ────────────────────────────────────────────────────────────────────────────
// Hero presence mode
// ────────────────────────────────────────────────────────────────────────────

function resolveHeroPresence(
  intent: ImageIntentType,
  hasHeroInPanel: boolean,
): { mode: HeroPresenceMode; weight: number } {
  if (!hasHeroInPanel) return { mode: "absent", weight: 0 };

  if (
    intent === "hero_focus" ||
    intent === "hero_action" ||
    intent === "hero_emotion" ||
    intent === "hero_reaction"
  ) {
    return { mode: "primary", weight: 0.9 };
  }
  if (
    intent === "hero_duo" ||
    intent === "hero_secondary_character" ||
    intent === "dialogue_two_shot" ||
    intent === "combat_exchange" ||
    intent === "combat_turning_point"
  ) {
    return { mode: "primary", weight: 0.5 };
  }
  if (
    intent === "environment_establishing" ||
    intent === "environment_transition"
  ) {
    return { mode: "silhouette", weight: 0.15 };
  }
  if (
    intent === "prop_insert" ||
    intent === "symbolic_insert" ||
    intent === "aftermath"
  ) {
    return { mode: "absent", weight: 0 };
  }
  if (
    intent === "guard_group_focus" ||
    intent === "soldier_patrol" ||
    intent === "crowd_presence" ||
    intent === "enemy_focus" ||
    intent === "enemy_reveal" ||
    intent === "npc_focus" ||
    intent === "secondary_character_focus" ||
    intent === "threat_presence"
  ) {
    return { mode: "secondary", weight: 0.3 };
  }
  return { mode: "primary", weight: 0.7 };
}

// ────────────────────────────────────────────────────────────────────────────
// Main builder
// ────────────────────────────────────────────────────────────────────────────

export function buildChapterImagePlan(
  input: ChapterImagePlanBuilderInput,
): ChapterImagePlanItem[] {
  const items: ChapterImagePlanItem[] = [];

  for (const beat of input.beats) {
    for (const panel of beat.panels) {
      const intent = resolveImageIntent(panel, beat);
      const priorities = prioritiesForIntent(intent);
      const framingIntent = resolveFramingIntent(intent, panel);
      const cameraIntent = resolveCameraIntent(intent, panel);
      const dominantSubject = resolveDominantSubjectForIntent(intent);
      const hasHeroInPanel = hasHero(panel.panelCharacterRoles ?? []);
      const heroPresence = resolveHeroPresence(intent, hasHeroInPanel);

      const imageId = `${input.chapterId}__p${panel.pageIndex}__pnl${panel.panelIndex}`;

      items.push({
        imageId,
        projectId: input.projectId,
        chapterId: input.chapterId,
        pageIndex: panel.pageIndex,
        panelIndex: panel.panelIndex,
        beatIndex: beat.beatIndex,
        beatType: beat.beatType,
        beatId: beat.beatId,

        storyFunction: beat.storyFunction,
        imageIntentType: intent,
        dominantSubject,
        secondarySubjects: resolveSecondarySubjects(intent, panel),
        cutawayType: panel.cutawayType ?? null,

        cameraIntent,
        framingIntent,

        environmentPriority: priorities.environment,
        characterPriority: priorities.character,
        npcPriority: priorities.npc,
        propPriority: priorities.prop,
        groupPriority: priorities.group,

        requiredCharacters: panel.panelCharacterNames ?? [],
        requiredNpcs: panel.npcPresence ?? [],
        requiredProps: panel.requiredProps ?? [],
        requiredLocationSignals: panel.mustShowLocationSignals ?? [],
        requiredDialogueLines: panel.dialogueLines ?? [],
        requiredNarrativeContext: panel.narrativeContext ?? [],
        continuityAnchors: [],

        forbiddenFocus: forbiddenFocusForIntent(intent),
        forbiddenFraming: forbiddenFramingForIntent(intent),
        forbiddenPromptClauses: forbiddenPromptClausesForIntent(intent),

        targetLoras: [],
        targetCanonSources: [],
        promptLanguage: "en",
        contentRating: input.contentRating,
        mangaStyleProfile: input.mangaStyleProfile,

        heroPresenceMode: heroPresence.mode,
        heroVisualWeight: heroPresence.weight,
      });
    }
  }

  return items;
}

function resolveSecondarySubjects(intent: ImageIntentType, panel: ChapterPanelPlanInput): string[] {
  const roles = panel.panelCharacterRoles ?? [];
  const subs: string[] = [];
  if (intent === "environment_establishing" && roles.length > 0) subs.push("hero");
  if (intent === "prop_insert" && roles.length > 0) subs.push("hero");
  if (intent === "guard_group_focus" && hasHero(roles)) subs.push("hero");
  if (intent === "crowd_presence" && hasHero(roles)) subs.push("hero");
  return subs;
}

// ────────────────────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────────────────────

export interface ChapterImagePlanValidationResult {
  valid: boolean;
  totalImages: number;
  intentDistribution: Record<string, number>;
  issues: string[];
  warnings: string[];
}

export function validateChapterImagePlan(
  plan: ChapterImagePlanItem[],
  expectedMin = 60,
  expectedMax = 80,
): ChapterImagePlanValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (plan.length < expectedMin) {
    issues.push(`PLAN_TOO_SHORT: ${plan.length} images < ${expectedMin}`);
  }
  if (plan.length > expectedMax) {
    warnings.push(`PLAN_TOO_LONG: ${plan.length} images > ${expectedMax}`);
  }

  const intentDistribution: Record<string, number> = {};
  for (const item of plan) {
    intentDistribution[item.imageIntentType] =
      (intentDistribution[item.imageIntentType] ?? 0) + 1;

    if (!item.imageIntentType) issues.push(`MISSING_INTENT: ${item.imageIntentType}`);
    if (!item.dominantSubject) issues.push(`MISSING_DOMINANT: ${item.imageId}`);
    if (item.promptLanguage !== "en") {
      issues.push(`WRONG_LANGUAGE: ${item.imageId} promptLanguage=${item.promptLanguage}`);
    }
  }

  const heroDominantCount = plan.filter((p) => p.dominantSubject === "hero").length;
  const heroRatio = plan.length > 0 ? heroDominantCount / plan.length : 0;
  if (heroRatio > 0.55) {
    warnings.push(
      `HERO_BIAS_SUSPICIOUS: ${(heroRatio * 100).toFixed(1)}% of panels are hero-dominant`,
    );
  }

  return {
    valid: issues.length === 0,
    totalImages: plan.length,
    intentDistribution,
    issues,
    warnings,
  };
}
