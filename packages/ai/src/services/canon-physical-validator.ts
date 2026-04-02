import type { BodyStateSnapshot } from "@manga-ai-studio/core";

export interface CanonValidationResult {
  isValid: boolean;
  blockingIssues: string[];
  warnings: string[];
  autoCorrections: string[];
}

/**
 * Valide qu'un prompt ou une description de scène ne viole pas l'état physique
 * canonique d'un personnage.
 */
export function validateCanonPhysical(
  characterName: string,
  canonState: BodyStateSnapshot,
  sceneDescription: string
): CanonValidationResult {
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const autoCorrections: string[] = [];
  const desc = sceneDescription.toLowerCase();

  // Membres perdus
  if (!canonState.leftArmPresent) {
    if (
      desc.includes("two arms") ||
      desc.includes("both arms") ||
      desc.includes("left arm intact") ||
      desc.includes("bras gauche intact") ||
      desc.includes("deux bras")
    ) {
      blockingIssues.push(
        `${characterName} a perdu le bras gauche et ne peut pas apparaître avec deux bras intacts.`
      );
      autoCorrections.push(`Remplacer "bras gauche" par "moignon gauche" ou "prothèse gauche".`);
    }
  }
  if (!canonState.rightArmPresent) {
    if (
      desc.includes("two arms") ||
      desc.includes("both arms") ||
      desc.includes("right arm intact") ||
      desc.includes("bras droit intact")
    ) {
      blockingIssues.push(
        `${characterName} a perdu le bras droit et ne peut pas apparaître avec deux bras intacts.`
      );
    }
  }
  if (!canonState.leftLegPresent) {
    if (desc.includes("both legs") || desc.includes("left leg intact") || desc.includes("jambe gauche")) {
      blockingIssues.push(`${characterName} a perdu la jambe gauche.`);
    }
  }
  if (!canonState.rightLegPresent) {
    if (desc.includes("both legs") || desc.includes("right leg intact") || desc.includes("jambe droite")) {
      blockingIssues.push(`${characterName} a perdu la jambe droite.`);
    }
  }

  // Yeux perdus
  if (!canonState.leftEyePresent) {
    if (desc.includes("both eyes") || desc.includes("left eye open") || desc.includes("œil gauche ouvert")) {
      blockingIssues.push(`${characterName} a perdu l'œil gauche.`);
      autoCorrections.push(`Ajouter un cache-œil ou une cicatrice sur l'œil gauche.`);
    }
  }
  if (!canonState.rightEyePresent) {
    if (desc.includes("both eyes") || desc.includes("right eye open") || desc.includes("œil droit ouvert")) {
      blockingIssues.push(`${characterName} a perdu l'œil droit.`);
    }
  }

  // Cicatrices permanentes
  for (const scar of canonState.scarsCurrent) {
    const scarKey = scar.toLowerCase().split(":").pop()?.trim() ?? "";
    if (scarKey && desc.includes("no scar") || desc.includes("perfect skin") || desc.includes("peau parfaite")) {
      warnings.push(
        `${characterName} a une cicatrice permanente (${scar}) qui ne doit pas disparaître.`
      );
    }
  }

  // Prothèses
  for (const prosthetic of canonState.prosthetics) {
    const key = prosthetic.toLowerCase();
    if (!desc.includes(key) && !desc.includes("prosthetic") && !desc.includes("prothèse")) {
      warnings.push(
        `${characterName} porte une prothèse (${prosthetic}) — vérifier qu'elle est visible si pertinent.`
      );
    }
  }

  // Bandages actifs
  for (const bandage of canonState.bandages) {
    if (desc.includes("no bandage") || desc.includes("sans bandage")) {
      warnings.push(`${characterName} a un bandage actif (${bandage}) qui ne devrait pas avoir disparu.`);
    }
  }

  return {
    isValid: blockingIssues.length === 0,
    blockingIssues,
    warnings,
    autoCorrections,
  };
}

/**
 * Construit les contraintes de prompt à injecter pour respecter l'état physique.
 */
export function buildCanonConstraintPrompt(
  characterName: string,
  canonState: BodyStateSnapshot
): string {
  const constraints: string[] = [];

  if (!canonState.leftArmPresent) constraints.push(`${characterName} missing left arm (amputated)`);
  if (!canonState.rightArmPresent) constraints.push(`${characterName} missing right arm (amputated)`);
  if (!canonState.leftLegPresent) constraints.push(`${characterName} missing left leg (amputated)`);
  if (!canonState.rightLegPresent) constraints.push(`${characterName} missing right leg (amputated)`);
  if (!canonState.leftEyePresent) constraints.push(`${characterName} eye patch left eye`);
  if (!canonState.rightEyePresent) constraints.push(`${characterName} eye patch right eye`);

  for (const scar of canonState.scarsCurrent) {
    constraints.push(`${characterName} visible scar: ${scar}`);
  }
  for (const prosthetic of canonState.prosthetics) {
    constraints.push(`${characterName} prosthetic: ${prosthetic}`);
  }
  for (const bandage of canonState.bandages) {
    constraints.push(`${characterName} bandaged: ${bandage}`);
  }
  for (const alt of canonState.permanentAlterations) {
    constraints.push(`${characterName}: ${alt}`);
  }

  if (canonState.currentOutfit) {
    constraints.push(`${characterName} wearing: ${canonState.currentOutfit}`);
  }
  if (canonState.hairColor) {
    constraints.push(`${characterName} hair color: ${canonState.hairColor}`);
  }

  return constraints.join(", ");
}
