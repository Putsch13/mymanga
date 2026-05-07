/**
 * manga-editor-agent-llm — appel LLM réel pour l'IA2 (Manga Editor).
 *
 * Transforme un StoryArc en StoryboardPlan via OpenAI avec JSON strict.
 * Fallback automatique sur le stub déterministe si :
 *   - pas de OPENAI_API_KEY
 *   - réponse LLM invalide / non parsable
 *   - `validateStoryboardPlan` remonte des blockers
 *
 * Règles système strictes encodées dans le prompt :
 *   - JAMAIS écrire de prompts image
 *   - JAMAIS inventer de lore hors storyArc
 *   - JAMAIS inventer un combat absent des beats
 *   - 70–75 panels par défaut (configurable)
 *   - variété de plans obligatoire (pas 20 closeups héros)
 *   - chaque panel DOIT avoir un sourceBeatId présent dans storyArc.beats
 */

import OpenAI from "openai";
import type { StoryArc } from "../contracts/story-arc";
import type {
  StoryboardLayoutTemplate,
  StoryboardPage,
  StoryboardPanel,
  StoryboardPlan,
  StoryboardRenderMode,
  StoryboardShotType,
  StoryboardSubjectFocus,
  StoryboardCutawayType,
  StoryboardCameraAngle,
} from "../contracts/storyboard-plan";
import {
  PANEL_PURPOSES,
  STORYBOARD_LAYOUT_TEMPLATES,
  STORYBOARD_RENDER_MODES,
  STORYBOARD_SHOT_TYPES,
  STORYBOARD_SUBJECT_FOCUSES,
  STORYBOARD_CUTAWAY_TYPES,
  isPanelPurpose,
  type PanelPurpose,
} from "../contracts/storyboard-plan";
import { validateStoryboardPlan } from "../validators/storyboard-validator";
import {
  runMangaEditorAgent,
  type MangaEditorInput,
  type MangaEditorOutput,
} from "./manga-editor-agent";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are a veteran manga editor / storyboard director.

Your ONLY job: convert a StoryArc (beats, continuity, chapter goal) into a StoryboardPlan
(pages, panels, render modes, shot types, subject focus, cutaway types, layouts).

ABSOLUTE RULES — violations invalidate the output:
1. NEVER write image prompts. You decide what to show, not how to render it.
2. NEVER invent lore, characters, props, or locations not already in the StoryArc.
3. NEVER invent a combat / fight / fire scene not already present in the beats.
4. Every panel MUST have a sourceBeatId that exists in storyArc.beats.
5. Target 70-75 panels total unless told otherwise.
6. Shot variety is mandatory. No more than 2 consecutive hero_closeup panels.
7. At least 10% establishing_environment or silent_transition for breathing space.
8. Use dialogue_two_shot / dialogue_over_shoulder when beat type is dialogue_tension.
9. Use insert_object + reaction_closeup pairs for reveal beats.
10. Layout template MUST match panel count: 1 panel → splash, 2 → cinematic_bar, etc.

