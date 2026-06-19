export type PhysicalEventType =
  | "limb_lost"
  | "eye_lost"
  | "scar_added"
  | "tattoo_added"
  | "burn_added"
  | "prosthetic_added"
  | "outfit_changed"
  | "hair_cut"
  | "hair_color_changed"
  | "body_transformation"
  | "healed_major_injury"
  | "resurrected"
  | "mutation_started"
  | "bandage_added"
  | "bandage_removed"
  | "injury_added"
  | "injury_healed";

export interface PhysicalEvent {
  type: PhysicalEventType;
  target?: string; // ex: "left_arm", "right_eye", "back"
  description: string;
  chapterId: string;
  sceneId?: string;
  isCanonical: boolean;
  isPermanent: boolean;
  canBeReversed: boolean;
  reversalCondition?: string;
  timestamp: string;
}

export interface BodyStateSnapshot {
  leftArmPresent: boolean;
  rightArmPresent: boolean;
  leftLegPresent: boolean;
  rightLegPresent: boolean;
  leftEyePresent: boolean;
  rightEyePresent: boolean;
  scarsCurrent: string[];
  burns: string[];
  prosthetics: string[];
  bandages: string[];
  currentInjuries: string[];
  permanentAlterations: string[];
  temporaryAlterations: string[];
  hairColor?: string;
  hairStyle?: string;
  currentOutfit?: string;
}

export const DEFAULT_BODY_STATE: BodyStateSnapshot = {
  leftArmPresent: true,
  rightArmPresent: true,
  leftLegPresent: true,
  rightLegPresent: true,
  leftEyePresent: true,
  rightEyePresent: true,
  scarsCurrent: [],
  burns: [],
  prosthetics: [],
  bandages: [],
  currentInjuries: [],
  permanentAlterations: [],
  temporaryAlterations: [],
};
