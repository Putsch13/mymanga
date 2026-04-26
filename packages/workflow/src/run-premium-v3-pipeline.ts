import {
  buildOutlineTextForSanitizer,
  buildVisualCoverageGapClassificationContext,
  classifyVisualCoverageGaps,
  enrichPremiumBlueprintsSceneDialogue,
  extractRequiredVisualCoverage,
  extractRequiredVisualCoverageFromProductionPlan,
  sanitizeVisualContractBeforeCoverage,
  extractChapterVisualContract,
  mergeRequiredVisualCoverageWithContract,
  validateVisualCoverage,
  type StoryArc,
} from "@manga-ai-studio/ai";
import {
  PREMIUM_PANEL_RANGE,
  PRODUCTION_RULES,
  canonicalPlanToPanelBlueprints,
  ensureCanonicalProductionPlan,
  resolveProductionOutlineForPremiumPipeline,
  buildChapterCastContract,
  assertValidChapterCastContract,
  formatCastContractLog,
  buildChapterStoryContract,
  assertValidChapterStoryContract,
  formatStoryContractLog,
  type CanonicalChapterProductionPlan,
  type PanelBlueprintPremium,
  type ChapterCastContract,
  type ChapterStoryContract,
} from "@manga-ai-studio/core";
import { createDefaultPanelImageGenerator } from "./passes/default-panel-image-generator";
import { loadChapterVisualMemory } from "./passes/load-chapter-visual-memory";
import { runPageQaPass } from "./passes/page-qa-pass";
import { runRenderPass } from "./passes/render-pass";
import { runStoryPass } from "./passes/story-pass";
import { buildStoryboardPlanFromApprovedProductionPlan } from "./build-storyboard-plan-from-approved-production-plan";
import { buildStoryboardPlanFromCanonicalPlan } from "./build-storyboard-plan-from-canonical-plan";
import { buildStoryArcFromProductionPlan } from "./build-story-arc-from-production-plan";
import { buildStoryboardPlanFromPremiumBlueprints } from "./passes/storyboard-from-premium-plan";
import { runStoryboardPass } from "./passes/storyboard-pass";
import { buildStyleBibleFromUserProject } from "./chapter-style-bible-resolver";
import { isPipelineV3RenderFalEnabled } from "./pipeline-feature-flags";
import { loadLocationsForV3StoryPass, type PremiumV3PipelineLocation } from "./load-locations-for-v3-story-pass";
import {
  loadChapterVisualContractUi,
  saveChapterVisualContractSnapshot,
} from "./persistence/chapter-visual-contract-persistence";
import { saveStoryboardPlan } from "./persistence/storyboard-persistence";
import { computeEntityCoverageTelemetry, formatEntityCoverageTypesLine } from "./passes/entity-coverage-telemetry";
import {
  ensureDialogueBeatsHaveAnchors,
  ensureDialogueAndSfxForPremiumBlueprints,
  runDialogueQaOnBlueprints,
} from "./passes/dialogue-beat-rebalance";
import { applyPanelNarrativeVariationToBlueprints } from "./passes/panel-narrative-variation-planner";
import { buildVisualEntitiesFromPremiumV3Input } from "./passes/visual-entity-registry";
import {
  isPremiumMangaCutawayBlueprint,
  rebalancePremiumBlueprintsForManga,
} from "./passes/premium-manga-rebalance";
import { runMangaStructureQaOnBlueprints } from "./passes/manga-structure-qa";
import { runPreRenderPremiumQaOrThrow } from "./passes/pre-render-premium-qa";
import {
  runEnvironmentAnchorPass,
  extractPrimaryEnvironmentAnchorId,
} from "./passes/environment-anchor-pass";
import { runRenderModeNormalizer } from "./passes/render-mode-normalizer";
import { runCharacterIdentityFallback } from "./passes/character-identity-fallback";
import { runNarrativeContractQa } from "./passes/beat-narrative-contract";
import { repairStoryboardVisualCoverage } from "./passes/repair-storyboard-visual-coverage";
import {
  assertPremiumVisualQaConfig,
  getPremiumVisualQaConfigStatus,
  isPremiumVisualQaStrictlyRequired,
} from "./passes/assert-premium-visual-qa-config";
import { runBeatCoverageQaPass, formatBeatCoverageQaLog } from "./passes/beat-coverage-qa-pass";
import { runEmotionalArcQaPass, formatEmotionalArcQaLog } from "./passes/emotional-arc-qa-pass";
import { runInteractionQaPass, formatInteractionQaLog } from "./passes/interaction-qa-pass";
import { runPropsQaPass, formatPropsQaLog } from "./passes/props-qa-pass";
import { runVisualDiscoveryPass, formatVisualDiscoveryLog } from "./passes/visual-discovery-pass";
import { runCanonResolverPass, formatCanonResolverLog } from "./passes/canon-resolver-pass";
import { runStoryContractCompletenessQa, formatStoryContractCompletenessLog } from "./passes/story-contract-completeness-qa";

export type { PremiumV3PipelineLocation } from "./load-locations-for-v3-story-pass";

export interface PremiumV3PipelineCharacter {
  id: string;
  name: string;
  roleType?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  canonSignatureText?: string | null;
  forbiddenVisualDrift?: string[] | null;
}

export interface RunPremiumV3PipelineInput {
  chapterId: string;
  projectId: string;
  chapterNumber: number;
  chapterTitle: string | null;
  chapterSummary: string | null;
  chapterUserIntent: string | null;
  project: Record<string, unknown> | null;
  stylePacks: Array<Record<string, unknown>>;
  rawCharacters: PremiumV3PipelineCharacter[];
  /** Outline approuvé (traçabilité / futurs garde-fous) — le storyboard vient du productionPlan. */
  approvedOutline?: Record<string, unknown> | null;
  /** Plan premium persisté : source de vérité en mode approved_plan_driven. */
  productionPlan?: Record<string, unknown> | null;
  heroCharacterId?: string | null;
  focusCharacterIds: string[];
  activeNpcIds?: string[];
  activeCreatureIds?: string[];
  locationIds?: string[];
  /** Lieux résolus (fiche projet). Sinon on résout `locationIds` en base avant le story-pass. */
  locations?: PremiumV3PipelineLocation[];
  pipelineV3Enabled: boolean;
  premiumV3OnlyEnabled: boolean;
  productionPlanPages?: Array<{ pageNumber: number; panelCount: number; beatIds?: string[] | null }>;
  panelBlueprints?: PanelBlueprintPremium[];
  chapterLocationName?: string | null;
  /** Répliques du chapitre précédent (normalisées) — alimente le dialoguiste scène si activé. */
  priorChapterDialogueSnippets?: string[] | null;
  /** Studio : forcer le dialoguiste scène pour ce run (cumulable avec OPENAI_SCENE_DIALOGUE_ENRICH). */
  sceneDialogueEnrich?: boolean;
}

export interface RunPremiumV3PipelineResult {
  v3RenderSucceeded: boolean;
}

function assertPremiumOnlyV3Config(input: Pick<RunPremiumV3PipelineInput, "pipelineV3Enabled" | "premiumV3OnlyEnabled">) {
  if (input.premiumV3OnlyEnabled && !input.pipelineV3Enabled) {
    throw new Error(
      "premium_v3_only_misconfigured: PIPELINE_V3_PREMIUM_ONLY=true mais PIPELINE_V3_STORYBOARD=false. " +
        "Le premium-only interdit toute exécution legacy : active la v3 ou désactive PREMIUM_ONLY.",
    );
  }
  if (input.premiumV3OnlyEnabled && !isPipelineV3RenderFalEnabled()) {
    throw new Error(
      "premium_v3_only_misconfigured: PIPELINE_V3_PREMIUM_ONLY=true impose PIPELINE_V3_RENDER_FAL=true. " +
        "Le render-pass v3 doit générer et persister les images ; aucun fallback legacy n'est autorisé.",
    );
  }
}

/**
 * P1.9 + P7 — Patterns pour détecter les groupes humains dans le texte narratif.
 * Ces mots déclenchent la création d'un npcGroup s'ils sont trouvés dans le résumé/beats.
 */
