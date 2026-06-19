import type { DominantSubjectType, PanelIntentType } from "./types";

export interface IntentPriorities {
  env: number;
  char: number;
  prop: number;
  crowd: number;
}

export function computePriorities(
  _intentType: PanelIntentType,
  dominantSubject: DominantSubjectType,
): IntentPriorities {
  switch (dominantSubject) {
    case "environment":
      return { env: 90, char: 10, prop: 20, crowd: 30 };
    case "prop":
      return { env: 20, char: 20, prop: 95, crowd: 10 };
    case "aftermath":
      return { env: 70, char: 10, prop: 50, crowd: 20 };
    case "crowd":
    case "guard_group":
      return { env: 40, char: 30, prop: 20, crowd: 85 };
    case "group":
      return { env: 35, char: 70, prop: 25, crowd: 50 };
    case "duo":
      return { env: 30, char: 80, prop: 25, crowd: 20 };
    case "hero":
    case "enemy":
    case "ally":
    case "npc":
      return { env: 25, char: 90, prop: 30, crowd: 15 };
    default:
      return { env: 50, char: 50, prop: 50, crowd: 50 };
  }
}
