/**
 * P4.3 — Application typée du ShotPlan sur un PanelContract.
 * P1.1 — Normalisation des enums avant application, pour éliminer les drifts
 * entre le vocabulaire shot-plan (antagonist/important_npc/landscape/...) et
 * le vocabulaire canonique narrative-facts (enemy/npc/environment/...).
 *
 * Remplace les mutations `(contract as any).cameraAngle = ...` qui
 * violaient le type `PanelContract`. On définit ici une surface enrichie
 * (`PanelContractWithShotPlan`) et on centralise la logique dans une
 * fonction pure.
 *
 * Le retour est un NOUVEAU contract (on évite la mutation externe).
 */

import type { PanelContract, ChapterShotPlan } from "@manga-ai-studio/core";
import { normalizeShotPlanPanelEnums } from "@manga-ai-studio/core";

type ShotPlanPanel = ChapterShotPlan["pages"][number]["panels"][number];

/**
 * On élargit explicitement le contract pour accepter cameraAngle/subjectFocus
 * /cutawayType en `string | null` (et pas uniquement les enums stricts du
 * PanelContract). Cela permet au shot-plan de remonter une valeur inconnue
 * comme `null` sans casser le type, tout en conservant la richesse du contract
 * pour tous les autres champs. Sans le `Omit`, l'intersection avec les champs
 * strict de `PanelContract` collapsait sur les enums et rejetait `null`.
 */
export type PanelContractWithShotPlan = Omit<
  PanelContract,
  "cameraAngle" | "subjectFocus" | "cutawayType"
> & {
  cameraAngle: string | null;
  subjectFocus?: string | null;
  cutawayType?: string | null;
  heroCenterAllowed?: boolean | null;
};

export function applyShotPlanToContract(
  contract: PanelContract,
  shotPlanPanel: ShotPlanPanel | undefined,
): PanelContractWithShotPlan {
  if (!shotPlanPanel) {
    return contract as unknown as PanelContractWithShotPlan;
  }
  // Normalisation enums shot-plan → canonique (narrative-facts). Une valeur
  // inconnue logue un warning et retombe sur null (le callsite aval peut alors
  // détecter la carence plutôt que de silencieusement retomber sur le héros).
  const normalized = normalizeShotPlanPanelEnums(
    {
      shotType: shotPlanPanel.shotType,
      cameraAngle: shotPlanPanel.cameraAngle,
      subjectFocus: shotPlanPanel.subjectFocus,
      cutawayType: shotPlanPanel.cutawayType,
    },
    `applyShotPlanToContract panel=${shotPlanPanel.panelNumber}`,
  );

  // On préserve le shotType d'origine du contract si la normalisation a donné
  // null (valeur inconnue) — mieux vaut garder la valeur précédente que casser
  // un contract valide.
  const shotType = normalized.shotType ?? contract.shotType;

  const widened: PanelContractWithShotPlan = {
    ...(contract as unknown as Omit<
      PanelContract,
      "cameraAngle" | "subjectFocus" | "cutawayType"
    >),
    shotType: shotType as PanelContract["shotType"],
    cameraAngle: normalized.cameraAngle,
    subjectFocus: normalized.subjectFocus,
    cutawayType: normalized.cutawayType,
    heroCenterAllowed: shotPlanPanel.heroCenterAllowed ?? null,
  };
  return widened;
}
