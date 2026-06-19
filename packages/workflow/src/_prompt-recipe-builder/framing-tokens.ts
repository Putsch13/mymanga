import type { FramingCategory } from "../generation-intent-planner";

export const FRAMING_CATEGORY_TOKENS: Record<FramingCategory, string[]> = {
  portrait: ["portrait shot", "face centered", "head and shoulders"],
  closeup: ["close-up", "tight framing", "detailed view"],
  medium: ["medium shot", "waist up", "balanced composition"],
  wide: ["wide shot", "full scene visible", "environmental context"],
  establishing: ["establishing shot", "location reveal", "panoramic view"],
  insert: ["insert shot", "detail focus", "object centered"],
  over_shoulder: ["over the shoulder", "POV adjacent", "conversational framing"],
  splash: ["splash page", "dramatic full page", "impact moment"],
};