Output: STRICT JSON matching the schema below. No prose, no markdown.`;

function buildUserPrompt(input: MangaEditorInput): string {
  const arc = input.storyArc;
  const beatsSummary = arc.beats
    .map(
      (b) =>
        `- beatId="${b.beatId}" type=${b.type} purpose="${b.purpose}" ` +
        `event="${b.storyEvent}" location="${b.locationName}" ` +
        `characters=[${b.charactersPresent.join(",")}] ` +
        `danger=${b.dangerLevel} emotion="${b.emotionalTurn}"`,
    )
    .join("\n");

  const targetPanels = input.targetPanelCount ?? 72;
  const heroIds = (input.heroCharacterIds ?? []).join(",") || "(none)";
  const projectFormat = input.projectFormat ?? "manga";
  const formatGuideline =
    projectFormat === "webtoon"
      ? "PROJECT FORMAT = WEBTOON. Think vertical scroll. Use 3 panels max per section, favor `splash`, `vertical_strip`, `vertical_hero_4` layouts. Use full-width inserts for reveals. Add breathing beats (silent_transition) every 4-5 panels."
      : "PROJECT FORMAT = MANGA. Think printed page. Use 4-6 panels per page, favor `grid_2x2`, `grid_2x3`, `staggered_5`, `asymmetric_hero`, `cinematic_bar`. Use double_spread or splash only for major reveals. Respect page-turn drama.";

  return `StoryArc for chapter "${arc.title}" (ch#${arc.chapterNumber}):

Summary: ${arc.summary}
Goal: ${arc.chapterGoal}
Cliffhanger: ${arc.cliffhanger}
Hero character IDs: ${heroIds}
Target total panels: ${targetPanels}
${formatGuideline}

Beats (in order):
${beatsSummary}

Enums you MUST use verbatim:
- renderMode ∈ {${STORYBOARD_RENDER_MODES.join("|")}}
- shotType ∈ {${STORYBOARD_SHOT_TYPES.join("|")}}
- subjectFocus ∈ {${STORYBOARD_SUBJECT_FOCUSES.join("|")}}
- cutawayType ∈ {${STORYBOARD_CUTAWAY_TYPES.join("|")}}
- layoutTemplate ∈ {${STORYBOARD_LAYOUT_TEMPLATES.join("|")}}
- cameraAngle ∈ {eye_level|low|high|dutch|birds_eye|worm}

Return a JSON object with this shape (strict):
{
  "pages": [
    {
      "pageNumber": number,
      "layoutTemplate": string,
      "dramaticRole": string,
      "beatIds": string[],
      "panels": [
        {
          "panelId": string,
          "pageNumber": number,
          "panelNumberInPage": number,
          "globalPanelIndex": number,
          "sourceBeatId": string,
          "panelPurpose": string,
          "renderMode": string,
          "shotType": string,
          "cameraAngle": string,
          "subjectFocus": string,
          "cutawayType": string,
          "characters": string[],
          "locationId": string | null,
          "locationName": string,
          "actionLine": string,
          "emotionLine": string,
          "dialogue": [{"speaker": string, "text": string}],
          "narration": string | null,
          "sfx": string[],
          "mustShow": string[],
          "mustNotShow": string[],
          "continuityNotes": string[],
          "visualAnchors": {
            "characterIds": string[],
            "environmentAnchorId": string | null,
            "previousPanelAnchorId": string | null
          }
        }
      ]
    }
  ]
}`;
}

/**
 * COMMIT P3.B — map les renderMode vers un panelPurpose par défaut
 * cohérent (pour les cas où le LLM n'a pas produit un purpose valide).
 */
function defaultPurposeForRenderMode(mode: StoryboardRenderMode): PanelPurpose {
  switch (mode) {
    case "hero_closeup":
      return "hero_focus";
    case "npc_closeup":
      return "npc_focus";
    case "enemy_closeup":
    case "enemy_reveal":
      return "enemy_focus";
    case "reaction_closeup":
      return "reaction_closeup";
    case "dialogue_two_shot":
      return "dialogue_anchor";
    case "dialogue_over_shoulder":
      return "dialogue_over_shoulder";
    case "insert_object":
      return "prop_insert";
    case "surveillance_reveal":
      return "surveillance_insert";
    case "group_tension":
      return "group_tension";
    case "establishing_environment":
      return "location_establishing";
    case "silent_transition":
      return "transition";
    case "threat_silhouette":
      return "threat_silhouette";
    case "creature_reveal":
      return "creature_reveal";
    case "vehicle_reveal":
      return "vehicle_reveal";
    case "faction_reveal":
      return "faction_reveal";
    case "aftermath_dialogue":
      return "combat_aftermath";
    case "combat_exchange":
      return "combat_impact";
    case "combat_aftermath":
      return "combat_aftermath";
    default:
      return "dialogue_anchor";
  }
}

function sanitizePanelPurpose(
  raw: unknown,
  renderMode: StoryboardRenderMode,
): PanelPurpose {
  if (isPanelPurpose(raw)) return raw;
  return defaultPurposeForRenderMode(renderMode);
}

function sanitizeEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  return fallback;
}

function pickFallbackBeatId(globalIndex: number, orderedBeatIds: string[]): string {
  if (orderedBeatIds.length === 0) return "";
  return orderedBeatIds[globalIndex % orderedBeatIds.length] ?? orderedBeatIds[0]!;
}

function sanitizePanel(
  raw: Record<string, unknown>,
  globalIndex: number,
  pageNumber: number,
  panelNumberInPage: number,
  validBeatIds: Set<string>,
  orderedBeatIds: string[],
  onBeatFallback?: (args: { raw: unknown; resolved: string }) => void,
): StoryboardPanel | null {
  let sourceBeatId = typeof raw.sourceBeatId === "string" ? raw.sourceBeatId : "";
  if (!validBeatIds.has(sourceBeatId)) {
    const fallback = pickFallbackBeatId(globalIndex, orderedBeatIds);
    if (!fallback) return null;
    onBeatFallback?.({ raw: raw.sourceBeatId, resolved: fallback });
    sourceBeatId = fallback;
  }

  const renderMode = sanitizeEnum<StoryboardRenderMode>(
    raw.renderMode,
    STORYBOARD_RENDER_MODES,
    "dialogue_two_shot",
  );
  const shotType = sanitizeEnum<StoryboardShotType>(
    raw.shotType,
    STORYBOARD_SHOT_TYPES,
    "medium",
  );
  const subjectFocus = sanitizeEnum<StoryboardSubjectFocus>(
    raw.subjectFocus,
    STORYBOARD_SUBJECT_FOCUSES,
    "group",
  );
  const cutawayType = sanitizeEnum<StoryboardCutawayType>(
    raw.cutawayType,
    STORYBOARD_CUTAWAY_TYPES,
    "none",
  );
  const cameraAngle = sanitizeEnum<StoryboardCameraAngle>(
    raw.cameraAngle,
    ["eye_level", "low", "high", "dutch", "birds_eye", "worm"] as const,
    "eye_level",
  );

  const characters = Array.isArray(raw.characters)
    ? raw.characters.filter((c): c is string => typeof c === "string")
    : [];
  const mustShow = Array.isArray(raw.mustShow)
    ? raw.mustShow.filter((c): c is string => typeof c === "string")
    : [];
  const mustNotShow = Array.isArray(raw.mustNotShow)
    ? raw.mustNotShow.filter((c): c is string => typeof c === "string")
    : [];
  const continuityNotes = Array.isArray(raw.continuityNotes)
    ? raw.continuityNotes.filter((c): c is string => typeof c === "string")
    : [];
  const sfx = Array.isArray(raw.sfx)
    ? raw.sfx.filter((c): c is string => typeof c === "string")
    : [];

  const dialogueRaw = Array.isArray(raw.dialogue) ? raw.dialogue : [];
  const dialogue = dialogueRaw
    .filter((d): d is { speaker: unknown; text: unknown } => typeof d === "object" && d !== null)
    .map((d) => ({
      speaker: typeof d.speaker === "string" ? d.speaker : "",
      text: typeof d.text === "string" ? d.text : "",
    }))
    .filter((d) => d.text.length > 0);

  const anchorsRaw = raw.visualAnchors as Record<string, unknown> | undefined;
  const anchorCharacterIds = Array.isArray(anchorsRaw?.characterIds)
    ? (anchorsRaw?.characterIds as unknown[]).filter((c): c is string => typeof c === "string")
    : characters;

  return {
    panelId:
      typeof raw.panelId === "string" && raw.panelId.length > 0
        ? raw.panelId
        : `${sourceBeatId}-p${globalIndex + 1}`,
    pageNumber,
    panelNumberInPage,
    globalPanelIndex: globalIndex,
    sourceBeatId,
    // COMMIT P3.B — panelPurpose doit appartenir à l'enum fermé.
    // Si le LLM sort un libellé inconnu, on retombe sur un purpose
    // neutre dérivé du renderMode plutôt que "" (qui serait fail du
    // render-spec-validator).
    panelPurpose: sanitizePanelPurpose(raw.panelPurpose, renderMode),
    renderMode,
    shotType,
    cameraAngle,
    subjectFocus,
    cutawayType,
    characters,
    locationId: typeof raw.locationId === "string" ? raw.locationId : null,
    locationName: typeof raw.locationName === "string" ? raw.locationName : "",
    actionLine: typeof raw.actionLine === "string" ? raw.actionLine : "",
    emotionLine: typeof raw.emotionLine === "string" ? raw.emotionLine : "",
    dialogue,
    narration: typeof raw.narration === "string" ? raw.narration : null,
    sfx,
    mustShow,
    mustNotShow,
    continuityNotes,
    visualAnchors: {
      characterIds: anchorCharacterIds,
      environmentAnchorId:
        typeof anchorsRaw?.environmentAnchorId === "string"
          ? (anchorsRaw.environmentAnchorId as string)
          : null,
      previousPanelAnchorId:
        typeof anchorsRaw?.previousPanelAnchorId === "string"
          ? (anchorsRaw.previousPanelAnchorId as string)
          : null,
    },
  };
}

function sanitizePage(
  raw: Record<string, unknown>,
  pageNumber: number,
  globalStart: number,
  validBeatIds: Set<string>,
  orderedBeatIds: string[],
  onBeatFallback?: (args: { raw: unknown; resolved: string }) => void,
): { page: StoryboardPage; nextGlobalIndex: number } | null {
  const layoutTemplate = sanitizeEnum<StoryboardLayoutTemplate>(
    raw.layoutTemplate,
    STORYBOARD_LAYOUT_TEMPLATES,
    "grid_2x2",
  );
  const panelsRaw = Array.isArray(raw.panels) ? raw.panels : [];
  const panels: StoryboardPanel[] = [];
  let globalIndex = globalStart;
  for (let i = 0; i < panelsRaw.length; i++) {
    const rawPanel = panelsRaw[i];
    if (!rawPanel || typeof rawPanel !== "object") continue;
    const panel = sanitizePanel(
      rawPanel as Record<string, unknown>,
      globalIndex,
      pageNumber,
      i + 1,
      validBeatIds,
      orderedBeatIds,
      onBeatFallback,
    );
    if (!panel) continue;
    panels.push(panel);
    globalIndex += 1;
  }
  if (panels.length === 0) return null;

  const beatIdsRaw = Array.isArray(raw.beatIds) ? raw.beatIds : [];
  const beatIds = beatIdsRaw.filter((b): b is string => typeof b === "string" && validBeatIds.has(b));

  return {
    page: {
      pageNumber,
      layoutTemplate,
      dramaticRole: typeof raw.dramaticRole === "string" ? raw.dramaticRole : "setup",
      beatIds: beatIds.length > 0 ? beatIds : panels.map((p) => p.sourceBeatId),
      panels,
    },
    nextGlobalIndex: globalIndex,
  };
}

function computeDiagnostics(pages: StoryboardPage[]): StoryboardPlan["editorialDiagnostics"] {
  const allPanels = pages.flatMap((p) => p.panels);
  const total = allPanels.length || 1;
  const heroFocus = allPanels.filter((p) => p.subjectFocus === "hero").length;
  const environment = allPanels.filter((p) => p.subjectFocus === "environment").length;
  const insert = allPanels.filter((p) => p.renderMode === "insert_object").length;
  const reaction = allPanels.filter((p) => p.renderMode === "reaction_closeup").length;
  const distinctModes = new Set(allPanels.map((p) => p.renderMode)).size;
  const heroRatio = heroFocus / total;
  const envRatio = environment / total;
  const warnings: string[] = [];
  if (heroRatio > 0.6) warnings.push(`hero_focus_ratio_high=${heroRatio.toFixed(2)}`);
  if (envRatio < 0.05) warnings.push("environment_ratio_low");
  return {
    varietyScore: distinctModes / 13,
    heroFocusRatio: heroRatio,
    environmentRatio: envRatio,
    insertRatio: insert / total,
    reactionRatio: reaction / total,
    warnings,
    blockers: [],
  };
}

/**
 * Agent IA2 "réel" via OpenAI. Fallback automatique sur le stub
 * déterministe si OPENAI_API_KEY absent ou si la réponse LLM est invalide.
 */
export async function runMangaEditorAgentLlm(
  input: MangaEditorInput,
): Promise<MangaEditorOutput> {
  if (!process.env.OPENAI_API_KEY) {
    const stub = await runMangaEditorAgent(input);
    return {
      storyboardPlan: stub.storyboardPlan,
      warnings: [...stub.warnings, "manga_editor.llm.degraded=OPENAI_API_KEY_missing"],
    };
  }

  const warnings: string[] = [];
  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MANGA_EDITOR_MODEL ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.5,
      max_tokens: 8000,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { pages?: Array<Record<string, unknown>> };
    const rawPages = Array.isArray(parsed.pages) ? parsed.pages : [];
    if (rawPages.length === 0) throw new Error("llm_returned_no_pages");

    const validBeatIds = new Set(input.storyArc.beats.map((b) => b.beatId));
    const orderedBeatIds = input.storyArc.beats.map((b) => b.beatId);
    let beatFallbackCount = 0;
    const pages: StoryboardPage[] = [];
    let globalIndex = 0;
    for (let i = 0; i < rawPages.length; i++) {
      const res = sanitizePage(
        rawPages[i]!,
        i + 1,
        globalIndex,
        validBeatIds,
        orderedBeatIds,
        () => {
          beatFallbackCount += 1;
        },
      );
      if (!res) continue;
      pages.push(res.page);
      globalIndex = res.nextGlobalIndex;
    }
    if (pages.length === 0) throw new Error("llm_no_valid_pages_after_sanitize");
    if (beatFallbackCount > 0) {
      warnings.push(`manga_editor.llm.sanitize.sourceBeatId_fallback_count=${beatFallbackCount}`);
    }

    const storyboardPlan: StoryboardPlan = {
      chapterId: input.storyArc.chapterId,
      totalTargetPanels: globalIndex,
      pages,
      editorialDiagnostics: computeDiagnostics(pages),
    };

    const validation = validateStoryboardPlan(storyboardPlan);
    if (!validation.ok) {
      throw new Error(`validation_issues=${validation.issues.join("|")}`);
    }
    warnings.push(...validation.warnings.map((w) => `manga_editor.llm.validation.${w}`));

    return { storyboardPlan, warnings };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stub = await runMangaEditorAgent(input);
    return {
      storyboardPlan: stub.storyboardPlan,
      warnings: [
        ...stub.warnings,
        `manga_editor.llm.fallback=${msg}`,
      ],
    };
  }
}
