/**
 * render-spec-builder — construit un PanelRenderSpec à partir :
 *   - d'un StoryboardPanel (décision éditoriale déjà prise par l'IA 2)
 *   - de la ChapterVisualMemory (refs)
 *   - de la ChapterStyleBible (style strict)
 *
 * Ce service est la charnière entre l'éditorial et le rendu : il ne doit
 * JAMAIS inventer de narration, JAMAIS re-décider un shotType ou un
 * renderMode.
 */

import {
  isHeroRole,
  isAntagonistRole,
  isSupportingRole,
  isSubstantialCharacterVisualDna,
  type CharacterVisualDna,
  type EnvironmentVisualDna,
  legacyDialogueLinesFromStoryboardPanelLike,
  type PanelTextBundle,
} from "@manga-ai-studio/core";
import type { ChapterStyleBible } from "../contracts/chapter-style-bible";
import type {
  PanelRenderCharacterRole,
  PanelRenderCharacterVisualDna,
  PanelRenderSpec,
  PanelRenderVisibleCharacter,
} from "../contracts/panel-render-spec";
import type { StoryboardPanel } from "../contracts/storyboard-plan";
import {
  resolvePanelReferences,
  type ChapterVisualMemory,
} from "./chapter-visual-memory";
import { inferStoryboardPanelLayoutMeta } from "./storyboard-panel-layout-meta";

export interface CharacterInfo {
  id: string;
  name: string;
  roleType?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  hairStyle?: string | null;
  skinTone?: string | null;
  outfitSignature?: string | null;
  canonSignatureText?: string | null;
  forbiddenVisualDrift?: string[] | null;
  /** ADN studio complet quand disponible (prioritaire sur les champs plats). */
  characterVisualDna?: CharacterVisualDna | null;
  /** JSON configurateur brut — champs tableau (scars, tattoos…) non aplatis sur `CharacterVisualDna`. */
  stableVisualDNA?: Record<string, unknown> | null;
  visualProfile?: unknown;
  wardrobeProfile?: unknown;
  bodyState?: unknown;
  continuityProfile?: unknown;
}

function mergeCharacterInfoWithPanelBlueprintDna(
  match: CharacterInfo,
  panelRow: CharacterVisualDna | undefined,
): CharacterInfo {
  if (!panelRow) return match;
  const base: CharacterVisualDna = {
    ...(match.characterVisualDna ?? {}),
    ...panelRow,
    characterId: match.id,
    displayName: match.characterVisualDna?.displayName ?? match.name ?? panelRow.displayName,
  };
  return { ...match, characterVisualDna: base };
}

export interface BuildPanelRenderSpecInput {
  panel: StoryboardPanel;
  styleBible: ChapterStyleBible;
  visualMemory: ChapterVisualMemory;
  characters: CharacterInfo[];
  mainCharacterIds: string[];
  /**
   * Premium v3 : refuse un rendu si les personnages principaux visibles n’ont pas
   * d’ADN visuel exploitable (aligné preflight / estimate).
   */
  premiumOnly?: boolean;
}

const DIALOGUE_FORWARD_RENDER_MODES = new Set<StoryboardPanel["renderMode"]>([
  "dialogue_two_shot",
  "dialogue_over_shoulder",
  "character_focus",
  "aftermath_dialogue",
]);

/**
 * Mappe `StoryboardPanel.environmentVisualDna` vers le record attendu par
 * `formatEnvironmentDnaForPrompt` (clés alignées minimal-panel-prompt-builder).
 */
export function environmentVisualDnaToRenderEnvironmentRecord(
  env: EnvironmentVisualDna | null | undefined,
): Record<string, unknown> | null {
  if (!env) return null;
  const loc = typeof env.locationName === "string" ? env.locationName.trim() : "";
  const atm = Array.isArray(env.atmosphere)
    ? env.atmosphere
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .slice(0, 2)
    : [];
  const description = [loc || null, ...atm].filter(Boolean).join(" — ") || (loc || null);
  const out: Record<string, unknown> = {};
  if (description) out.description = description;
  if (env.visualAnchors?.length) out.visualAnchors = env.visualAnchors;
  if (env.architectureHints?.length) out.architectureHints = env.architectureHints;
  if (env.atmosphere?.length) out.atmosphere = env.atmosphere;
  if (env.propAnchors?.length) out.recurringProps = env.propAnchors;
  if (env.lightingHints?.length) out.lightingHints = env.lightingHints;
  if (env.forbiddenDrift?.length) out.negativeConstraints = env.forbiddenDrift;
  if (env.anchorId) out.anchorId = env.anchorId;
  return Object.keys(out).length > 0 ? out : null;
}