const NPC_GROUP_DETECTION_PATTERNS: Array<{ pattern: RegExp; label: string; visualHint?: string }> = [
  { pattern: /\bp[eê]cheurs?\b/gi, label: "pêcheurs", visualHint: "fishermen at work, fishing nets, boats" },
  { pattern: /\bmarins?\b/gi, label: "marins", visualHint: "sailors in uniform, naval attire" },
  { pattern: /\bfoule\b/gi, label: "foule", visualHint: "crowd of people, busy scene" },
  { pattern: /\bpassants?\b/gi, label: "passants", visualHint: "passersby, people walking" },
  { pattern: /\bclients?\b/gi, label: "clients", visualHint: "customers, patrons" },
  { pattern: /\bsoldats?\b/gi, label: "soldats", visualHint: "soldiers in uniform" },
  { pattern: /\bgardes?\b/gi, label: "gardes", visualHint: "guards, sentries" },
  { pattern: /\bvillageois\b/gi, label: "villageois", visualHint: "villagers, rural people" },
  { pattern: /\bmarchands?\b/gi, label: "marchands", visualHint: "merchants, traders with goods" },
  { pattern: /\bouvriers?\b/gi, label: "ouvriers", visualHint: "workers, laborers" },
  { pattern: /\benfants?\b/gi, label: "enfants", visualHint: "children playing" },
  { pattern: /\bserveurs?\b/gi, label: "serveurs", visualHint: "waiters, servers" },
  { pattern: /\bpoliciers?\b/gi, label: "policiers", visualHint: "police officers" },
  // English equivalents
  { pattern: /\bfishermen?\b/gi, label: "pêcheurs", visualHint: "fishermen at work" },
  { pattern: /\bsailors?\b/gi, label: "marins", visualHint: "sailors" },
  { pattern: /\bcrowd\b/gi, label: "foule", visualHint: "crowd of people" },
  { pattern: /\bworkers?\b/gi, label: "ouvriers", visualHint: "workers" },
  { pattern: /\bguards?\b/gi, label: "gardes", visualHint: "guards" },
  { pattern: /\bsoldiers?\b/gi, label: "soldats", visualHint: "soldiers" },
];

/**
 * P7 — Détecte les groupes NPC depuis le texte narratif (résumé, intent, beats).
 */
function detectNpcGroupsFromText(
  texts: Array<string | null | undefined>,
): Array<{ id: string; label: string; visualDescription?: string }> {
  const combined = texts.filter(Boolean).join(" ").toLowerCase();
  const detected = new Map<string, { id: string; label: string; visualDescription: string }>();

  for (const { pattern, label, visualHint } of NPC_GROUP_DETECTION_PATTERNS) {
    if (pattern.test(combined)) {
      const groupId = `text_${label.toLowerCase().replace(/\s+/g, "_")}`;
      if (!detected.has(groupId)) {
        detected.set(groupId, {
          id: groupId,
          label,
          visualDescription: visualHint ?? "",
        });
      }
    }
  }

  return Array.from(detected.values());
}

/**
 * P1.9 — Extrait les groupes NPC depuis les blueprints premium.
 * Identifie les panels de foule et les PNJ nommés.
 */
function extractNpcGroupsFromBlueprints(
  blueprints: PanelBlueprintPremium[] | null | undefined,
): Array<{ id: string; label: string; visualDescription?: string; requiredInBeatIds?: string[] }> {
  if (!blueprints || blueprints.length === 0) return [];

  const groups = new Map<
    string,
    { id: string; label: string; visualDescription: string; requiredInBeatIds: Set<string> }
  >();

  for (const bp of blueprints) {
    if (bp.cutawayType === "crowd" || bp.cutawayType === "npc_group") {
      const groupId = "crowd_" + (bp.sceneContextLabel?.toLowerCase().replace(/\s+/g, "_") ?? "generic");
      if (!groups.has(groupId)) {
        groups.set(groupId, {
          id: groupId,
          label: bp.sceneContextLabel ?? "foule d'ambiance",
          visualDescription: "",
          requiredInBeatIds: new Set(),
        });
      }
      if (bp.beatId) {
        groups.get(groupId)!.requiredInBeatIds.add(bp.beatId);
      }
    }

    if (bp.npcVisualDna && Array.isArray(bp.npcVisualDna)) {
      for (const npc of bp.npcVisualDna) {
        const npcId = npc.continuityId ?? `npc_${npc.displayName?.toLowerCase().replace(/\s+/g, "_") ?? "anon"}`;
        if (!groups.has(npcId)) {
          groups.set(npcId, {
            id: npcId,
            label: npc.displayName ?? "PNJ anonyme",
            visualDescription: npc.visualMarkers?.join(", ") ?? "",
            requiredInBeatIds: new Set(),
          });
        }
        if (bp.beatId) {
          groups.get(npcId)!.requiredInBeatIds.add(bp.beatId);
        }
      }
    }
  }

  return Array.from(groups.values()).map((g) => ({
    id: g.id,
    label: g.label,
    visualDescription: g.visualDescription || undefined,
    requiredInBeatIds: g.requiredInBeatIds.size > 0 ? Array.from(g.requiredInBeatIds) : undefined,
  }));
}

function resolveProjectFormat(project: Record<string, unknown> | null, projectId: string): "manga" | "webtoon" {
  const projectFormatRaw = typeof project?.format === "string" ? project.format : null;
  const projectFormat: "manga" | "webtoon" = projectFormatRaw === "webtoon" ? "webtoon" : "manga";
  if (projectFormatRaw !== "manga" && projectFormatRaw !== "webtoon") {
    console.warn(
      `[pipeline:v3:storyboard] project_format_fallback raw=${projectFormatRaw ?? "null"} → manga (projectId=${projectId})`,
    );
  }
  return projectFormat;
}

async function resolveLocationsForStoryPass(
  input: RunPremiumV3PipelineInput,
): Promise<PremiumV3PipelineLocation[]> {
  let resolved = Array.isArray(input.locations) && input.locations.length > 0 ? [...input.locations] : [];
  if (resolved.length === 0 && Array.isArray(input.locationIds) && input.locationIds.length > 0) {
    resolved = await loadLocationsForV3StoryPass({
      projectId: input.projectId,
      locationIds: input.locationIds,
    });
  }
  if (
    resolved.length === 0
    && typeof input.chapterLocationName === "string"
    && input.chapterLocationName.trim().length > 0
  ) {
    resolved = [
      {
        id: `chapter-primary:${input.chapterId}`,
        name: input.chapterLocationName.trim(),
        visualDNA: { source: "chapter_location_field" },
      },
    ];
  }
  if (resolved.length > 0) {
    const locationSource =
      input.locations?.length ? "input"
      : input.locationIds?.length ? "locationIds"
      : "chapterLocationName";
    console.info(
      `[pipeline:v3:locations] chapterId=${input.chapterId} count=${resolved.length} source=${locationSource}`,
    );
  }
  return resolved;
}

export function hasApprovedPlanDrivenInput(input: RunPremiumV3PipelineInput): boolean {
  const plan = input.productionPlan as Record<string, unknown> | null | undefined;
  return Boolean(
    plan
    && Array.isArray(plan.panelBlueprints)
    && plan.panelBlueprints.length > 0,
  );
}

