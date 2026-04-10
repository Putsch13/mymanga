import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma, Prisma } from "../src/index";

type PhaseName = "media-assets" | "character-locks" | "scene-keyframes" | "fal-traces";

type CliOptions = {
  dryRun: boolean;
  limit: number | null;
  onlyProject: string | null;
  stateFile: string;
  resume: boolean;
  reconcile: boolean;
  phases: PhaseName[] | null;
};

type PhaseSummary = {
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
  wouldCreate: number;
  wouldUpdate: number;
  warnings: number;
  errors: number;
};

type BackfillState = {
  version: 1;
  updatedAt: string;
  options: {
    onlyProject: string | null;
    limit: number | null;
  };
  phases: Record<
    PhaseName,
    {
      lastCursor: string | null;
      completed: boolean;
      summary: PhaseSummary;
    }
  >;
};

const STATE_VERSION = 1;
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STATE_FILE = path.resolve(SCRIPT_DIRECTORY, ".backfill-hard-switch.state.json");
const DEFAULT_BATCH_SIZE = 50;

function compact(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => typeof part === "string" && part.trim().length > 0);
}

function emptySummary(): PhaseSummary {
  return {
    scanned: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    wouldCreate: 0,
    wouldUpdate: 0,
    warnings: 0,
    errors: 0,
  };
}

function initialState(options: CliOptions): BackfillState {
  return {
    version: STATE_VERSION,
    updatedAt: new Date().toISOString(),
    options: {
      onlyProject: options.onlyProject,
      limit: options.limit,
    },
    phases: {
      "media-assets": { lastCursor: null, completed: false, summary: emptySummary() },
      "character-locks": { lastCursor: null, completed: false, summary: emptySummary() },
      "scene-keyframes": { lastCursor: null, completed: false, summary: emptySummary() },
      "fal-traces": { lastCursor: null, completed: false, summary: emptySummary() },
    },
  };
}

function parseArgs(argv: string[]): CliOptions {
  let dryRun = false;
  let limit: number | null = null;
  let onlyProject: string | null = null;
  let stateFile = DEFAULT_STATE_FILE;
  let resume = false;
  let reconcile = false;
  let phases: PhaseName[] | null = null;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--resume") {
      resume = true;
      continue;
    }
    if (arg === "--reconcile") {
      reconcile = true;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const value = Number(arg.slice("--limit=".length));
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`Invalid --limit value: ${arg}`);
      }
      limit = value;
      continue;
    }
    if (arg.startsWith("--only-project=")) {
      onlyProject = arg.slice("--only-project=".length).trim() || null;
      continue;
    }
    if (arg.startsWith("--state-file=")) {
      stateFile = path.resolve(process.cwd(), arg.slice("--state-file=".length));
      continue;
    }
    if (arg.startsWith("--phase=")) {
      const rawValue = arg.slice("--phase=".length).trim();
      const parsedPhases = rawValue
        .split(",")
        .map((value) => value.trim())
        .filter((value): value is PhaseName =>
          value === "media-assets" ||
          value === "character-locks" ||
          value === "scene-keyframes" ||
          value === "fal-traces",
        );
      if (parsedPhases.length === 0) {
        throw new Error(`Invalid --phase value: ${arg}`);
      }
      phases = parsedPhases;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { dryRun, limit, onlyProject, stateFile, resume, reconcile, phases };
}