function splitMarksLine(line: string | null | undefined): string[] | null {
  if (!line?.trim()) return null;
  const parts = line
    .split(/[;|]/)
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : null;
}

function buildVisibleCharacterVisualDna(match: CharacterInfo): PanelRenderCharacterVisualDna {
  const c = match.characterVisualDna;
  const scars = c?.scars?.length ? [...c.scars] : null;
  const tattoos = c?.tattoos?.length ? [...c.tattoos] : null;
  const accessories = c?.accessories?.length ? [...c.accessories] : null;
  return {
    displayName: c?.displayName ?? null,
    hairColor: c?.hairColor ?? match.hairColor ?? null,
    eyeColor: c?.eyeColor ?? match.eyeColor ?? null,
    hairStyle: c?.hairStyle ?? match.hairStyle ?? null,
    skinTone: c?.skinTone ?? match.skinTone ?? null,
    outfitSignature: c?.outfitSignature ?? match.outfitSignature ?? null,
    visualCanonExcerpt: c?.visualCanonExcerpt?.trim() || null,
    perceivedAge: c?.perceivedAge?.trim() || null,
    silhouetteType: c?.silhouetteType?.trim() || null,
    bodyType: c?.bodyType?.trim() || null,
    distinctiveMarksLine: c?.distinctiveMarksLine?.trim() || null,
    distinctiveMarks: splitMarksLine(c?.distinctiveMarksLine),
    scars,
    tattoos,
    accessories,
    accessoriesLine: c?.accessoriesLine?.trim() || null,
    faceShape: c?.faceShape?.trim() || null,
    eyeShape: c?.eyeShape?.trim() || null,
    eyeSize: c?.eyeSize?.trim() || null,
    eyebrowStyle: c?.eyebrowStyle?.trim() || null,
    hairLength: c?.hairLength?.trim() || null,
    hairTexture: c?.hairTexture?.trim() || null,
    noseStyle: c?.noseStyle?.trim() || null,
    mouthStyle: c?.mouthStyle?.trim() || null,
    jawline: c?.jawline?.trim() || null,
    stableVisualDNA: match.stableVisualDNA ?? undefined,
    visualProfile: match.visualProfile,
    wardrobeProfile: match.wardrobeProfile,
    bodyState: match.bodyState,
    continuityProfile: match.continuityProfile,
  };
}

