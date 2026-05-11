import type {
  CharacterCastInfo,
  DominantSubjectType,
  PanelIntentType,
  PanelPlanInput,
  SuppressedEntity,
  VisualHierarchyLayer,
} from "./types";

export function buildVisualHierarchy(
  _intentType: PanelIntentType,
  dominantSubject: DominantSubjectType,
  panel: PanelPlanInput,
  heroCharacterId: string | null,
  castMap: Map<string, CharacterCastInfo>,
): VisualHierarchyLayer {
  const hierarchy: VisualHierarchyLayer = {
    foreground: [],
    midground: [],
    background: [],
  };

  switch (dominantSubject) {
    case "environment":
      hierarchy.foreground.push("architectural elements", "environmental details");
      hierarchy.midground.push("ambient layered background");
      hierarchy.background.push("distant setting cues");
      if (panel.characterIds.length > 0) {
        hierarchy.background.push("silhouettes only, not centered");
      }
      break;
    case "prop":
      hierarchy.foreground.push("key object/prop, fully legible and centered");
      hierarchy.midground.push("minimal context");
      hierarchy.background.push("subdued environment");
      break;
    case "aftermath":
      hierarchy.foreground.push("debris, consequence markers");
      hierarchy.midground.push("altered environment");
      hierarchy.background.push("residual atmosphere");
      break;
    case "crowd":
    case "guard_group":
      hierarchy.foreground.push("guards/crowd as primary subjects");
      hierarchy.midground.push("environment context");
      if (heroCharacterId && panel.characterIds.includes(heroCharacterId)) {
        hierarchy.background.push("hero as small silhouette only");
      }
      break;
    case "duo": {
      const heroName = heroCharacterId ? castMap.get(heroCharacterId)?.name ?? "hero" : "hero";
      const otherIds = panel.characterIds.filter((id) => id !== heroCharacterId);
      const otherNames = otherIds.map((id) => castMap.get(id)?.name ?? "ally").join(", ");
      hierarchy.foreground.push(`${heroName} and ${otherNames}, both readable`);
      hierarchy.midground.push("environment context");
      hierarchy.background.push("setting details");
      break;
    }
    case "hero":
      hierarchy.foreground.push("protagonist centered and readable");
      hierarchy.midground.push("supporting environment");
      hierarchy.background.push("setting details");
      break;
    default:
      hierarchy.foreground.push("primary subject");
      hierarchy.midground.push("context");
      hierarchy.background.push("environment");
  }

  return hierarchy;
}

export function buildSuppressedEntities(
  _intentType: PanelIntentType,
  dominantSubject: DominantSubjectType,
  panel: PanelPlanInput,
  heroCharacterId: string | null,
): SuppressedEntity[] {
  const suppressed: SuppressedEntity[] = [];

  if (
    dominantSubject === "environment"
    || dominantSubject === "prop"
    || dominantSubject === "aftermath"
    || dominantSubject === "crowd"
    || dominantSubject === "guard_group"
  ) {
    if (heroCharacterId && panel.characterIds.includes(heroCharacterId)) {
      suppressed.push({
        entityType: "character",
        label: "hero",
        reason: "cutaway_panel_hero_should_be_background_only",
      });
    }
    suppressed.push({
      entityType: "framing",
      label: "hero portrait framing",
      reason: "cutaway_forbids_hero_centric_composition",
    });
    suppressed.push({
      entityType: "clause",
      label: "Subject lock: [hero]",
      reason: "cutaway_should_not_lock_on_hero",
    });
  }

  return suppressed;
}
