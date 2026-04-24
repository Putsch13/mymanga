/**
 * Rebalancing premium manga — réduit les cutaways excédentaires après densification
 * et aligne les blueprints sur des panels portés par des acteurs visibles.
 */

import type { CutawayType, PanelBlueprintPremium, SubjectFocus } from "@manga-ai-studio/core";
import type { VisualEntity } from "./visual-entity-registry";
import {
  pickOpponentEntityForBeat,
  pickPrimaryActorForBeat,
} from "./visual-entity-registry";

const BANNED_PLACEHOLDER_SNIPPETS = [
  "densified_to_meet_premium_range",
  "story-consistent interior",
  "story-consistent exterior",
  "story-consistent setting",
  "atmospheric scene without",
  "without a dominant identifiable face",
  "environment only",
  "prop insert as primary",
  "terrain damage",
] as const;

const ATMOSPHERIC_SIGNALS = [
  "atmospheric scene",
  "environment only",
  "without a dominant",
  "densified_to_meet_premium_range",
] as const;

export function blueprintTextBlob(bp: PanelBlueprintPremium): string {
  const parts = [
    bp.purpose,
    bp.sceneContextLabel ?? "",
    bp.narrationText ?? "",
    ...(bp.notes ?? []),
    ...((bp.dialogueLines ?? []).map((l) => `${l.speaker} ${l.text}`)),
  ];
  return parts.join(" ").toLowerCase();
}

export function containsBannedPlaceholder(bp: PanelBlueprintPremium): boolean {
  const blob = blueprintTextBlob(bp);
  return BANNED_PLACEHOLDER_SNIPPETS.some((s) => blob.includes(s.toLowerCase()));
}

