import type { CanonicalPanelPlan, PanelTextPlan } from "../canonical-production-plan";
import type { NormalizedBeat } from "../normalize-outline";
import { determinePanelRole, determinePanelTextPlan } from "../panel-rhythm-planner";

export function generatePanelId(beatId: string, panelIndex: number): string {
  return `${beatId}_panel_${panelIndex}`;
}

export function buildPanelPlan(
  panelId: string,
  beat: NormalizedBeat,
  panelIndexInBeat: number,
  globalPanelIndex: number,
  pageNumber: number,
  panelNumberInPage: number,
  totalPanelsInBeat: number,
  isCutaway: boolean,
): CanonicalPanelPlan {
  const role = determinePanelRole(beat, panelIndexInBeat, totalPanelsInBeat, isCutaway);
  const textPlanBase = determinePanelTextPlan(beat, role, isCutaway);
  const textPlan: PanelTextPlan = { ...textPlanBase, panelId };

  const isActorDriven =
    !isCutaway &&
    [
      "hero",
      "duo",
      "enemy",
      "reaction",
      "action",
      "speaker",
      "listener",
      "group",
    ].includes(role);

  // ARCH-1 fix — le `subjectFocus` doit refléter le `role` calculé par
  // `determinePanelRole`. Avant ce fix, on prenait systématiquement le premier
  // character, ce qui rendait `mustShowEnemy=true` non-honoré (panel attendu
  // en focus enemy mais focus character → blocking missing_enemy_focus en QA).
  const subjectFocusFromRole: string | null =
    role === "enemy"
      ? "enemy"
      : role === "environment"
        ? "environment"
        : role === "prop"
          ? "prop"
          : role === "group"
            ? "group"
            : null;

  return {
    panelId,
    beatId: beat.beatId,
    panelIndex: globalPanelIndex,
    pageNumber,
    panelNumberInPage,
    role,
    isCutaway,
    isActorDriven,
    purpose: beat.summary,
    shotType: isCutaway ? "wide" : "medium",
    cameraAngle: "eye_level",
    subjectFocus: subjectFocusFromRole ?? beat.involvedCharacters[0] ?? "scene",
    secondaryFocus: beat.involvedCharacters[1],
    requiredCharacterIds: beat.involvedCharacters,
    mustShowCharacterIds: isCutaway ? [] : beat.involvedCharacters.slice(0, 2),
    mayShowCharacterIds: beat.involvedCharacters.slice(2),
    requiredEntityIds: beat.entities,
    mustShowEnemy: !!beat.opponent,
    requiredNpcCount: 0,
    requiredProps: beat.props.map((p) => ({
      id: `prop_${p}`,
      canonicalName: p,
      mustBeVisible: true,
    })),
    requiredLocationSignals: beat.locations,
    textPlan,
    criticality: beat.criticality,
    notes: [],
  };
}
