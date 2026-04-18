/**
 * P4.3 — Application typée du ShotPlan sur un PanelContract.
 *
 * Remplace les mutations `(contract as any).cameraAngle = ...` qui
 * violaient le type `PanelContract`. On définit ici une surface enrichie
 * (`PanelContractWithShotPlan`) et on centralise la logique dans une
 * fonction pure.
 *
 * Le retour est un NOUVEAU contract (on évite la mutation externe).
 */

import type { PanelContract, ChapterShotPlan } from "@manga-ai-studio/core";

type ShotPlanPanel = ChapterShotPlan["pages"][number]["panels"][number];

export type PanelContractWithShotPlan = PanelContract & {
  cameraAngle?: string | null;
  subjectFocus?: string | null;
  cutawayType?: string | null;
  heroCenterAllowed?: boolean | null;
};

export function applyShotPlanToContract(
  contract: PanelContract,
  shotPlanPanel: ShotPlanPanel | undefined,
): PanelContractWithShotPlan {
  if (!shotPlanPanel) {
    return contract as PanelContractWithShotPlan;
  }
  // Les types ShotPlan (côté AI) et PanelContract (côté core) ont des unions
  // de valeurs légèrement différentes pour camera/subject/cutaway. On cast
  // en string à la frontière et on fait confiance à la validation en aval
  // (prompt composer + QA) pour détecter un mismatch. Tout vaut mieux que
  // les anciennes mutations `(x as any).y = z` non typées.
  const widened = {
    ...contract,
    shotType: shotPlanPanel.shotType as PanelContract["shotType"],
    cameraAngle: shotPlanPanel.cameraAngle as unknown as string | null,
    subjectFocus: (shotPlanPanel.subjectFocus ?? null) as unknown as string | null,
    cutawayType: (shotPlanPanel.cutawayType ?? null) as unknown as string | null,
    heroCenterAllowed: shotPlanPanel.heroCenterAllowed ?? null,
  };
  return widened as unknown as PanelContractWithShotPlan;
}
