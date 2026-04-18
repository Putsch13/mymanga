/**
 * P5.3 — Façade chapter-studio.
 *
 * Les consommateurs externes importent toujours depuis "@/lib/chapter-studio"
 * ou "./lib/chapter-studio" ; rien ne change pour eux. L'implémentation a été
 * scindée en sous-modules cohérents dans `lib/chapter-studio/` :
 *   - snapshot.ts          : read/merge/patch/normalize du ChapterStudioSnapshot
 *   - project-canon.ts     : ProjectCanon (build + resolve effectif)
 *   - character-canon.ts   : CharacterCanon (P1.2 — fingerprint + visualLocks)
 *   - location-canon.ts    : LocationCanon (build + resolve effectif)
 *   - runtime-fields.ts    : StructuredChapterRuntimeFields + list item
 *   - utils.ts             : helpers internes (asRecord, asStringArray, safeString)
 *
 * Aucun changement de logique : simple extraction + re-export.
 */

export {
  readChapterStudioSnapshotFromOutline,
  mergeChapterStudioIntoOutline,
  patchChapterStudioSnapshot,
  normalizePremiumStudioSnapshot,
} from "./chapter-studio/snapshot";

export {
  resolveEffectiveProjectCanon,
  buildProjectCanonFromProject,
} from "./chapter-studio/project-canon";

export {
  buildCharacterCanonFromCharacter,
  resolveEffectiveCharacterCanon,
} from "./chapter-studio/character-canon";

export {
  buildLocationCanonFromLocation,
  resolveEffectiveLocationCanon,
} from "./chapter-studio/location-canon";

export {
  resolveEffectiveChapterCanonState,
  resolveEffectiveProductionSource,
  buildChapterStudioListItem,
  buildChapterStructuredRuntimeFields,
  buildChapterStructuredRuntimePrismaFields,
  buildChapterStructuredRuntimeCreateFields,
} from "./chapter-studio/runtime-fields";
