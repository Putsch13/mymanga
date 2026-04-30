/**
 * Plan canonique → blueprints premium (déterministe).
 *
 * Flux cible premium : outline normalisé → CanonicalChapterProductionPlan →
 * `PanelBlueprintPremium[]` pour shot-plan, focus-budget, storyboard, launch.
 * Les blueprints ne décident plus du nombre final de panels : le canonique oui.
 */

import type { PanelBlueprintPremium, CutawayType, RequiredProp, SubjectFocus } from "../types/narrative-facts";
import { buildPanelTextContractFromBlueprintTextFields } from "../generation/panel-text-contract";
import type { CanonicalChapterProductionPlan, CanonicalPanelPlan, PanelRole } from "./canonical-production-plan";

const SUBJECT_FOCUS_VALUES: ReadonlySet<string> = new Set([
  "hero",
  "enemy",
  "ally",
  "duo",
  "npc",
  "group",
  "environment",
  "prop",
  "reaction",
  "speaker",
  "location",
  "aftermath",
  "visual_entity",
]);

function roleToSubjectFocus(role: PanelRole, isCutaway: boolean): SubjectFocus {
  if (isCutaway) {
    if (role === "environment" || role === "transition") return "environment";
    if (role === "prop") return "prop";
    if (role === "aftermath") return "aftermath";
    return "environment";
  }
  switch (role) {
    case "hero":
      return "hero";
    case "duo":
      return "duo";
    case "enemy":
      return "enemy";
    case "reaction":
      return "reaction";
    case "action":
      return "hero";
    case "speaker":
      return "speaker";
    case "listener":
      return "reaction";
    case "group":
      return "group";
    case "npc":
      return "npc";
    case "environment":
      return "environment";
    case "prop":
      return "prop";
    case "cutaway":
      return "environment";
    case "aftermath":
      return "aftermath";
    case "transition":
      return "location";
    default:
      return "hero";
  }
}

function resolveSubjectFocus(panel: CanonicalPanelPlan): SubjectFocus {
  if (SUBJECT_FOCUS_VALUES.has(panel.subjectFocus)) {
    return panel.subjectFocus as SubjectFocus;
  }
  return roleToSubjectFocus(panel.role, panel.isCutaway);
}

function resolveSecondaryFocus(panel: CanonicalPanelPlan): SubjectFocus | null | undefined {
  if (!panel.secondaryFocus) return undefined;
  if (SUBJECT_FOCUS_VALUES.has(panel.secondaryFocus)) {
    return panel.secondaryFocus as SubjectFocus;
  }
  return undefined;
}

function cutawayTypeFrom(panel: CanonicalPanelPlan): CutawayType {
  if (!panel.isCutaway) return "none";
  if (panel.role === "prop") return "prop_insert";
  if (panel.role === "aftermath") return "aftermath";
  return "environment";
}

function mapRequiredProp(
  p: CanonicalPanelPlan["requiredProps"][number],
  beatId: string,
): RequiredProp {
  return {
    id: p.id,
    canonicalName: p.canonicalName,
    aliases: [],
    category: "narrative",
    narrativeRole: "worldbuilding",
    requiredForBeatIds: [beatId],
    visibilityMode: p.mustBeVisible ? "foreground_insert" : "background_support",
    mustBeVisible: p.mustBeVisible,
    confidence: 1,
    source: "canon",
  };
}

function dialogueCarrierFromTextPlan(
  panel: CanonicalPanelPlan,
): "speaker_visible" | "offscreen_allowed" | "narration" | undefined {
  const m = panel.textPlan.mode;
  if (m === "dialogue") return "speaker_visible";
  if (m === "narration") return "narration";
  return undefined;
}

/**
 * Dérive les `PanelBlueprintPremium` alignés sur le plan canonique (IDs, beats, rythme).
 */
export function canonicalPlanToPanelBlueprints(plan: CanonicalChapterProductionPlan): PanelBlueprintPremium[] {
  return plan.panels.map((panel) => {
    const subjectFocus = resolveSubjectFocus(panel);
    const secondaryFocus = resolveSecondaryFocus(panel);
    const cutawayType = cutawayTypeFrom(panel);
    const tp = panel.textPlan;

    const speakerLabel =
      tp.anchor?.speakerName?.trim()
      || tp.anchor?.speakerId
      || panel.mustShowCharacterIds[0]
      || "speaker";

    const dialogueText = (tp.text ?? "").trim();
    const dialogueLines =
      tp.mode === "dialogue" && dialogueText
        ? [{ speaker: speakerLabel, text: dialogueText }]
        : undefined;

    const panelTextBundle =
      tp.mode === "dialogue" || tp.mode === "narration" || tp.mode === "sfx"
        ? {
            dialogues: dialogueLines ?? undefined,
            narration: tp.mode === "narration" ? (tp.text ?? null) : null,
            sfx: tp.mode === "sfx" ? tp.sfx : undefined,
          }
        : null;

    const textContract = buildPanelTextContractFromBlueprintTextFields({
      panelId: panel.panelId,
      dialogueLines: dialogueLines ?? null,
      narrationText: tp.mode === "narration" ? (tp.text ?? null) : null,
      sfxCues: tp.mode === "sfx" && tp.sfx ? [...tp.sfx] : null,
      panelTextBundle,
    });

    return {
      panelId: panel.panelId,
      provenance: {
        origin: "canonical_projection",
        canonicalPanelId: panel.panelId,
        canonicalBeatId: panel.beatId,
        appliedRules: ["canonical_plan_to_premium_blueprints"],
      },
      beatId: panel.beatId,
      panelIndex: panel.panelIndex,
      pageNumber: panel.pageNumber,
      panelNumber: panel.panelNumberInPage,
      purpose: panel.purpose,
      shotType: panel.shotType,
      cameraAngle: panel.cameraAngle,
      subjectFocus,
      ...(secondaryFocus != null ? { secondaryFocus } : {}),
      requiredCharacterIds: [...panel.requiredCharacterIds],
      mustShowCharacterIds: [...panel.mustShowCharacterIds],
      mayShowCharacterIds: [...panel.mayShowCharacterIds],
      mustShowEnemy: panel.mustShowEnemy,
      requiredNpcCount: panel.requiredNpcCount,
      requiredProps: panel.requiredProps.map((p) => mapRequiredProp(p, panel.beatId)),
      requiredLocationSignals: [...panel.requiredLocationSignals],
      speakerAnchorCharacterId: tp.anchor?.speakerId ?? null,
      dialogueCarrier: dialogueCarrierFromTextPlan(panel),
      dialogueLinesAnchored:
        tp.mode === "dialogue" && tp.anchor?.speakerId ? 1 : undefined,
      cutawayType,
      heroCenterAllowed: true,
      criticality: panel.criticality,
      notes: [...panel.notes],
      narrationText: tp.mode === "narration" ? (tp.text ?? null) : null,
      sfxCues: tp.mode === "sfx" && tp.sfx ? [...tp.sfx] : undefined,
      dialogueLines,
      requiredEntityIds: [...panel.requiredEntityIds],
      contractualCritical: panel.criticality === "critical" || panel.criticality === "high",
      panelTextBundle,
      textContract,
    };
  });
}