async function ensureParentDirectory(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function loadState(options: CliOptions): Promise<BackfillState> {
  if (!options.resume) {
    return initialState(options);
  }

  try {
    const raw = await fs.readFile(options.stateFile, "utf8");
    const parsed = JSON.parse(raw) as BackfillState;
    if (parsed.version !== STATE_VERSION) {
      throw new Error(`Unsupported state version ${parsed.version}`);
    }
    if (parsed.options.onlyProject !== options.onlyProject || parsed.options.limit !== options.limit) {
      throw new Error("State file options mismatch. Use the same --only-project and --limit when resuming.");
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Cannot resume: state file not found at ${options.stateFile}`);
    }
    throw error;
  }
}

async function persistState(state: BackfillState, options: CliOptions) {
  state.updatedAt = new Date().toISOString();
  await ensureParentDirectory(options.stateFile);
  await fs.writeFile(options.stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function logEvent(phase: PhaseName, message: string, details?: Record<string, unknown>) {
  const prefix = `[backfill-hard-switch][${phase}]`;
  if (details) {
    console.log(`${prefix} ${message}`, JSON.stringify(details));
    return;
  }
  console.log(`${prefix} ${message}`);
}

function extractMetadataObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function extractStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function modeFromReferences(referenceImageIds: unknown): "img2img" | "text2img" {
  return Array.isArray(referenceImageIds) && referenceImageIds.length > 0 ? "img2img" : "text2img";
}

function computeNextCharacterLockVersion(existingVersions: number[]): number {
  const maxVersion = existingVersions.reduce((max, version) => Math.max(max, version), 0);
  return maxVersion + 1;
}

export function scannedThisInvocation(totalScanned: number, scannedAtInvocationStart: number): number {
  return Math.max(0, totalScanned - scannedAtInvocationStart);
}

export function remainingTake(limit: number | null, scannedAtInvocationStart: number, totalScanned: number): number {
  const processedThisInvocation = scannedThisInvocation(totalScanned, scannedAtInvocationStart);
  if (limit == null) {
    return DEFAULT_BATCH_SIZE;
  }
  return Math.max(0, Math.min(DEFAULT_BATCH_SIZE, limit - processedThisInvocation));
}

function shouldRunPhase(options: CliOptions, phase: PhaseName) {
  return options.phases == null || options.phases.includes(phase);
}

async function countRemainingPhaseItems(phase: PhaseName, options: CliOptions): Promise<number> {
  switch (phase) {
    case "media-assets":
      return prisma.characterVisualRef.count({
        where: {
          mediaAssetId: null,
          character: options.onlyProject ? { projectId: options.onlyProject } : undefined,
        },
      });
    case "character-locks":
      return prisma.character.count({
        where: {
          projectId: options.onlyProject ?? undefined,
          visualLocks: { none: { isActive: true } },
          visualRefs: { some: {} },
        },
      });
    case "scene-keyframes":
      return prisma.chapterScene.count({
        where: {
          chapter: options.onlyProject ? { projectId: options.onlyProject } : undefined,
          OR: [{ keyframes: { none: {} } }, { images: { some: { sceneKeyframeId: null } } }],
        },
      });
    case "fal-traces":
      return prisma.sceneImage.count({
        where: {
          status: "completed",
          falTraces: { none: {} },
          scene: options.onlyProject ? { chapter: { projectId: options.onlyProject } } : undefined,
        },
      });
  }
}

async function preparePhaseRun(phase: PhaseName, options: CliOptions, state: BackfillState) {
  const phaseState = state.phases[phase];
  if (!shouldRunPhase(options, phase)) {
    logEvent(phase, "phase not selected, skipping");
    return false;
  }

  if (options.reconcile) {
    const remaining = await countRemainingPhaseItems(phase, options);
    if (remaining > 0) {
      const previousCursor = phaseState.lastCursor;
      phaseState.lastCursor = null;
      if (phaseState.completed) {
        phaseState.completed = false;
      }
      logEvent(phase, "reconciled phase state against live DB", {
        remaining,
        previousCursor,
        cumulativeScanned: phaseState.summary.scanned,
      });
      await persistState(state, options);
    }
  }

  if (phaseState.completed) {
    logEvent(phase, "already completed, skipping");
    return false;
  }

  return true;
}

async function finalizePhaseRun(phase: PhaseName, exhausted: boolean, options: CliOptions, state: BackfillState) {
  const remaining = await countRemainingPhaseItems(phase, options);
  state.phases[phase].completed = exhausted && remaining === 0;
  if (exhausted && remaining > 0) {
    logEvent(phase, "phase appeared exhausted but remaining items still exist", {
      remaining,
      lastCursor: state.phases[phase].lastCursor,
    });
  }
  await persistState(state, options);
}

function buildPaginationArgs(options: CliOptions, lastCursor: string | null) {
  if (!options.dryRun || !lastCursor) {
    return {};
  }
  return { cursor: { id: lastCursor }, skip: 1 } as const;
}

async function runMediaAssetsPhase(options: CliOptions, state: BackfillState) {
  const phase: PhaseName = "media-assets";
  const phaseState = state.phases[phase];
  if (!(await preparePhaseRun(phase, options, state))) {
    return;
  }

  const scannedAtInvocationStart = phaseState.summary.scanned;
  let exhausted = false;
  while (true) {
    const take = remainingTake(options.limit, scannedAtInvocationStart, phaseState.summary.scanned);
    if (take === 0) {
      logEvent(phase, "limit reached before exhaustion", {
        limitPerPhase: options.limit,
        processedThisInvocation: scannedThisInvocation(phaseState.summary.scanned, scannedAtInvocationStart),
        cumulativeScanned: phaseState.summary.scanned,
      });
      await persistState(state, options);
      return;
    }

    const refs = await prisma.characterVisualRef.findMany({
      where: {
        mediaAssetId: null,
        character: options.onlyProject ? { projectId: options.onlyProject } : undefined,
      },
      include: { character: true },
      orderBy: { id: "asc" },
      take,
      ...buildPaginationArgs(options, phaseState.lastCursor),
    });

    if (refs.length === 0) {
      exhausted = true;
      break;
    }

    for (const ref of refs) {
      phaseState.summary.scanned += 1;
      phaseState.lastCursor = ref.id;

      const existingAssets = await prisma.mediaAsset.findMany({
        where: {
          projectId: ref.character.projectId,
          type: "character_ref",
          ownerType: "character_visual_ref",
          ownerId: ref.id,
        },
        orderBy: { createdAt: "asc" },
        take: 2,
      });
      const existingAsset = existingAssets[0] ?? null;

      const details = {
        refId: ref.id,
        characterId: ref.characterId,
        projectId: ref.character.projectId,
        hasExistingAsset: Boolean(existingAsset),
        matchingAssetCount: existingAssets.length,
      };

      try {
        if (existingAssets.length > 1) {
          phaseState.summary.warnings += 1;
          logEvent(phase, "multiple candidate assets found, using oldest match", details);
        }
        if (existingAsset) {
          if (ref.mediaAssetId !== existingAsset.id) {
            if (options.dryRun) {
              phaseState.summary.wouldUpdate += 1;
              logEvent(phase, "would link existing media asset", details);
            } else {
              await prisma.characterVisualRef.update({
                where: { id: ref.id },
                data: { mediaAssetId: existingAsset.id },
              });
              phaseState.summary.updated += 1;
              logEvent(phase, "linked existing media asset", { ...details, mediaAssetId: existingAsset.id });
            }
          } else {
            phaseState.summary.skipped += 1;
            logEvent(phase, "already linked, skipping", details);
          }
        } else if (options.dryRun) {
          phaseState.summary.wouldCreate += 1;
          phaseState.summary.wouldUpdate += 1;
          logEvent(phase, "would create media asset and link ref", details);
        } else {
          const asset = await prisma.mediaAsset.create({
            data: {
              projectId: ref.character.projectId,
              characterId: ref.characterId,
              type: "character_ref",
              origin: "generated",
              ownerType: "character_visual_ref",
              ownerId: ref.id,
              storageProvider: "supabase",
              publicUrl: ref.imageUrl,
              metadata: {
                backfilled: true,
                sourceRefId: ref.id,
                refType: ref.type,
              } as Prisma.InputJsonValue,
            },
          });
          await prisma.characterVisualRef.update({
            where: { id: ref.id },
            data: { mediaAssetId: asset.id },
          });
          phaseState.summary.created += 1;
          phaseState.summary.updated += 1;
          logEvent(phase, "created media asset and linked ref", { ...details, mediaAssetId: asset.id });
        }
      } catch (error) {
        phaseState.summary.errors += 1;
        console.error(`[backfill-hard-switch][${phase}] failed`, { ...details, error });
        throw error;
      } finally {
        await persistState(state, options);
      }
    }
  }

  await finalizePhaseRun(phase, exhausted, options, state);
}

async function runCharacterLocksPhase(options: CliOptions, state: BackfillState) {
  const phase: PhaseName = "character-locks";
  const phaseState = state.phases[phase];
  if (!(await preparePhaseRun(phase, options, state))) {
    return;
  }

  const scannedAtInvocationStart = phaseState.summary.scanned;
  let exhausted = false;
  while (true) {
    const take = remainingTake(options.limit, scannedAtInvocationStart, phaseState.summary.scanned);
    if (take === 0) {
      logEvent(phase, "limit reached before exhaustion", {
        limitPerPhase: options.limit,
        processedThisInvocation: scannedThisInvocation(phaseState.summary.scanned, scannedAtInvocationStart),
        cumulativeScanned: phaseState.summary.scanned,
      });
      await persistState(state, options);
      return;
    }

    const characters = await prisma.character.findMany({
      where: {
        projectId: options.onlyProject ?? undefined,
        visualLocks: { none: { isActive: true } },
        visualRefs: { some: {} },
      },
      include: {
        visualRefs: { orderBy: { createdAt: "desc" }, take: 1 },
        visualLocks: { orderBy: [{ version: "desc" }, { createdAt: "desc" }] },
      },
      orderBy: { id: "asc" },
      take,
      ...buildPaginationArgs(options, phaseState.lastCursor),
    });

    if (characters.length === 0) {
      exhausted = true;
      break;
    }

    for (const character of characters) {
      phaseState.summary.scanned += 1;
      phaseState.lastCursor = character.id;

      const existingLock = character.visualLocks.find((lock) => lock.isActive) ?? null;
      const nextVersion = computeNextCharacterLockVersion(character.visualLocks.map((lock) => lock.version));
      const primaryRef = character.visualRefs[0] ?? null;
      const details = {
        characterId: character.id,
        projectId: character.projectId,
        hasExistingActiveLock: Boolean(existingLock),
        primaryRefId: primaryRef?.id ?? null,
        nextVersion,
      };

      try {
        if (existingLock) {
          phaseState.summary.skipped += 1;
          logEvent(phase, "active lock already exists, skipping", details);
        } else if (!primaryRef) {
          phaseState.summary.warnings += 1;
          phaseState.summary.skipped += 1;
          logEvent(phase, "missing primary ref, skipping ambiguous character", details);
        } else if (options.dryRun) {
          phaseState.summary.wouldCreate += 1;
          logEvent(phase, "would create active character lock", details);
        } else {
          await prisma.characterVisualLock.create({
            data: {
              projectId: character.projectId,
              characterId: character.id,
              version: nextVersion,
              isActive: true,
              displayName: character.name,
              shortVisualCore: compact([
                character.roleType,
                character.hairColor ? `${character.hairColor} hair` : null,
                character.eyeColor ? `${character.eyeColor} eyes` : null,
                character.outfitDefault,
              ]).join(", "),
              canonicalRefUrls: primaryRef ? [primaryRef.imageUrl] : [],
              defaultOutfit: character.outfitDefault,
              currentState: {
                emotionalState: character.emotionalState,
                status: character.status,
              } as Prisma.InputJsonValue,
              metadata: {
                backfilled: true,
                sourceVisualRefId: primaryRef.id,
              } as Prisma.InputJsonValue,
            },
          });
          phaseState.summary.created += 1;
          logEvent(phase, "created active character lock", details);
        }
      } catch (error) {
        phaseState.summary.errors += 1;
        console.error(`[backfill-hard-switch][${phase}] failed`, { ...details, error });
        throw error;
      } finally {
        await persistState(state, options);
      }
    }
  }

  await finalizePhaseRun(phase, exhausted, options, state);
}

async function runSceneKeyframesPhase(options: CliOptions, state: BackfillState) {
  const phase: PhaseName = "scene-keyframes";
  const phaseState = state.phases[phase];
  if (!(await preparePhaseRun(phase, options, state))) {
    return;
  }

  const scannedAtInvocationStart = phaseState.summary.scanned;
  let exhausted = false;
  while (true) {
    const take = remainingTake(options.limit, scannedAtInvocationStart, phaseState.summary.scanned);
    if (take === 0) {
      logEvent(phase, "limit reached before exhaustion", {
        limitPerPhase: options.limit,
        processedThisInvocation: scannedThisInvocation(phaseState.summary.scanned, scannedAtInvocationStart),
        cumulativeScanned: phaseState.summary.scanned,
      });
      await persistState(state, options);
      return;
    }

    const scenes = await prisma.chapterScene.findMany({
      where: {
        chapter: options.onlyProject ? { projectId: options.onlyProject } : undefined,
        OR: [{ keyframes: { none: {} } }, { images: { some: { sceneKeyframeId: null } } }],
      },
      include: {
        images: {
          orderBy: { panelNumber: "asc" },
          take: 1,
          select: { id: true, imageUrl: true, mediaAssetId: true, panelNumber: true },
        },
        chapter: true,
        keyframes: {
          orderBy: [{ selected: "desc" }, { version: "desc" }, { createdAt: "desc" }],
          take: 5,
          select: { id: true, version: true, selected: true, imageAssetId: true, imageUrl: true },
        },
      },
      orderBy: { id: "asc" },
      take,
      ...buildPaginationArgs(options, phaseState.lastCursor),
    });

    if (scenes.length === 0) {
      exhausted = true;
      break;
    }

    for (const scene of scenes) {
      phaseState.summary.scanned += 1;
      phaseState.lastCursor = scene.id;

      const existingKeyframe = scene.keyframes[0] ?? null;
      const firstImage = scene.images[0] ?? null;
      const metadata = extractMetadataObject(scene.metadata);
      const characters = extractStringArray(metadata.characters);
      const orphanPanelCount = await prisma.sceneImage.count({
        where: { sceneId: scene.id, sceneKeyframeId: null },
      });
      const details = {
        sceneId: scene.id,
        chapterId: scene.chapterId,
        projectId: scene.chapter.projectId,
        hasExistingKeyframe: Boolean(existingKeyframe),
        sourceImageId: firstImage?.id ?? null,
        orphanPanelCount,
      };

      try {
        if (existingKeyframe && orphanPanelCount === 0) {
          phaseState.summary.skipped += 1;
          logEvent(phase, "scene keyframe already exists, skipping", details);
        } else if (options.dryRun) {
          if (existingKeyframe) {
            phaseState.summary.wouldUpdate += orphanPanelCount;
            logEvent(phase, "would repair orphan panels using existing keyframe", {
              ...details,
              keyframeId: existingKeyframe.id,
            });
          } else {
            phaseState.summary.wouldCreate += 1;
            phaseState.summary.wouldUpdate += orphanPanelCount;
            logEvent(phase, "would create scene keyframe and attach orphan panels", details);
          }
        } else {
          const result = await prisma.$transaction(async (tx) => {
            let repairTarget = existingKeyframe;

            if (!repairTarget) {
              repairTarget = await tx.sceneKeyframe.create({
                data: {
                  projectId: scene.chapter.projectId,
                  chapterId: scene.chapterId,
                  sceneId: scene.id,
                  version: 1,
                  selected: true,
                  imageAssetId: firstImage?.mediaAssetId ?? null,
                  imageUrl: firstImage?.imageUrl ?? null,
                  involvedCharacterIds: characters as Prisma.InputJsonValue,
                  environmentLock: {
                    summary: scene.summary,
                    location: typeof metadata.location === "string" ? metadata.location : null,
                  } as Prisma.InputJsonValue,
                  compositionArchetype: "backfilled_scene",
                  metadata: {
                    backfilled: true,
                    sourceImageId: firstImage?.id ?? null,
                    imageSourcePolicy: firstImage?.mediaAssetId ? "asset_primary_with_url_fallback" : "legacy_url_fallback_only",
                  } as Prisma.InputJsonValue,
                },
                select: { id: true, version: true, selected: true, imageAssetId: true, imageUrl: true },
              });
            }

            const updatedImages = await tx.sceneImage.updateMany({
              where: { sceneId: scene.id, sceneKeyframeId: null },
              data: { sceneKeyframeId: repairTarget.id },
            });

            return {
              keyframe: repairTarget,
              created: existingKeyframe ? 0 : 1,
              updated: updatedImages.count,
            };
          });

          phaseState.summary.created += result.created;
          phaseState.summary.updated += result.updated;
          logEvent(phase, existingKeyframe ? "repaired orphan panels using existing keyframe" : "created scene keyframe", {
            ...details,
            keyframeId: result.keyframe.id,
            updatedPanels: result.updated,
          });
        }
      } catch (error) {
        phaseState.summary.errors += 1;
        console.error(`[backfill-hard-switch][${phase}] failed`, { ...details, error });
        throw error;
      } finally {
        await persistState(state, options);
      }
    }
  }

  await finalizePhaseRun(phase, exhausted, options, state);
}

async function runFalTracesPhase(options: CliOptions, state: BackfillState) {
  const phase: PhaseName = "fal-traces";
  const phaseState = state.phases[phase];
  if (!(await preparePhaseRun(phase, options, state))) {
    return;
  }

  const scannedAtInvocationStart = phaseState.summary.scanned;
  let exhausted = false;
  while (true) {
    const take = remainingTake(options.limit, scannedAtInvocationStart, phaseState.summary.scanned);
    if (take === 0) {
      logEvent(phase, "limit reached before exhaustion", {
        limitPerPhase: options.limit,
        processedThisInvocation: scannedThisInvocation(phaseState.summary.scanned, scannedAtInvocationStart),
        cumulativeScanned: phaseState.summary.scanned,
      });
      await persistState(state, options);
      return;
    }

    const images = await prisma.sceneImage.findMany({
      where: {
        status: "completed",
        falTraces: { none: {} },
        scene: options.onlyProject ? { chapter: { projectId: options.onlyProject } } : undefined,
      },
      include: {
        scene: { include: { chapter: true } },
        falTraces: { orderBy: { createdAt: "asc" }, take: 1 },
      },
      orderBy: { id: "asc" },
      take,
      ...buildPaginationArgs(options, phaseState.lastCursor),
    });

    if (images.length === 0) {
      exhausted = true;
      break;
    }

    for (const image of images) {
      phaseState.summary.scanned += 1;
      phaseState.lastCursor = image.id;

      const existingTrace = image.falTraces[0] ?? null;
      const metadata = extractMetadataObject(image.metadata);
      const generationLog = extractMetadataObject(metadata.generationLog);
      const refsUsed = extractStringArray(image.referenceImageIds);
      const details = {
        panelId: image.id,
        sceneId: image.sceneId,
        chapterId: image.scene.chapterId,
        projectId: image.scene.chapter.projectId,
        hasExistingTrace: Boolean(existingTrace),
        mode: modeFromReferences(image.referenceImageIds),
      };

      try {
        if (existingTrace) {
          phaseState.summary.skipped += 1;
          logEvent(phase, "fal trace already exists, skipping", details);
        } else if (options.dryRun) {
          phaseState.summary.wouldCreate += 1;
          logEvent(phase, "would create fal trace", details);
        } else {
          await prisma.falTrace.create({
            data: {
              projectId: image.scene.chapter.projectId,
              chapterId: image.scene.chapterId,
              sceneId: image.sceneId,
              panelId: image.id,
              sceneKeyframeId: image.sceneKeyframeId,
              provider: image.provider ?? "fal",
              model: image.model ?? "unknown",
              mode: modeFromReferences(image.referenceImageIds),
              status: "completed",
              requestPayload: {
                prompt: image.prompt,
                negativePrompt: image.negativePrompt,
              } as Prisma.InputJsonValue,
              responsePayload: generationLog as Prisma.InputJsonValue,
              refsUsed: refsUsed as Prisma.InputJsonValue,
              lorasUsed: [] as Prisma.InputJsonValue,
              timings: {} as Prisma.InputJsonValue,
            },
          });
          phaseState.summary.created += 1;
          logEvent(phase, "created fal trace", details);
        }
      } catch (error) {
        phaseState.summary.errors += 1;
        console.error(`[backfill-hard-switch][${phase}] failed`, { ...details, error });
        throw error;
      } finally {
        await persistState(state, options);
      }
    }
  }

  await finalizePhaseRun(phase, exhausted, options, state);
}

async function buildPostChecks(options: CliOptions) {
  const projectFilter = options.onlyProject ?? undefined;

  const [
    missingMediaAssetRefs,
    missingActiveLocks,
    scenesWithoutKeyframe,
    orphanPanelsWithoutSceneKeyframe,
    completedPanelsWithoutTrace,
    charactersWithMultipleActiveLocks,
    scenesWithMultipleSelectedKeyframes,
  ] =
    await Promise.all([
      prisma.characterVisualRef.count({
        where: {
          mediaAssetId: null,
          character: projectFilter ? { projectId: projectFilter } : undefined,
        },
      }),
      prisma.character.count({
        where: {
          projectId: projectFilter,
          visualRefs: { some: {} },
          visualLocks: { none: { isActive: true } },
        },
      }),
      prisma.chapterScene.count({
        where: {
          chapter: projectFilter ? { projectId: projectFilter } : undefined,
          keyframes: { none: {} },
        },
      }),
      prisma.sceneImage.count({
        where: {
          sceneKeyframeId: null,
          scene: {
            chapter: projectFilter ? { projectId: projectFilter } : undefined,
            keyframes: { some: {} },
          },
        },
      }),
      prisma.sceneImage.count({
        where: {
          status: "completed",
          scene: projectFilter ? { chapter: { projectId: projectFilter } } : undefined,
          falTraces: { none: {} },
        },
      }),
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM (
          SELECT "characterId"
          FROM "CharacterVisualLock"
          WHERE "isActive" = true
          ${projectFilter ? Prisma.sql`AND "projectId" = ${projectFilter}` : Prisma.empty}
          GROUP BY "characterId"
          HAVING COUNT(*) > 1
        ) duplicate_active_locks
      `,
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM (
          SELECT "sceneId"
          FROM "SceneKeyframe"
          WHERE "selected" = true
          ${projectFilter ? Prisma.sql`AND "projectId" = ${projectFilter}` : Prisma.empty}
          GROUP BY "sceneId"
          HAVING COUNT(*) > 1
        ) duplicate_selected_keyframes
      `,
    ]);

  return {
    missingMediaAssetRefs,
    missingActiveLocks,
    scenesWithoutKeyframe,
    orphanPanelsWithoutSceneKeyframe,
    completedPanelsWithoutTrace,
    charactersWithMultipleActiveLocks: Number(charactersWithMultipleActiveLocks[0]?.count ?? 0n),
    scenesWithMultipleSelectedKeyframes: Number(scenesWithMultipleSelectedKeyframes[0]?.count ?? 0n),
  };
}

function printFinalSummary(options: CliOptions, state: BackfillState, postChecks: Awaited<ReturnType<typeof buildPostChecks>>) {
  const summary = {
    dryRun: options.dryRun,
    onlyProject: options.onlyProject,
    limitPerPhase: options.limit,
    stateFile: options.stateFile,
    phases: state.phases,
    postChecks,
  };

  console.log("[backfill-hard-switch] summary");
  console.log(JSON.stringify(summary, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const state = await loadState(options);

  console.log(
    "[backfill-hard-switch] start",
    JSON.stringify({
      dryRun: options.dryRun,
      limitPerPhase: options.limit,
      onlyProject: options.onlyProject,
      resume: options.resume,
      stateFile: options.stateFile,
    }),
  );

  await persistState(state, options);
  await runMediaAssetsPhase(options, state);
  await runCharacterLocksPhase(options, state);
  await runSceneKeyframesPhase(options, state);
  await runFalTracesPhase(options, state);

  const postChecks = await buildPostChecks(options);
  printFinalSummary(options, state, postChecks);
}

const isExecutedDirectly = process.argv[1] != null && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isExecutedDirectly) {
  main()
    .catch((error) => {
      console.error("[backfill-hard-switch] failed", error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
