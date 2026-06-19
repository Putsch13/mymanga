import type { DominantSubjectType, FramingCategory, PanelIntentType } from "./types";

export const HERO_FORBIDDEN_FRAMING: FramingCategory[] = ["portrait", "closeup"];

export const HERO_FORBIDDEN_TOKENS = [
  "hero panel",
  "manga hero panel",
  "protagonist centered",
  "main character foreground",
  "hero close-up",
  "face filling frame",
  "tight hero framing",
  "hero lock",
  "hero showcase",
];

export function buildForbiddenFraming(
  _intentType: PanelIntentType,
  dominantSubject: DominantSubjectType,
): FramingCategory[] {
  const forbidden: FramingCategory[] = [];

  if (dominantSubject === "environment" || dominantSubject === "aftermath") {
    forbidden.push("portrait", "closeup");
  }
  if (dominantSubject === "prop") {
    forbidden.push("portrait");
  }
  if (dominantSubject === "crowd" || dominantSubject === "guard_group") {
    forbidden.push("portrait");
  }

  return forbidden;
}

export function buildForbiddenTokens(
  _intentType: PanelIntentType,
  dominantSubject: DominantSubjectType,
): string[] {
  if (
    dominantSubject === "environment"
    || dominantSubject === "prop"
    || dominantSubject === "aftermath"
    || dominantSubject === "crowd"
    || dominantSubject === "guard_group"
    || dominantSubject === "group"
  ) {
    return [...HERO_FORBIDDEN_TOKENS];
  }
  return [];
}