export async function runPremiumV3Pipeline(
  input: RunPremiumV3PipelineInput,
): Promise<RunPremiumV3PipelineResult> {
  assertPremiumOnlyV3Config(input);
  let visualQaProductionConfigSkipped = false;
  if (input.premiumV3OnlyEnabled && process.env.NODE_ENV === "production") {
    const visualCfg = getPremiumVisualQaConfigStatus();
    if (!visualCfg.ok) {
      if (isPremiumVisualQaStrictlyRequired()) {
        assertPremiumVisualQaConfig();
      } else {
        visualQaProductionConfigSkipped = true;
        console.warn(
          `[pipeline:v3] premium_visual_qa_config_skipped chapterId=${input.chapterId} ` +
            `PREMIUM_VISUAL_QA_REQUIRED=false missing=${visualCfg.missing.join(",")} — rendu avec needs_review`,
        );
      }
    }
  }

  let v3RenderSucceeded = false;
  if (!input.pipelineV3Enabled) {
    return { v3RenderSucceeded };
  }

  const pipelineStartMs = Date.now();
  const timings: Record<string, number> = {};

  try {
    // P1.9 — Extraire les groupes NPC depuis les blueprints s'ils sont disponibles.
    const npcGroupsFromBlueprints = extractNpcGroupsFromBlueprints(input.panelBlueprints);
    if (npcGroupsFromBlueprints.length > 0) {
      console.info(
        `[pipeline:v3:npc-groups] extracted ${npcGroupsFromBlueprints.length} groups from blueprints: ` +
          npcGroupsFromBlueprints.map((g) => g.label).join(", "),
      );
    }

    // P7 — Détecter les groupes NPC depuis le texte narratif (résumé, intent).
    const beatTexts = input.panelBlueprints?.map((bp) => bp.purpose ?? bp.sceneContextLabel) ?? [];
    const npcGroupsFromText = detectNpcGroupsFromText([
      input.chapterSummary,
      input.chapterUserIntent,
      ...beatTexts,
    ]);
    if (npcGroupsFromText.length > 0) {
      console.info(
        `[pipeline:v3:npc-groups] detected ${npcGroupsFromText.length} groups from text: ` +
          npcGroupsFromText.map((g) => g.label).join(", "),
      );
    }

    // Fusionner les groupes NPC (blueprints + texte), sans doublons
    const mergedNpcGroupsMap = new Map<string, { id: string; label: string; visualDescription?: string; requiredInBeatIds?: string[] }>();
    for (const g of npcGroupsFromBlueprints) {
      mergedNpcGroupsMap.set(g.label.toLowerCase(), g);
    }
    for (const g of npcGroupsFromText) {
      if (!mergedNpcGroupsMap.has(g.label.toLowerCase())) {
        mergedNpcGroupsMap.set(g.label.toLowerCase(), g);
      }
    }
    const mergedNpcGroups = Array.from(mergedNpcGroupsMap.values());
    if (mergedNpcGroups.length > 0) {
      console.info(
        `[pipeline:v3:npc-contract] groups=${mergedNpcGroups.length} labels=${mergedNpcGroups.map((g) => g.label).join(",")}`,
      );
    }

    // P0.1 — Construire et valider le ChapterCastContract AVANT tout traitement.
    // C'est la source de vérité pour l'identité des personnages.
    const castContract: ChapterCastContract = buildChapterCastContract({
      chapterId: input.chapterId,
      heroCharacterId: input.heroCharacterId ?? null,
      focusCharacterIds: input.focusCharacterIds,
      characters: input.rawCharacters.map((c) => ({
        id: c.id,
        name: c.name,
        roleType: c.roleType ?? null,
      })),
      npcGroups: mergedNpcGroups,
    });
    assertValidChapterCastContract(castContract);
    console.info(formatCastContractLog(castContract));

    const approvedPlanDriven = hasApprovedPlanDrivenInput(input);
    const projectFormat = resolveProjectFormat(input.project, input.projectId);
    const resolvedProductionOutline = resolveProductionOutlineForPremiumPipeline({
      approvedOutlineRaw: input.approvedOutline ?? null,
      productionPlanRaw: input.productionPlan ?? null,
      chapterSummary: input.chapterSummary,
      cliffhangerOverride: null,
    });

    // P1.6 + P9 — Construire le ChapterStoryContract APRÈS résolution du plan.
    // Ce contrat définit les éléments narratifs et visuels REQUIS pour le chapitre.
    // On extrait les beatIds depuis le resolvedProductionOutline pour un contrat complet.
    const resolvedBeatIds = resolvedProductionOutline?.beats?.map((b: { beatId?: string }) => b.beatId).filter(Boolean) as string[] ?? [];
    const resolvedLocations = await (async () => {
      const locs = input.locations ?? [];
      if (locs.length > 0) return locs;
      if (input.locationIds?.length) {
        return loadLocationsForV3StoryPass({
          projectId: input.projectId,
          locationIds: input.locationIds,
        });
      }
      return [];
    })();

    // P1.4 — Visual Discovery Pass : détection automatique des entités visuelles.
    // Ce pass détecte les lieux, PNJ, robots, hybrides, créatures depuis le texte narratif.
    const discoveryInput = {
      chapterId: input.chapterId,
      beats: resolvedProductionOutline?.beats?.map((b: { beatId?: string; summary?: string; whyThisBeatExists?: string }) => ({
        beatId: b.beatId ?? "",
        summary: b.summary,
        whyThisBeatExists: b.whyThisBeatExists,
      })) ?? [],
      chapterSummary: input.chapterSummary,
      userIntent: input.chapterUserIntent,
      knownCharacters: input.rawCharacters.map((c) => ({
        id: c.id,
        name: c.name,
        roleType: c.roleType,
        description: c.canonSignatureText,
      })),
      knownLocations: resolvedLocations.map((loc) => ({
        id: loc.id,
        name: loc.name ?? loc.id,
        description: typeof loc.visualDNA?.description === "string" ? loc.visualDNA.description : undefined,
      })),
    };
    const visualDiscoveryResult = runVisualDiscoveryPass(discoveryInput);
    console.info(formatVisualDiscoveryLog(visualDiscoveryResult));

    // P1.5 — Canon Resolver : résolution canonique des entités détectées.
    const canonResolverResult = runCanonResolverPass({
      discoveryContract: visualDiscoveryResult.contract,
      userCharacters: input.rawCharacters.map((c) => ({
        id: c.id,
        name: c.name,
        roleType: c.roleType,
        description: c.canonSignatureText,
      })),
      userLocations: resolvedLocations.map((loc) => ({
        id: loc.id,
        name: loc.name ?? loc.id,
        description: typeof loc.visualDNA?.description === "string" ? loc.visualDNA.description : undefined,
      })),
      strictMode: input.premiumV3OnlyEnabled,
    });
    console.info(formatCanonResolverLog(canonResolverResult));

    // Enrichir les NPC groups avec ceux détectés automatiquement
    for (const npcGroup of visualDiscoveryResult.contract.npcGroups) {
      const existing = mergedNpcGroupsMap.get(npcGroup.label.toLowerCase());
      if (!existing) {
        mergedNpcGroupsMap.set(npcGroup.label.toLowerCase(), {
          id: `auto_${npcGroup.label.toLowerCase().replace(/\s+/g, "_")}`,
          label: npcGroup.label,
          visualDescription: npcGroup.visualDescription,
          requiredInBeatIds: npcGroup.requiredBeats,
        });
      }
    }
    const enrichedNpcGroups = Array.from(mergedNpcGroupsMap.values());
    if (enrichedNpcGroups.length > mergedNpcGroups.length) {
      console.info(
        `[pipeline:v3:npc-discovery] auto_detected=${enrichedNpcGroups.length - mergedNpcGroups.length} ` +
          `total=${enrichedNpcGroups.length}`,
      );
    }

    // Enrichir les lieux avec ceux détectés automatiquement
    const enrichedLocations = [...resolvedLocations];
    for (const tempLoc of canonResolverResult.contract.temporaryLocations) {
      const exists = enrichedLocations.some(
        (l) => l.id === tempLoc.id || l.name?.toLowerCase() === tempLoc.label.toLowerCase(),
      );
      if (!exists) {
        enrichedLocations.push({
          id: tempLoc.id,
          name: tempLoc.label,
          visualDNA: { description: tempLoc.visualDescription },
        } as PremiumV3PipelineLocation);
      }
    }

    const storyContract: ChapterStoryContract = buildChapterStoryContract({
      chapterId: input.chapterId,
      chapterNumber: input.chapterNumber,
      chapterTitle: input.chapterTitle,
      chapterSummary: input.chapterSummary,
      chapterUserIntent: input.chapterUserIntent,
      heroCharacterId: castContract.heroCharacterId,
      characters: input.rawCharacters.map((c) => ({
        id: c.id,
        name: c.name,
        roleType: c.roleType ?? null,
      })),
      locations: enrichedLocations.map((loc) => ({
        id: loc.id,
        name: loc.name ?? loc.id,
        visualDescription:
          typeof loc.visualDNA?.description === "string" ? loc.visualDNA.description : "",
      })),
      npcGroups: enrichedNpcGroups,
      beatIds: resolvedBeatIds,
      tone: "neutral",
    });
    assertValidChapterStoryContract(storyContract);
    console.info(formatStoryContractLog(storyContract));

    // P6.17 — StoryContractCompletenessQA : vérifier la complétude du contrat.
    const storyContractQaResult = runStoryContractCompletenessQa({
      storyContract,
      castContract,
      beatIds: resolvedBeatIds,
      strictMode: input.premiumV3OnlyEnabled,
    });
    console.info(formatStoryContractCompletenessLog(storyContractQaResult));
    if (!storyContractQaResult.ok && input.premiumV3OnlyEnabled) {
      throw new Error(
        `story_contract_incomplete: ${storyContractQaResult.issues.map((i) => i.code).join(", ")}`,
      );
    }
    let storyArc: StoryArc | null = null;

    let storyboardPassResult: Awaited<ReturnType<typeof runStoryboardPass>>;

    let productionPlanForStoryboard: Record<string, unknown> | null = approvedPlanDriven
      ? ({ ...(input.productionPlan as Record<string, unknown>) } as Record<string, unknown>)
      : null;
    let panelBlueprintsForPremiumPath: PanelBlueprintPremium[] | null =
      Array.isArray(input.panelBlueprints) && input.panelBlueprints.length > 0
        ? input.panelBlueprints.map((b) => structuredClone(b))
        : null;

    let canonicalRuntimePlan: CanonicalChapterProductionPlan | null = null;
    if (resolvedProductionOutline) {
      try {
        canonicalRuntimePlan = ensureCanonicalProductionPlan({
          projectId: input.projectId,
          chapterId: input.chapterId,
          chapterNumber: input.chapterNumber,
          chapterTitle: input.chapterTitle ?? `Chapitre ${input.chapterNumber}`,
          format: projectFormat,
          rawOutline: resolvedProductionOutline,
          strictQa: input.premiumV3OnlyEnabled,
        });
        const derivedBlueprints = canonicalPlanToPanelBlueprints(canonicalRuntimePlan);
        panelBlueprintsForPremiumPath = derivedBlueprints;
        if (productionPlanForStoryboard) {
          productionPlanForStoryboard.panelBlueprints = derivedBlueprints;
        }
        console.info(
          `[pipeline:v3:canonical-runtime] panels=${derivedBlueprints.length} qa_valid=${canonicalRuntimePlan.qa.valid}`,
        );
      } catch (err) {
        if (input.premiumV3OnlyEnabled) throw err;
        console.warn(
          `[pipeline:v3:canonical-runtime] fallback_persisted_blueprints reason=${(err as Error).message}`,
        );
      }
    } else {
      console.warn(
        `[pipeline:v3:canonical-runtime] no_production_outline — using job/snapshot panelBlueprints (bridge) chapterId=${input.chapterId}`,
      );
    }

    if (projectFormat === "manga") {
      const mangaRebalanceStart = Date.now();
      let workingBlueprints: PanelBlueprintPremium[] | null = null;
      if (approvedPlanDriven && productionPlanForStoryboard) {
        const raw = productionPlanForStoryboard.panelBlueprints;
        if (Array.isArray(raw) && raw.length > 0) {
          workingBlueprints = raw.map((b) => structuredClone(b)) as PanelBlueprintPremium[];
        }
      } else if (panelBlueprintsForPremiumPath?.length) {
        workingBlueprints = panelBlueprintsForPremiumPath.map((b) => structuredClone(b));
      }

      if (workingBlueprints && workingBlueprints.length > 0) {
        const total = workingBlueprints.length;
        const beforeCut = workingBlueprints.filter(isPremiumMangaCutawayBlueprint).length;
        const beforeRatio = total > 0 ? beforeCut / total : 0;
        const mangaMaxCutawayRatio = PRODUCTION_RULES.cutaway.maxRatio;
        const mangaMinActorDrivenRatio = PRODUCTION_RULES.actorDriven.minRatio;

        const visualEntities = buildVisualEntitiesFromPremiumV3Input({
          projectId: input.projectId,
          rawCharacters: input.rawCharacters,
          focusCharacterIds: castContract.activeCharacterIds,
          heroCharacterId: castContract.heroCharacterId,
          activeCreatureIds: input.activeCreatureIds,
        });

        const rebal = rebalancePremiumBlueprintsForManga({
          blueprints: workingBlueprints,
          visualEntities,
          projectFormat: "manga",
          maxCutawayRatio: mangaMaxCutawayRatio,
          minActorDrivenRatio: mangaMinActorDrivenRatio,
          fallbackHeroId: castContract.heroCharacterId,
          projectId: input.projectId,
        });

        const afterCut = rebal.blueprints.filter(isPremiumMangaCutawayBlueprint).length;
        const afterActor = rebal.afterActorDrivenCount;
        const afterRatio = total > 0 ? afterCut / total : 0;
        const actorRatio = total > 0 ? afterActor / total : 0;

        console.info(
          `[pipeline:v3:manga-rebalance] before cutaways=${beforeCut}/${total} ratio=${(beforeRatio * 100).toFixed(1)}%`,
        );
        console.info(
          `[pipeline:v3:manga-rebalance] converted=${rebal.convertedCount} keptHardCritical=${rebal.keptHardCriticalCount} keptSoftCritical=${rebal.keptSoftCriticalCount} structureIterations=${rebal.structureIterations}`,
        );
        if (rebal.autoCreatedOpponents > 0 || rebal.skippedSuspenseBeats.length > 0) {
          console.info(
            `[pipeline:v3:opponent-auto-canon] autoCreated=${rebal.autoCreatedOpponents} skippedSuspenseBeats=${rebal.skippedSuspenseBeats.length > 0 ? rebal.skippedSuspenseBeats.join(",") : "none"}`,
          );
        }
        console.info(
          `[pipeline:v3:manga-rebalance] after cutaways=${afterCut}/${total} ratio=${(afterRatio * 100).toFixed(1)}%`,
        );
        console.info(
          `[pipeline:v3:manga-rebalance] actorDriven=${afterActor}/${total} ratio=${(actorRatio * 100).toFixed(1)}%`,
        );

        const entityCov = computeEntityCoverageTelemetry(rebal.blueprints, visualEntities);
        console.info(
          `[pipeline:v3:entity-coverage] required=${entityCov.required} covered=${entityCov.covered} missing=${entityCov.missing.length} opponentPanels=${entityCov.opponentPanels} groupEntityPanels=${entityCov.groupEntityPanels} namedNpcPanels=${entityCov.namedNpcPanels} ambientEntityPanels=${entityCov.ambientEntityPanels}`,
        );
        const typesLine = formatEntityCoverageTypesLine(entityCov.byUserDefinedKind);
        if (typesLine.length > 0) {
          console.info(`[pipeline:v3:entity-coverage:types] ${typesLine}`);
        }

        const characterNameById = Object.fromEntries(
          input.rawCharacters.map((c) => [c.id, c.name] as const),
        );
        const sfxEnrichment = ensureDialogueAndSfxForPremiumBlueprints({
          blueprints: rebal.blueprints,
          chapterUserIntent: input.chapterUserIntent,
          productionOutline: resolvedProductionOutline ?? undefined,
          chapterSummary: input.chapterSummary,
          characterNameById,
          projectGenre: typeof input.project?.primaryGenre === "string" ? input.project.primaryGenre : null,
          projectTone: typeof input.project?.tone === "string" ? input.project.tone : null,
          contentRating: typeof input.project?.contentRating === "string" ? input.project.contentRating : null,
        });
        if (
          sfxEnrichment.combatSfxAdded > 0
          || sfxEnrichment.dialogueEnriched > 0
          || sfxEnrichment.narrativeContextAdded > 0
        ) {
          console.info(
            `[pipeline:v3:dialogue-sfx-enrichment] combatSfxAdded=${sfxEnrichment.combatSfxAdded} dialogueEnriched=${sfxEnrichment.dialogueEnriched} narrativeContextAdded=${sfxEnrichment.narrativeContextAdded}`,
          );
        }

        const narrativeVar = applyPanelNarrativeVariationToBlueprints(rebal.blueprints);
        if (narrativeVar.panelsAdjusted > 0) {
          console.info(`[pipeline:v3:narrative-variation] panelsAdjusted=${narrativeVar.panelsAdjusted}`);
        }

        // P2.11 — Le dialoguiste IA s'active automatiquement en mode premium,
        // ou explicitement via input.sceneDialogueEnrich.
        const enableDialoguist = input.sceneDialogueEnrich === true || input.premiumV3OnlyEnabled;
        const sceneDialogue = await enrichPremiumBlueprintsSceneDialogue({
          blueprints: rebal.blueprints,
          productionOutline: resolvedProductionOutline ?? null,
          chapterSummary: input.chapterSummary,
          chapterUserIntent: input.chapterUserIntent,
          characterNameById,
          projectGenre: typeof input.project?.primaryGenre === "string" ? input.project.primaryGenre : null,
          projectTone: typeof input.project?.tone === "string" ? input.project.tone : null,
          contentRating: typeof input.project?.contentRating === "string" ? input.project.contentRating : null,
          avoidDialogueSnippets: input.priorChapterDialogueSnippets ?? undefined,
          forceSceneDialogueEnrich: enableDialoguist,
        });
        if (sceneDialogue.linesWritten > 0 || sceneDialogue.warnings.length > 0) {
          console.info(
            `[pipeline:v3:scene-dialogue] beatsTouched=${sceneDialogue.beatsTouched} linesWritten=${sceneDialogue.linesWritten} warnings=${sceneDialogue.warnings.join(";") || "none"}`,
          );
        }

        ensureDialogueBeatsHaveAnchors({
          blueprints: rebal.blueprints,
          visualEntities,
          fallbackHeroId: castContract.heroCharacterId,
        });
        const dialogueQa = runDialogueQaOnBlueprints(rebal.blueprints);
        console.info(
          `[pipeline:v3:dialogue-qa] ok=${dialogueQa.ok} dialogueBeats=${dialogueQa.dialogueBeats} speakerPanels=${dialogueQa.speakerPanels} reactionPanels=${dialogueQa.reactionPanels} anchored=${dialogueQa.anchored} floating=${dialogueQa.floating}`,
        );

        timings.manga_rebalance_ms = Date.now() - mangaRebalanceStart;

        if (approvedPlanDriven && productionPlanForStoryboard) {
          productionPlanForStoryboard.panelBlueprints = rebal.blueprints;
        }
        if (panelBlueprintsForPremiumPath?.length) {
          panelBlueprintsForPremiumPath = rebal.blueprints;
        }

        const mangaQa = runMangaStructureQaOnBlueprints({
          blueprints: rebal.blueprints,
          maxCutawayRatio: mangaMaxCutawayRatio,
          minActorDrivenRatio: mangaMinActorDrivenRatio,
          visualEntities,
        });
        console.info(
          `[pipeline:v3:rhythm] maxConsecutiveCutaways=${mangaQa.maxConsecutiveCutaways}`,
        );
        console.info(
          `[pipeline:v3:manga-structure-qa] ok=${mangaQa.ok} cutawayRatio=${(mangaQa.cutawayRatio * 100).toFixed(1)}% ` +
            `actorDrivenRatio=${(mangaQa.actorDrivenRatio * 100).toFixed(1)}% maxConsecutiveCutaways=${mangaQa.maxConsecutiveCutaways}`,
        );
        if (!mangaQa.ok) {
          console.error(`[pipeline:v3:manga-structure-qa] failed reason=${mangaQa.summary}`);
          if (input.premiumV3OnlyEnabled) {
            throw new Error(`premium_v3_only_manga_structure_failed: ${mangaQa.summary}`);
          }
        }

        if (resolvedProductionOutline) {
          const narrativeQa = runNarrativeContractQa({
            blueprints: rebal.blueprints,
            outline: resolvedProductionOutline,
            chapterUserIntent: input.chapterUserIntent,
            chapterSummary: input.chapterSummary,
            chapterLocationName: input.chapterLocationName,
          });

          const requiredChars = narrativeQa.contracts.flatMap((c) => c.requiredCharacters);
          const requiredEntities = narrativeQa.contracts.flatMap((c) => c.requiredEntities);
          const locations = narrativeQa.contracts.map((c) => c.location).filter(Boolean);

          console.info(
            `[pipeline:v3:narrative-contract] beats=${narrativeQa.contracts.length} ` +
              `requiredCharacters=${[...new Set(requiredChars)].join(",")} ` +
              `requiredEntities=${[...new Set(requiredEntities)].join(",")} ` +
              `locations=${[...new Set(locations)].join(",")}`,
          );

          if (!narrativeQa.ok) {
            console.warn(
              `[pipeline:v3:narrative-contract] violations=${narrativeQa.violations.length} ` +
                `first=${narrativeQa.violations[0]?.type}:${narrativeQa.violations[0]?.expected}`,
            );
          }
        }
      }
    }

    if (approvedPlanDriven) {
      const storyboardBuildStart = Date.now();

      const productionPlanForArc = productionPlanForStoryboard ?? input.productionPlan;
      const storyArcFromPlan = buildStoryArcFromProductionPlan({
        productionPlan: productionPlanForArc as { panelBlueprints?: PanelBlueprintPremium[]; [key: string]: unknown },
        approvedOutline: resolvedProductionOutline,
        chapterId: input.chapterId,
        chapterNumber: input.chapterNumber,
        chapterTitle: input.chapterTitle,
        chapterSummary: input.chapterSummary,
        chapterUserIntent: input.chapterUserIntent,
        chapterGoal: resolvedProductionOutline?.chapterGoal,
        cliffhanger: resolvedProductionOutline?.cliffhanger,
      });

      console.info(
        `[pipeline:v3:story-arc-from-plan] beats=${storyArcFromPlan.beats.length} chapterGoal=${storyArcFromPlan.chapterGoal?.slice(0, 50)}...`,
      );

      const deterministicPlan = canonicalRuntimePlan
        ? buildStoryboardPlanFromCanonicalPlan({
            chapterId: input.chapterId,
            projectId: input.projectId,
            chapterNumber: input.chapterNumber,
            projectFormat,
            canonicalPlan: canonicalRuntimePlan,
            productionPlanShell: (productionPlanForStoryboard ?? input.productionPlan) as Record<
              string,
              unknown
            >,
            chapterLocationName: input.chapterLocationName,
            productionPlanPages: input.productionPlanPages,
          })
        : buildStoryboardPlanFromApprovedProductionPlan({
            chapterId: input.chapterId,
            projectId: input.projectId,
            chapterNumber: input.chapterNumber,
            productionPlan: (productionPlanForStoryboard ?? input.productionPlan) as Record<string, unknown>,
            projectFormat,
            chapterLocationName: input.chapterLocationName,
            productionPlanPages: input.productionPlanPages,
          });
      storyboardPassResult = {
        storyboardPlan: deterministicPlan,
        warnings: ["storyboard_plan.source=approved_production_plan_deterministic"],
        blockers: [],
      };
      console.info(
        `[pipeline:v3:storyboard] source=deterministic_approved_plan panels=${deterministicPlan.pages.flatMap((p) => p.panels).length}`,
      );

      timings.storyboard_build_ms = Date.now() - storyboardBuildStart;
    } else {
      const storyStart = Date.now();
      const locationsForStory = await resolveLocationsForStoryPass(input);
      const storyPassResult = await runStoryPass({
        chapterId: input.chapterId,
        chapterNumber: input.chapterNumber,
        title: input.chapterTitle,
        userIntent: input.chapterUserIntent,
        summary: input.chapterSummary,
        mainCharacters: input.rawCharacters.map((c) => ({
          id: c.id,
          name: c.name,
          roleType: c.roleType ?? null,
        })),
        locations: locationsForStory.map((l) => ({ id: l.id, name: l.name })),
      });
      timings.story_pass_ms = Date.now() - storyStart;
      storyArc = storyPassResult.storyArc;
      if (storyPassResult.warnings.length > 0) {
        console.warn(
          `[pipeline:v3:story] warnings=${storyPassResult.warnings.join(" | ")}`,
        );
      }

      const storyboardStart = Date.now();
      storyboardPassResult =
        panelBlueprintsForPremiumPath && panelBlueprintsForPremiumPath.length > 0
          ? {
              storyboardPlan: buildStoryboardPlanFromPremiumBlueprints({
                chapterId: input.chapterId,
                projectFormat,
                panelBlueprints: panelBlueprintsForPremiumPath,
                pages: input.productionPlanPages,
                chapterLocationName: input.chapterLocationName ?? null,
                locations: locationsForStory.map((l) => ({
                  id: l.id,
                  name: l.name,
                  visualDNA: l.visualDNA,
                })),
              }),
              warnings: ["storyboard_plan.source=premium_production_plan"],
              blockers: [],
            }
          : await runStoryboardPass({
              storyArc: storyPassResult.storyArc,
              heroCharacterIds: castContract.activeCharacterIds,
              projectFormat,
              targetPanelCount: PREMIUM_PANEL_RANGE.target,
            });
      timings.storyboard_pass_ms = Date.now() - storyboardStart;
    }
    await saveStoryboardPlan(input.chapterId, storyboardPassResult.storyboardPlan);
    console.info(
      `[pipeline:v3:storyboard] persisted storyboardPlanV2 chapterId=${input.chapterId} pages=${storyboardPassResult.storyboardPlan.pages.length} panels=${storyboardPassResult.storyboardPlan.pages.reduce((sum, p) => sum + p.panels.length, 0)}`,
    );

    if (storyboardPassResult.blockers.length > 0) {
      console.error(
        `[pipeline:v3:storyboard] blockers=${storyboardPassResult.blockers.join(" | ")}`,
      );
      if (input.premiumV3OnlyEnabled) {
        throw new Error(
          `premium_v3_only_storyboard_blockers: ${storyboardPassResult.blockers.join(" | ")}`,
        );
      }
    }
    if (storyboardPassResult.warnings.length > 0) {
      console.warn(
        `[pipeline:v3:storyboard] warnings=${storyboardPassResult.warnings.join(" | ")}`,
      );
    }

    const pageQa = await runPageQaPass(storyboardPassResult.storyboardPlan);
    timings.page_qa_ms = Date.now() - pipelineStartMs;
    console.log(
      `[pipeline:v3:page-qa] ok=${pageQa.okCount} fail=${pageQa.failCount}`,
    );

    // P0.4 — Fail hard si des pages échouent au QA
    if (pageQa.failCount > 0) {
      const issues = pageQa.results
        .filter((r) => !r.ok)
        .slice(0, 5)
        .map((r) => `page=${r.pageNumber}:${r.issues.join(",")}`)
        .join(" | ");

      console.error(
        `[pipeline:v3:page-qa] page_qa_failed chapterId=${input.chapterId} failCount=${pageQa.failCount} issues=${issues}`,
      );

      if (input.premiumV3OnlyEnabled) {
        throw new Error(`premium_v3_only_page_qa_failed: ${pageQa.failCount} pages failed [${issues}]`);
      }
    }

    // ─── QA passes additionnelles (P3.14, P3.15, P3.16) ────────────────────────
    const storyboardPanels = storyboardPassResult.storyboardPlan.pages.flatMap((p) => p.panels) ?? [];
    const beatIdsFromPlan = resolvedProductionOutline?.beats?.map((b: { beatId?: string }) => b.beatId).filter(Boolean) as string[] ?? [];

    // P3.14 — Beat Coverage QA
    const beatCoverageQa = runBeatCoverageQaPass({
      expectedBeatIds: beatIdsFromPlan,
      panels: storyboardPanels.map((p: { panelId: string; sourceBeatId?: string; beatId?: string }) => ({
        panelId: p.panelId,
        sourceBeatId: p.sourceBeatId,
        beatId: p.beatId,
      })),
      strictMode: input.premiumV3OnlyEnabled ?? false,
    });
    console.log(`[pipeline:v3:beat-coverage-qa] ${formatBeatCoverageQaLog(beatCoverageQa)}`);
    if (!beatCoverageQa.ok && input.premiumV3OnlyEnabled) {
      console.error(`[pipeline:v3:beat-coverage-qa] BLOCKED — uncovered beats detected`);
    }

    // P3.15 — Emotional Arc QA (si arc émotionnel disponible)
    const emotionalArcSteps = storyArc?.beats?.map((b, idx: number) => ({
      stepId: b.beatId,
      label: b.emotionalTurn ?? `Step ${idx + 1}`,
      intensity: 50 + (b.dangerLevel === "critical" ? 30 : b.dangerLevel === "high" ? 20 : b.dangerLevel === "medium" ? 10 : 0),
      beatIds: [b.beatId],
    })) ?? [];

    if (emotionalArcSteps.length > 0) {
      const emotionalArcQa = runEmotionalArcQaPass({
        expectedArc: emotionalArcSteps,
        panels: storyboardPanels.map((p: { panelId: string; beatId?: string; emotionLine?: string; emotionalTone?: string }) => ({
          panelId: p.panelId,
          beatId: p.beatId,
          emotionLine: p.emotionLine,
          emotionalTone: p.emotionalTone,
        })),
        strictMode: false,
      });
      console.log(`[pipeline:v3:emotional-arc-qa] ${formatEmotionalArcQaLog(emotionalArcQa)}`);
    }

    // P3.16 — Interaction QA
    const interactionQa = runInteractionQaPass({
      panels: storyboardPanels.map((p: { panelId: string; renderMode?: string; visibleCharacterIds?: string[]; dialogueLines?: Array<{ speaker?: string; text: string }>; actionLine?: string; shotType?: string }) => ({
        panelId: p.panelId,
        renderMode: p.renderMode,
        visibleCharacterIds: p.visibleCharacterIds,
        dialogueLines: p.dialogueLines,
        actionLine: p.actionLine,
        shotType: p.shotType,
      })),
      strictMode: false,
    });
    console.log(`[pipeline:v3:interaction-qa] ${formatInteractionQaLog(interactionQa)}`);

    // P1.9 — Coverage brut puis contrat visuel nettoyé (outline + canon, pas de pollution seule)
    const rawCoverage = storyArc
      ? extractRequiredVisualCoverage(storyArc)
      : approvedPlanDriven && input.productionPlan?.panelBlueprints
        ? extractRequiredVisualCoverageFromProductionPlan(
            input.productionPlan.panelBlueprints as Array<{
              panelId: string;
              beatId: string;
              requiredCharacterIds?: string[];
              mustShowCharacterIds?: string[];
              requiredProps?: Array<{ canonicalName: string }>;
              mustShowEnemy?: boolean;
              requiredEnemyIds?: string[];
              requiredLocationSignals?: string[];
              subjectFocus?: string;
              cutawayType?: string;
              purpose?: string;
            }>,
          )
        : [];

    const knownLocsForSanitize =
      Array.isArray(input.locations) && input.locations.length > 0
        ? input.locations
        : await resolveLocationsForStoryPass(input);

    const outlineText = buildOutlineTextForSanitizer({
      approvedOutline: input.approvedOutline ?? undefined,
      productionOutline: resolvedProductionOutline ?? undefined,
      chapterSummary: input.chapterSummary,
      chapterUserIntent: input.chapterUserIntent,
    });

    const storyBibleSummary =
      input.project?.storyBible && typeof input.project.storyBible === "object"
        ? (() => {
            const s = (input.project.storyBible as Record<string, unknown>).summary;
            return typeof s === "string" ? s.slice(0, 4000) : null;
          })()
        : null;

    const chapterVisualContractResult = await extractChapterVisualContract({
      chapterId: input.chapterId,
      chapterTitle: input.chapterTitle,
      chapterSummary: input.chapterSummary,
      chapterUserIntent: input.chapterUserIntent,
      productionOutline: resolvedProductionOutline,
      knownCharacters: input.rawCharacters,
      knownLocations: knownLocsForSanitize,
      projectGenre: typeof input.project?.primaryGenre === "string" ? input.project.primaryGenre : null,
      projectTone: typeof input.project?.tone === "string" ? input.project.tone : null,
      storyBibleSummary,
    });
    if (chapterVisualContractResult.warnings.length > 0) {
      console.warn(
        `[pipeline:v3:chapter-visual-contract] ${chapterVisualContractResult.warnings.join(" | ")}`,
      );
    }
    console.log(
      `[pipeline:v3:chapter-visual-contract] openai=${chapterVisualContractResult.usedOpenAI} ` +
        `requiredSlices=${chapterVisualContractResult.requiredFromContract.length} ` +
        `props=${chapterVisualContractResult.contract.props.length} ` +
        `species=${chapterVisualContractResult.contract.species.length} ` +
        `robots=${chapterVisualContractResult.contract.robots.length} ` +
        `hybrids=${chapterVisualContractResult.contract.hybrids.length} ` +
        `creatures=${chapterVisualContractResult.contract.creatures.length} ` +
        `needsClarification=${Boolean(chapterVisualContractResult.contract.needsClarification)}`,
    );

    try {
      await saveChapterVisualContractSnapshot(input.chapterId, {
        usedOpenAI: chapterVisualContractResult.usedOpenAI,
        warnings: chapterVisualContractResult.warnings,
        contract: chapterVisualContractResult.contract,
        requiredFromContractCount: chapterVisualContractResult.requiredFromContract.length,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[pipeline:v3:chapter-visual-contract] persist_failed chapterId=${input.chapterId} ${msg}`);
    }

    const visualContractUi = await loadChapterVisualContractUi(input.chapterId);
    const parasitePolicy = visualContractUi.parasitePolicy ?? "auto_strip";
    const contractHasRequiredSlices = chapterVisualContractResult.requiredFromContract.length > 0;

    const contractSanitized = contractHasRequiredSlices
      ? sanitizeVisualContractBeforeCoverage({
          requiredCoverage: chapterVisualContractResult.requiredFromContract,
          outlineText,
          canonicalPlan: canonicalRuntimePlan,
          knownCharacters: input.rawCharacters,
          knownLocations: knownLocsForSanitize,
          projectGenre: typeof input.project?.primaryGenre === "string" ? input.project.primaryGenre : null,
          projectTone: typeof input.project?.tone === "string" ? input.project.tone : null,
          parasitePolicy: "keep_all",
        })
      : { requiredConfirmed: [], optional: [], suspicious: [], rejected: [] };

    const blueprintSanitized = sanitizeVisualContractBeforeCoverage({
      requiredCoverage: rawCoverage,
      outlineText,
      canonicalPlan: canonicalRuntimePlan,
      knownCharacters: input.rawCharacters,
      knownLocations: knownLocsForSanitize,
      projectGenre: typeof input.project?.primaryGenre === "string" ? input.project.primaryGenre : null,
      projectTone: typeof input.project?.tone === "string" ? input.project.tone : null,
      parasitePolicy,
    });

    let requiredCoverage;
    if (contractHasRequiredSlices) {
      if (parasitePolicy === "keep_all") {
        const blueprintMerged = [
          ...blueprintSanitized.requiredConfirmed,
          ...blueprintSanitized.suspicious,
        ];
        requiredCoverage = mergeRequiredVisualCoverageWithContract(
          contractSanitized.requiredConfirmed,
          blueprintMerged,
        );
      } else {
        requiredCoverage = contractSanitized.requiredConfirmed;
      }
    } else {
      requiredCoverage = blueprintSanitized.requiredConfirmed;
    }

    console.log(
      "[pipeline:v3:visual-contract] contract_confirmed=%d blueprint_confirmed=%d optional=%d suspicious=%d rejected=%d parasitePolicy=%s contract_only=%s",
      contractSanitized.requiredConfirmed.length,
      blueprintSanitized.requiredConfirmed.length,
      blueprintSanitized.optional.length,
      blueprintSanitized.suspicious.length,
      blueprintSanitized.rejected.length,
      parasitePolicy,
      String(contractHasRequiredSlices && parasitePolicy !== "keep_all"),
    );

    let coverageReport = validateVisualCoverage(
      requiredCoverage,
      storyboardPassResult.storyboardPlan,
    );
    let visualCoverageStatus: "ok" | "soft_gaps" = "ok";

    const coverageSource = contractHasRequiredSlices
      ? parasitePolicy === "keep_all"
        ? "chapter_visual_contract+blueprint_merged"
        : "chapter_visual_contract_only"
      : storyArc
        ? "storyArc"
        : approvedPlanDriven
          ? "productionPlan"
          : "none";
    console.log(
      `[pipeline:v3:visual-coverage] required=${requiredCoverage.length} fulfilled=${coverageReport.fulfilled.length} gaps=${coverageReport.gaps.length} source=${coverageSource} (raw_blueprint_slices=${rawCoverage.length})`,
    );

    const gapClassificationContext = buildVisualCoverageGapClassificationContext({
      outlineText,
      canonicalPlan: canonicalRuntimePlan,
      rawCharacters: input.rawCharacters,
      focusCharacterIds: castContract.activeCharacterIds,
      heroCharacterId: castContract.heroCharacterId,
      contractMainLocationName: chapterVisualContractResult.contract.mainLocation?.name ?? null,
    });
    const firstClass = classifyVisualCoverageGaps(coverageReport.gaps, gapClassificationContext);

    if (firstClass.repairableGaps.length > 0) {
      storyboardPassResult = {
        ...storyboardPassResult,
        storyboardPlan: repairStoryboardVisualCoverage({
          storyboardPlan: storyboardPassResult.storyboardPlan,
          gaps: firstClass.repairableGaps,
          productionPlan: input.productionPlan,
          canonicalPlan: canonicalRuntimePlan,
        }),
      };
      await saveStoryboardPlan(input.chapterId, storyboardPassResult.storyboardPlan);
      coverageReport = validateVisualCoverage(
        requiredCoverage,
        storyboardPassResult.storyboardPlan,
      );
      console.log(
        `[pipeline:v3:visual-coverage] after_repair gaps=${coverageReport.gaps.length} repairable_applied=${firstClass.repairableGaps.length}`,
      );
    }

    const remaining = classifyVisualCoverageGaps(coverageReport.gaps, gapClassificationContext);

    if (remaining.rejectedGaps.length > 0) {
      console.warn("[pipeline:v3:visual-coverage] rejected gaps (ignored)", {
        gaps: remaining.rejectedGaps.map(
          (g) => `${g.coverage.entityType}:${g.coverage.entity}@${g.coverage.sourceBeatId}`,
        ),
      });
    }

    if (remaining.fatalGaps.length > 0) {
      const gapSummary = remaining.fatalGaps
        .slice(0, 8)
        .map((g) => `${g.coverage.entityType}:${g.coverage.entity}@${g.coverage.sourceBeatId}`)
        .join(" | ");
      console.error(
        `[pipeline:v3:visual-coverage] fatal_gaps=${remaining.fatalGaps.length} ${gapSummary}`,
      );
      if (input.premiumV3OnlyEnabled) {
        throw new Error(
          `premium_v3_only_visual_coverage_fatal_gaps: ${remaining.fatalGaps.length} critical entities uncovered [${gapSummary}]`,
        );
      }
    }

    if (remaining.repairableGaps.length > 0 || remaining.softGaps.length > 0) {
      console.warn("[pipeline:v3:visual-coverage] soft gaps after repair", {
        gaps: [...remaining.repairableGaps, ...remaining.softGaps].map(
          (g) => `${g.coverage.entityType}:${g.coverage.entity}@${g.coverage.sourceBeatId}`,
        ),
      });
      visualCoverageStatus = "soft_gaps";
    }

    if (visualCoverageStatus !== "ok") {
      console.info(`[pipeline:v3:visual-coverage] status=${visualCoverageStatus}`);
    }
    // P1.10 — Valider le cutaway ratio (max 35% sauf chapitre expérimental)
    const allPanels = storyboardPassResult.storyboardPlan.pages.flatMap((p) => p.panels);
    const cutawayPanels = allPanels.filter(
      (panel) =>
        panel.cutawayType !== "none" ||
        panel.subjectFocus === "environment" ||
        panel.subjectFocus === "prop" ||
        panel.renderMode === "establishing_environment" ||
        panel.renderMode === "insert_object" ||
        panel.renderMode === "surveillance_reveal",
    );
    const cutawayRatio = allPanels.length > 0 ? cutawayPanels.length / allPanels.length : 0;
    const maxCutawayRatio = PRODUCTION_RULES.cutaway.maxRatio;

    console.log(
      `[pipeline:v3:cutaway-ratio] count=${cutawayPanels.length}/${allPanels.length} ratio=${(cutawayRatio * 100).toFixed(1)}% max=${(maxCutawayRatio * 100).toFixed(0)}%`,
    );

    if (cutawayRatio > maxCutawayRatio && input.premiumV3OnlyEnabled) {
      console.error(
        `[pipeline:v3:cutaway-ratio] exceeded chapterId=${input.chapterId} ratio=${(cutawayRatio * 100).toFixed(1)}%`,
      );
      throw new Error(
        `premium_v3_only_cutaway_ratio_exceeded: ${(cutawayRatio * 100).toFixed(1)}% > ${(maxCutawayRatio * 100).toFixed(0)}% — trop de cutaways, pas assez de personnages/action`,
      );
    }

    try {
      const memoryStart = Date.now();
      // P0.2 + P0.6 — Passer heroCharacterId et temporaryLocations à la visual memory
      const visualMemoryResult = await loadChapterVisualMemory({
        chapterId: input.chapterId,
        projectId: input.projectId,
        heroCharacterId: castContract.heroCharacterId,
        mainCharacterIds: castContract.activeCharacterIds,
        temporaryLocations: canonResolverResult.contract.temporaryLocations.map((loc) => ({
          id: loc.id,
          label: loc.label,
          visualDescription: loc.visualDescription,
          confidence: loc.matchConfidence,
          source: "canon_resolver",
        })),
      });
      timings.visual_memory_ms = Date.now() - memoryStart;
      if (visualMemoryResult.warnings.length > 0) {
        console.warn(
          `[pipeline:v3:visual-memory] warnings=${visualMemoryResult.warnings.slice(0, 5).join(" | ")}`,
        );
      }
      console.log(
        `[pipeline:v3:visual-memory] chars=${visualMemoryResult.stats.charactersLoaded} missing_face=${visualMemoryResult.stats.charactersMissingFaceRef} env=${visualMemoryResult.stats.environmentsLoaded} style=${visualMemoryResult.stats.styleRefsLoaded}`,
      );

      // P0.5 — Appliquer les fallbacks pour les identités personnages manquantes
      // Downgrade les closeups si pas de face ref (plutôt que bloquer)
      const allPanelsBeforeFallback = storyboardPassResult.storyboardPlan.pages.flatMap((p) => p.panels);
      const identityFallbackResult = runCharacterIdentityFallback({
        memory: visualMemoryResult.memory,
        panels: allPanelsBeforeFallback,
        generateIdentitySeeds: false, // Pour l'instant, on downgrade plutôt que générer
      });
      if (identityFallbackResult.warnings.length > 0) {
        console.warn(
          `[pipeline:v3:identity-fallback] warnings=${identityFallbackResult.warnings.slice(0, 3).join(" | ")}`,
        );
      }

      // P0.1 — Vérifier que la visual memory contient au moins un environnement
      // En mode premium, c'est BLOQUANT - on refuse de continuer vers le render
      if (visualMemoryResult.stats.environmentsLoaded === 0) {
        console.warn(
          `[pipeline:v3:visual-memory] env_missing — aucun environnement chargé, le render risque d'être générique`,
        );
        if (input.premiumV3OnlyEnabled) {
          throw new Error(
            "E_VISUAL_MEMORY_ENV_REQUIRED: env>=1 required in premium mode. " +
              "Assurez-vous qu'au moins un lieu est défini dans le projet ou détecté automatiquement.",
          );
        }
      }

      const mainCharacterNames = input.rawCharacters
        .filter((c) => castContract.activeCharacterIds.includes(c.id))
        .map((c) => c.name);

      // P0.3 — Injecter environmentAnchorId dans tous les panels
      const primaryEnvAnchorId = extractPrimaryEnvironmentAnchorId(
        enrichedLocations,
        canonResolverResult.contract.temporaryLocations,
      );
      const allStoryboardPanels = storyboardPassResult.storyboardPlan.pages.flatMap((p) => p.panels);
      const envAnchorResult = runEnvironmentAnchorPass({
        panels: allStoryboardPanels,
        primaryEnvironmentAnchorId: primaryEnvAnchorId,
      });
      if (envAnchorResult.missing > 0 && input.premiumV3OnlyEnabled) {
        throw new Error(
          `E_ENVIRONMENT_ANCHOR_MISSING: ${envAnchorResult.missing} panels without environment anchor`,
        );
      }

      // P0.4 — Corriger les contradictions renderMode (character_focus + wide establishing)
      runRenderModeNormalizer({
        panels: allStoryboardPanels,
      });

      runPreRenderPremiumQaOrThrow({
        storyboardPlan: storyboardPassResult.storyboardPlan,
        chapterSummary: input.chapterSummary,
        chapterUserIntent: input.chapterUserIntent,
        chapterLocationName: input.chapterLocationName,
        mainCharacterNames,
      });
      await saveStoryboardPlan(input.chapterId, storyboardPassResult.storyboardPlan);

      const renderFalEnabled = isPipelineV3RenderFalEnabled();
      console.log(
        `[pipeline:v3:render] fal_real_enabled=${renderFalEnabled} (flag PIPELINE_V3_RENDER_FAL)`,
      );
      const renderStart = Date.now();
      const renderPassResult = await runRenderPass({
        chapterId: input.chapterId,
        storyboardPlan: storyboardPassResult.storyboardPlan,
        visualQaProductionConfigIncomplete: visualQaProductionConfigSkipped,
        canonicalProductionPlan: canonicalRuntimePlan,
        styleBible: buildStyleBibleFromUserProject({
          project: input.project,
          stylePacks: input.stylePacks,
        }),
        visualMemory: visualMemoryResult.memory,
        characters: input.rawCharacters.map((c) => ({
          id: c.id,
          name: c.name,
          roleType: c.roleType ?? null,
          hairColor: c.hairColor ?? null,
          eyeColor: c.eyeColor ?? null,
          canonSignatureText: c.canonSignatureText ?? null,
          forbiddenVisualDrift: c.forbiddenVisualDrift ?? [],
        })),
        mainCharacterIds: castContract.activeCharacterIds,
        generatePanelImage: renderFalEnabled
          ? createDefaultPanelImageGenerator({
              forbidMock:
                process.env.NODE_ENV === "production" || Boolean(input.premiumV3OnlyEnabled),
            })
          : undefined,
        persistToDb: renderFalEnabled,
      });
      timings.render_pass_ms = Date.now() - renderStart;
      console.log(
        `[pipeline:v3:render] total=${renderPassResult.summary.totalPanels} specs=${renderPassResult.specs.length} failed=${renderPassResult.summary.failedCount} visual_qa_failed=${renderPassResult.summary.visualQaFailedCount} manual_review=${renderPassResult.summary.manualReviewRequiredCount} quality=${renderPassResult.summary.v3RenderQualityStatus} panel_qa_ok=${renderPassResult.panelQa.okCount}/${renderPassResult.panelQa.okCount + renderPassResult.panelQa.failCount}`,
      );
      if (renderPassResult.summary.warnings.length > 0) {
        console.warn(
          `[pipeline:v3:render] warnings=${renderPassResult.summary.warnings.slice(0, 5).join(" | ")}`,
        );
      }

      // P1.7 — Props QA pass : détection des props fantômes dans les render specs
      const propsQa = runPropsQaPass({
        specs: renderPassResult.specs,
        storyContract,
        strictMode: false,
      });
      console.log(`[pipeline:v3:props-qa] ${formatPropsQaLog(propsQa)}`);
      if (!propsQa.ok) {
        console.warn(
          `[pipeline:v3:props-qa] phantom_props_detected errorCount=${propsQa.errorCount} warningCount=${propsQa.warningCount}`,
        );
      }

      const renderedCount = renderPassResult.summary.renderedCount;
      const skippedCount = renderPassResult.summary.skippedCount;
      const visualQaFailedCount = renderPassResult.summary.visualQaFailedCount;
      const manualReviewRequiredCount = renderPassResult.summary.manualReviewRequiredCount;
      const deferredReviewFromConfig =
        renderPassResult.summary.visualQaProductionConfigIncomplete === true
        && process.env.PREMIUM_VISUAL_QA_REQUIRED === "false";
      const qualityAcceptable =
        renderPassResult.summary.v3RenderQualityStatus === "passed" || deferredReviewFromConfig;

      v3RenderSucceeded =
        renderPassResult.summary.failedCount === 0 &&
        visualQaFailedCount === 0 &&
        manualReviewRequiredCount === 0 &&
        qualityAcceptable &&
        renderPassResult.specs.length === renderPassResult.summary.totalPanels &&
        renderPassResult.summary.totalPanels > 0 &&
        renderedCount > 0 &&
        skippedCount === 0;
      if (!v3RenderSucceeded) {
        console.warn(
          `[pipeline:v3:render] v3_succeeded=false rendered=${renderedCount} skipped=${skippedCount} failed=${renderPassResult.summary.failedCount} visual_qa_failed=${visualQaFailedCount} manual_review=${manualReviewRequiredCount} quality=${renderPassResult.summary.v3RenderQualityStatus} specs=${renderPassResult.specs.length}/${renderPassResult.summary.totalPanels} — legacy image-gen will still run (unless PREMIUM_ONLY=true which would then fail-hard)`,
        );
        if (input.premiumV3OnlyEnabled) {
          throw new Error(
            `premium_v3_only_render_incomplete: rendered=${renderedCount} skipped=${skippedCount} failed=${renderPassResult.summary.failedCount} visual_qa_failed=${visualQaFailedCount} manual_review=${manualReviewRequiredCount} specs=${renderPassResult.specs.length}/${renderPassResult.summary.totalPanels}`,
          );
        }
      }
    } catch (renderErr) {
      const renderMsg = renderErr instanceof Error ? renderErr.message : String(renderErr);
      console.error(
        `[pipeline:v3:render] shadow_render_failed chapterId=${input.chapterId} error=${renderMsg}`,
      );
      if (input.premiumV3OnlyEnabled) {
        throw new Error(`premium_v3_only_render_failed: ${renderMsg}`);
      }
    }
  } catch (v3Err) {
    const v3Msg = v3Err instanceof Error ? v3Err.message : String(v3Err);
    console.error(
      `[pipeline:v3] shadow_mode_failed chapterId=${input.chapterId} error=${v3Msg}`,
    );
    if (input.premiumV3OnlyEnabled) {
      throw new Error(`premium_v3_only_failed: ${v3Msg}`);
    }
  }

  timings.total_ms = Date.now() - pipelineStartMs;
  const timingReport = Object.entries(timings)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.info(
    `[pipeline:v3:report] chapterId=${input.chapterId} v3RenderSucceeded=${v3RenderSucceeded} ${timingReport}`,
  );

  return { v3RenderSucceeded };
}
