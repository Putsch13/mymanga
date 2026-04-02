import type { PhysicalEvent, BodyStateSnapshot } from "./physical-events";

export interface ApplyEventResult {
  newState: BodyStateSnapshot;
  changes: string[];
  warnings: string[];
}

export function applyPhysicalEvent(
  current: BodyStateSnapshot,
  event: PhysicalEvent
): ApplyEventResult {
  const state: BodyStateSnapshot = structuredClone(current);
  const changes: string[] = [];
  const warnings: string[] = [];

  switch (event.type) {
    case "limb_lost": {
      if (event.target === "left_arm" && state.leftArmPresent) {
        state.leftArmPresent = false;
        changes.push("Bras gauche perdu — état permanent.");
      } else if (event.target === "right_arm" && state.rightArmPresent) {
        state.rightArmPresent = false;
        changes.push("Bras droit perdu — état permanent.");
      } else if (event.target === "left_leg" && state.leftLegPresent) {
        state.leftLegPresent = false;
        changes.push("Jambe gauche perdue — état permanent.");
      } else if (event.target === "right_leg" && state.rightLegPresent) {
        state.rightLegPresent = false;
        changes.push("Jambe droite perdue — état permanent.");
      } else {
        warnings.push(`Membre déjà absent ou cible inconnue : ${event.target}`);
      }
      break;
    }

    case "eye_lost": {
      if (event.target === "left_eye" && state.leftEyePresent) {
        state.leftEyePresent = false;
        changes.push("Œil gauche perdu — état permanent.");
      } else if (event.target === "right_eye" && state.rightEyePresent) {
        state.rightEyePresent = false;
        changes.push("Œil droit perdu — état permanent.");
      } else {
        warnings.push(`Œil déjà absent ou cible inconnue : ${event.target}`);
      }
      break;
    }

    case "scar_added": {
      if (event.description && !state.scarsCurrent.includes(event.description)) {
        state.scarsCurrent.push(event.description);
        state.permanentAlterations.push(`Cicatrice: ${event.description}`);
        changes.push(`Cicatrice ajoutée : ${event.description}`);
      }
      break;
    }

    case "burn_added": {
      if (event.description && !state.burns.includes(event.description)) {
        state.burns.push(event.description);
        state.permanentAlterations.push(`Brûlure: ${event.description}`);
        changes.push(`Brûlure ajoutée : ${event.description}`);
      }
      break;
    }

    case "tattoo_added": {
      if (event.description) {
        state.permanentAlterations.push(`Tatouage: ${event.description}`);
        changes.push(`Tatouage ajouté : ${event.description}`);
      }
      break;
    }

    case "prosthetic_added": {
      if (event.target && !state.prosthetics.includes(event.target)) {
        state.prosthetics.push(event.target);
        changes.push(`Prothèse ajoutée : ${event.target}`);
      }
      break;
    }

    case "outfit_changed": {
      state.currentOutfit = event.description;
      changes.push(`Tenue changée : ${event.description}`);
      break;
    }

    case "hair_cut":
    case "hair_color_changed": {
      if (event.type === "hair_color_changed") {
        state.hairColor = event.description;
        changes.push(`Couleur cheveux : ${event.description}`);
      } else {
        state.hairStyle = event.description;
        changes.push(`Coupe cheveux : ${event.description}`);
      }
      break;
    }

    case "bandage_added": {
      if (event.target && !state.bandages.includes(event.target)) {
        state.bandages.push(event.target);
        state.temporaryAlterations.push(`Bandage: ${event.target}`);
        changes.push(`Bandage ajouté : ${event.target}`);
      }
      break;
    }

    case "bandage_removed": {
      state.bandages = state.bandages.filter((b) => b !== event.target);
      state.temporaryAlterations = state.temporaryAlterations.filter(
        (a) => a !== `Bandage: ${event.target}`
      );
      changes.push(`Bandage retiré : ${event.target}`);
      break;
    }

    case "injury_added": {
      if (event.description && !state.currentInjuries.includes(event.description)) {
        state.currentInjuries.push(event.description);
        state.temporaryAlterations.push(`Blessure: ${event.description}`);
        changes.push(`Blessure ajoutée : ${event.description}`);
      }
      break;
    }

    case "injury_healed": {
      state.currentInjuries = state.currentInjuries.filter((i) => i !== event.description);
      state.temporaryAlterations = state.temporaryAlterations.filter(
        (a) => a !== `Blessure: ${event.description}`
      );
      changes.push(`Blessure guérie : ${event.description}`);
      break;
    }

    case "healed_major_injury": {
      if (!event.canBeReversed) {
        warnings.push("Guérison majeure sans condition de réversion — vérifier la cohérence canon.");
      }
      changes.push(`Guérison majeure : ${event.description}`);
      break;
    }

    case "resurrected": {
      warnings.push("Résurrection — événement exceptionnel, nécessite validation narrative.");
      changes.push(`Résurrection : ${event.description}`);
      break;
    }

    case "body_transformation":
    case "mutation_started": {
      state.permanentAlterations.push(event.description);
      changes.push(`Transformation : ${event.description}`);
      break;
    }
  }

  return { newState: state, changes, warnings };
}