/** Retire ou remplace les placeholders interdits dans les champs texte du blueprint. */
export function stripBannedPlaceholdersFromBlueprint(bp: PanelBlueprintPremium): void {
  const clean = (s: string | null | undefined): string | null => {
    if (!s || typeof s !== "string") return s ?? null;
    let out = s;
    for (const frag of BANNED_PLACEHOLDER_SNIPPETS) {
      const re = new RegExp(frag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      out = out.replace(re, "").trim();
    }
    return out.length > 0 ? out : null;
  };

  const p = clean(bp.purpose);
  if (p) bp.purpose = p;
  else bp.purpose = "character-driven story beat";

  bp.sceneContextLabel = clean(bp.sceneContextLabel ?? undefined);
  bp.narrationText = clean(bp.narrationText ?? undefined);
  if (Array.isArray(bp.notes)) {
    bp.notes = bp.notes
      .map((n) => clean(n) ?? "")
      .filter((n) => n.length > 0);
  }
}

const CUTAWAY_SUBJECT: ReadonlySet<SubjectFocus> = new Set([
  "environment",
  "prop",
  "location",
  "aftermath",
]);

/**
 * Définition standardisée "cutaway" côté blueprint premium (manga).
 * Alignée avec le ratio storyboard V3 (cutawayType + focus environnement / prop).
 */
export function isPremiumMangaCutawayBlueprint(bp: PanelBlueprintPremium): boolean {
  if (bp.cutawayType && bp.cutawayType !== "none") return true;
  if (CUTAWAY_SUBJECT.has(bp.subjectFocus)) return true;

  const blob = blueprintTextBlob(bp);
  for (const sig of ATMOSPHERIC_SIGNALS) {
    if (blob.includes(sig)) return true;
  }
  return false;
}

export function isPremiumMangaActorDrivenBlueprint(bp: PanelBlueprintPremium): boolean {
  return !isPremiumMangaCutawayBlueprint(bp);
}

export function isCriticalCutawayBlueprint(bp: PanelBlueprintPremium): boolean {
  if (bp.contractualCritical === true) return true;
  if (bp.criticality === "critical" || bp.criticality === "high") return true;
  const p = bp.purpose.toLowerCase();
  if (p.includes("establish") || p.includes("révélation") || p.includes("reveal")) return true;
  if (p.includes("key object") || p.includes("objet clé") || p.includes("cliff")) return true;
  if (bp.cutawayType === "aftermath" && p.includes("after")) return true;
  return false;
}

function narrativeValueScore(bp: PanelBlueprintPremium): number {
  let score = 50;
  if (bp.contractualCritical) score += 40;
  if (bp.criticality === "high" || bp.criticality === "critical") score += 25;
  const p = bp.purpose.toLowerCase();
  if (p.includes("establish") || p.includes("reveal")) score += 15;
  if (p.includes("atmos") || p.includes("densified")) score -= 30;
  if (containsBannedPlaceholder(bp)) score -= 25;
  return score;
}

function isDialogueHeavyBeat(bp: PanelBlueprintPremium): boolean {
  return (bp.dialogueLines?.length ?? 0) > 0 || bp.dialogueCarrier === "speaker_visible";
}

function isConflictHeavyBeat(bp: PanelBlueprintPremium): boolean {
  if (bp.mustShowEnemy) return true;
  const p = bp.purpose.toLowerCase();
  return (
    p.includes("combat")
    || p.includes("fight")
    || p.includes("battle")
    || p.includes("confront")
    || p.includes("affrontement")
  );
}

function subjectFocusForEntityKind(kind: VisualEntity["kind"]): SubjectFocus {
  switch (kind) {
    case "enemy":
    case "soldier":
    case "faction":
      return "enemy";
    case "creature":
    case "monster":
    case "beast":
    case "spirit":
      return "enemy";
    case "robot":
    case "android":
      return "enemy";
    default:
      return "hero";
  }
}

export function buildActorDrivenReplacement(
  bp: PanelBlueprintPremium,
  entities: VisualEntity[],
  fallbackHeroId: string | null,
): Partial<PanelBlueprintPremium> {
  const primary = pickPrimaryActorForBeat(bp.beatId, entities, fallbackHeroId);
  const opponent = pickOpponentEntityForBeat(bp.beatId, entities);

  if (isDialogueHeavyBeat(bp) && primary) {
    return {
      purpose: "dialogue reaction — visible emotional beat",
      shotType: "medium_close",
      cameraAngle: "eye_level",
      subjectFocus: "speaker",
      secondaryFocus: "hero",
      cutawayType: "none" as CutawayType,
      dialogueCarrier: "speaker_visible",
      heroCenterAllowed: true,
      mustShowCharacterIds: [
        ...(bp.mustShowCharacterIds ?? []),
        primary.id,
      ].filter((id, i, a) => a.indexOf(id) === i),
      requiredCharacters: [primary.id],
    };
  }

  if (isConflictHeavyBeat(bp) && opponent) {
    const sf = subjectFocusForEntityKind(opponent.kind);
    return {
      purpose: `${opponent.name} — visible pressure / conflict beat`,
      shotType: "medium",
      cameraAngle: "low",
      subjectFocus: sf,
      cutawayType: "none" as CutawayType,
      mustShowEnemy: opponent.kind === "enemy" || opponent.role === "antagonist",
      mustShowCharacterIds: primary
        ? [primary.id, opponent.id].filter((id, i, a) => a.indexOf(id) === i)
        : [opponent.id],
      requiredCharacters: primary ? [primary.id, opponent.id] : [opponent.id],
      heroCenterAllowed: sf === "hero",
    };
  }

  if (primary) {
    const sf: SubjectFocus = primary.kind === "hero" ? "hero" : "npc";
    return {
      purpose: "character advances the scene — visible action or emotion",
      shotType: "medium",
      cameraAngle: "eye_level",
      subjectFocus: sf,
      cutawayType: "none" as CutawayType,
      mustShowCharacterIds: [primary.id],
      requiredCharacters: [primary.id],
      heroCenterAllowed: sf === "hero",
    };
  }

  return {
    purpose: "group tension — character-driven story beat",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "group",
    cutawayType: "none" as CutawayType,
    heroCenterAllowed: false,
  };
}

export interface RebalancePremiumBlueprintsArgs {
  blueprints: PanelBlueprintPremium[];
  visualEntities: VisualEntity[];
  projectFormat: "manga" | "webtoon";
  maxCutawayRatio: number;
  minActorDrivenRatio: number;
  fallbackHeroId: string | null;
}

export interface RebalancePremiumBlueprintsResult {
  blueprints: PanelBlueprintPremium[];
  beforeCutawayCount: number;
  afterCutawayCount: number;
  convertedCount: number;
  keptCriticalCount: number;
  beforeActorDrivenCount: number;
  afterActorDrivenCount: number;
}

export function rebalancePremiumBlueprintsForManga(
  args: RebalancePremiumBlueprintsArgs,
): RebalancePremiumBlueprintsResult {
  if (args.projectFormat !== "manga") {
    const total = args.blueprints.length;
    const cut = args.blueprints.filter(isPremiumMangaCutawayBlueprint).length;
    const act = args.blueprints.filter(isPremiumMangaActorDrivenBlueprint).length;
    return {
      blueprints: args.blueprints,
      beforeCutawayCount: cut,
      afterCutawayCount: cut,
      convertedCount: 0,
      keptCriticalCount: 0,
      beforeActorDrivenCount: act,
      afterActorDrivenCount: act,
    };
  }

  const blueprints = args.blueprints.map((b) => structuredClone(b) as PanelBlueprintPremium);
  for (const bp of blueprints) {
    stripBannedPlaceholdersFromBlueprint(bp);
  }

  const total = blueprints.length;
  const maxCutaways = Math.floor(total * args.maxCutawayRatio);
  let cutaways = blueprints.filter(isPremiumMangaCutawayBlueprint);
  const beforeCutawayCount = cutaways.length;
  const beforeActorDrivenCount = blueprints.filter(isPremiumMangaActorDrivenBlueprint).length;

  if (cutaways.length <= maxCutaways) {
    const afterActor = blueprints.filter(isPremiumMangaActorDrivenBlueprint).length;
    return {
      blueprints,
      beforeCutawayCount,
      afterCutawayCount: cutaways.length,
      convertedCount: 0,
      keptCriticalCount: cutaways.filter(isCriticalCutawayBlueprint).length,
      beforeActorDrivenCount,
      afterActorDrivenCount: afterActor,
    };
  }

  const excess = cutaways.length - maxCutaways;
  const candidates = cutaways
    .filter((bp) => !isCriticalCutawayBlueprint(bp))
    .sort((a, b) => narrativeValueScore(a) - narrativeValueScore(b))
    .slice(0, excess);

  let converted = 0;
  for (const bp of candidates) {
    const replacement = buildActorDrivenReplacement(bp, args.visualEntities, args.fallbackHeroId);
    Object.assign(bp, replacement);
    bp.cutawayType = "none" as CutawayType;
    bp.notes = [...(bp.notes ?? []), "cutaway_rebalanced_to_actor_driven_panel"];
    converted += 1;
  }

  cutaways = blueprints.filter(isPremiumMangaCutawayBlueprint);
  const afterActorDrivenCount = blueprints.filter(isPremiumMangaActorDrivenBlueprint).length;

  return {
    blueprints,
    beforeCutawayCount,
    afterCutawayCount: cutaways.length,
    convertedCount: converted,
    keptCriticalCount: cutaways.filter(isCriticalCutawayBlueprint).length,
    beforeActorDrivenCount,
    afterActorDrivenCount,
  };
}