export function buildPanelRenderSpec(
  input: BuildPanelRenderSpecInput,
): PanelRenderSpec {
  const { panel, styleBible, visualMemory, characters, mainCharacterIds, premiumOnly } = input;
  const mainSet = new Set(mainCharacterIds);

  const panelDnaById = new Map(
    (panel.characterVisualDna ?? []).map((d) => [d.characterId, d] as const),
  );

  const visibleCharacters: PanelRenderVisibleCharacter[] = [];
  for (const idOrName of panel.characters) {
    const match = characters.find((c) => c.id === idOrName || c.name === idOrName);
    if (!match) continue;
    const panelRow = panelDnaById.get(match.id);
    const mergedMatch = mergeCharacterInfoWithPanelBlueprintDna(match, panelRow);
    const role = deriveRole(mergedMatch.roleType, mainSet.has(mergedMatch.id));
    if (premiumOnly && (role === "hero" || role === "support" || role === "enemy")) {
      const dna = mergedMatch.characterVisualDna;
      if (!dna || !isSubstantialCharacterVisualDna(dna)) {
        throw new Error("premium_missing_character_visual_dna_for_render");
      }
    }
    visibleCharacters.push({
      characterId: mergedMatch.id,
      name: mergedMatch.name,
      role,
      poseIntent: null,
      expressionIntent: null,
      hairColor: mergedMatch.hairColor ?? null,
      eyeColor: mergedMatch.eyeColor ?? null,
      canonSignatureText:
        mergedMatch.characterVisualDna?.canonSignatureText ?? mergedMatch.canonSignatureText ?? null,
      forbiddenDrift: (() => {
        const fromCanon = mergedMatch.characterVisualDna?.forbiddenDrift;
        if (Array.isArray(fromCanon) && fromCanon.length > 0) {
          return fromCanon.filter((x): x is string => typeof x === "string");
        }
        return Array.isArray(mergedMatch.forbiddenVisualDrift)
          ? mergedMatch.forbiddenVisualDrift.filter((x): x is string => typeof x === "string")
          : [];
      })(),
      visualDNA: buildVisibleCharacterVisualDna(mergedMatch),
    });
  }

  const resolvedRefs = resolvePanelReferences(visualMemory, {
    characterIds: visibleCharacters.map((c) => c.characterId),
    mainCharacterIds,
    environmentAnchorId: panel.visualAnchors.environmentAnchorId ?? null,
    previousPanelAnchorId: panel.visualAnchors.previousPanelAnchorId ?? null,
  });

  const inferredLayout = inferStoryboardPanelLayoutMeta(panel.renderMode);
  const layoutMeta = {
    layoutHint: panel.layoutHint ?? inferredLayout.layoutHint,
    targetAspectRatio: panel.targetAspectRatio ?? inferredLayout.targetAspectRatio,
    slotType: panel.slotType ?? inferredLayout.slotType,
  };

  const dialogueLines = legacyDialogueLinesFromStoryboardPanelLike({
    panelId: panel.panelId,
    dialogue: panel.dialogue,
    narration: panel.narration ?? null,
    sfx: panel.sfx ?? null,
    panelTextBundle: (panel as StoryboardPanel & { panelTextBundle?: PanelTextBundle | null }).panelTextBundle ?? null,
  });

  return {
    panelId: panel.panelId,
    pageNumber: panel.pageNumber,
    panelNumberInPage: panel.panelNumberInPage,
    // COMMIT C — propager panelPurpose depuis le storyboard. Source de
    // vérité éditoriale pour la QA / audit. Le validator refuse un spec
    // sans panelPurpose ou avec des sentinelles du type "unknown"/"none".
    panelPurpose: panel.panelPurpose,
    renderMode: panel.renderMode,
    shotType: panel.shotType,
    cameraAngle: panel.cameraAngle,
    subjectFocus: panel.subjectFocus,
    cutawayType: panel.cutawayType,
    locationName: panel.locationName,
    actionLine: panel.actionLine,
    emotionLine: panel.emotionLine,
    dialogueIntent:
      dialogueLines.length > 0
        ? dialogueLines.map((d) => `${d.speaker}: ${d.text}`).join(" | ")
        : DIALOGUE_FORWARD_RENDER_MODES.has(panel.renderMode) || panel.panelPurpose === "dialogue_anchor"
          ? panel.actionLine.trim() || null
          : null,
    visibleCharacters,
    styleBible,
    continuityLocks: {
      outfitLocks: [],
      bodyStateLocks: [],
      propLocks: [],
      environmentLocks: panel.continuityNotes.slice(0, 4),
    },
    imageReferences: {
      characterRefs: resolvedRefs.characterRefs,
      environmentRefs: resolvedRefs.environmentRefs,
      panelRefs: resolvedRefs.panelRefs,
      styleRefs: resolvedRefs.styleRefs,
    },
    constraints: {
      mustShow: panel.mustShow,
      mustNotShow: panel.mustNotShow,
      forbiddenDrift: Array.from(new Set([
        ...styleBible.forbiddenStyleKeywords,
        ...visibleCharacters.flatMap((c) => c.forbiddenDrift ?? []),
      ])),
      noTextInsideImage: styleBible.noTextInsideImage,
    },
    layoutMeta,
    npcVisualDna: Array.isArray(panel.npcVisualDna) && panel.npcVisualDna.length > 0 ? panel.npcVisualDna : undefined,
    ...(() => {
      const w = panel.worldPropsVisualDna;
      const props = Array.isArray(w) && w.length > 0 ? w : undefined;
      return { worldPropsVisualDna: props, propVisualDna: props };
    })(),
    environmentDNA: environmentVisualDnaToRenderEnvironmentRecord(panel.environmentVisualDna ?? null) ?? undefined,
  };
}

/**
 * P0.2 — Utilise le normaliseur centralisé pour les rôles personnages.
 */
function deriveRole(
  roleType: string | null | undefined,
  isMain: boolean,
): PanelRenderCharacterRole {
  if (isMain) return "hero";
  if (isHeroRole(roleType)) return "hero";
  if (isSupportingRole(roleType)) return "support";
  if (isAntagonistRole(roleType)) return "enemy";
  return "npc";
}
