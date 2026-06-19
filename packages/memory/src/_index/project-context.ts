/**
 * `buildProjectContext` — assemble la totalité du contexte projet (settings,
 * style pack, story bible, characters, locations, recentChapters, RAG, etc.)
 * pour alimenter les prompts LLM.
 *
 * Le résultat est volontairement plat et pré-projeté pour éviter d'envoyer des
 * objets Prisma riches au LLM.
 */
import type { PrismaClient } from "@manga-ai-studio/db";
import { isSecondaryHeroRole } from "@manga-ai-studio/core";
import { retrieveRelevantMemory } from "./rag-documents";
import { buildSeriesSynopsis } from "./series-synopsis";

export interface BuildProjectContextOptions {
  focusCharacterIds?: string[];
  targetChapterId?: string | null;
  targetChapterNumber?: number | null;
}

export async function buildProjectContext(
  prisma: PrismaClient,
  projectId: string,
  userIntent?: string | null,
  options?: BuildProjectContextOptions,
) {
  const targetChapterNumber = options?.targetChapterNumber ?? null;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      settings: true,
      storyBible: true,
      stylePacks: { orderBy: { createdAt: "desc" }, take: 1 },
      characters: { orderBy: { createdAt: "asc" } },
      relationships: true,
      arcs: { orderBy: [{ startChapterNumber: "asc" }, { name: "asc" }] },
      chapters: targetChapterNumber
        ? {
            where: { chapterNumber: { lt: targetChapterNumber } },
            orderBy: { chapterNumber: "desc" },
            take: 10,
          }
        : { orderBy: { chapterNumber: "desc" }, take: 10 },
      memorySnapshots: targetChapterNumber
        ? {
            where: {
              OR: [
                { chapterId: null },
                { chapter: { chapterNumber: { lt: targetChapterNumber } } },
              ],
            },
            orderBy: { createdAt: "desc" },
            take: 5,
          }
        : { orderBy: { createdAt: "desc" }, take: 5 },
      continuityEvents: {
        ...(targetChapterNumber
          ? {
              where: {
                OR: [
                  { chapterId: null },
                  { chapter: { chapterNumber: { lt: targetChapterNumber } } },
                ],
              },
            }
          : {}),
        orderBy: { timelineOrder: "desc" },
        take: 12,
      },
    },
  });

  if (!project) return null;

  const projectLocations = await prisma.location
    .findMany({
      where: { projectId },
      orderBy: { name: "asc" },
      take: 50,
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        description: true,
        aliases: true,
        metadata: true,
        visualBrief: true,
        establishedVisualBrief: true,
        canonImageUrl: true,
        visualRefs: true,
        canonLocked: true,
        parentId: true,
        firstSeenChapterId: true,
      },
    })
    .catch(() => []);

  const focusSet = new Set((options?.focusCharacterIds ?? []).filter(Boolean));
  const orderedCharacters = [...project.characters].sort((a, b) => {
    const aFocused = focusSet.has(a.id) ? 1 : 0;
    const bFocused = focusSet.has(b.id) ? 1 : 0;
    if (aFocused !== bFocused) return bFocused - aFocused;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const latestStylePack = project.stylePacks[0];

  // Fallback RAG : si pas d'intention, on utilise le titre du projet pour
  // récupérer le contexte pertinent.
  const ragQuery = userIntent?.trim() || project.title;
  const retrieved = ragQuery
    ? await retrieveRelevantMemory(prisma, projectId, ragQuery, 5)
    : [];

  return {
    project: {
      id: project.id,
      title: project.title,
      pitch: project.pitch,
      description: project.description,
      primaryGenre: project.primaryGenre,
      subGenres: Array.isArray(project.subGenres)
        ? project.subGenres.filter((item): item is string => typeof item === "string")
        : [],
      tone: project.tone,
      format: project.format,
      contentRating: project.contentRating,
      intensityLayer: project.intensityLayer,
      visualStyle: project.visualStyle,
    },
    focusCharacterIds: [...focusSet],
    secondaryHeroCharacterId:
      orderedCharacters.find((c) => isSecondaryHeroRole(c.roleType))?.id ?? null,
    settings: project.settings,
    stylePack: latestStylePack
      ? {
          renderFamily: latestStylePack.renderFamily,
          lineWeight: latestStylePack.lineWeight,
          shadingMode: latestStylePack.shadingMode,
          contrastProfile: latestStylePack.contrastProfile,
          anatomyBias: latestStylePack.anatomyBias,
          backgroundDensity: latestStylePack.backgroundDensity,
          cameraLanguage: latestStylePack.cameraLanguage,
          negativeConstraints: Array.isArray(latestStylePack.negativeConstraints)
            ? latestStylePack.negativeConstraints.filter(
                (item): item is string => typeof item === "string",
              )
            : [],
        }
      : null,
    storyBible: project.storyBible
      ? {
          summary: project.storyBible.summary,
          themes: Array.isArray(project.storyBible.themes)
            ? project.storyBible.themes.filter(
                (item): item is string => typeof item === "string",
              )
            : [],
          worldRules: project.storyBible.worldRules,
          lore: project.storyBible.lore,
          glossary: project.storyBible.glossary,
          lockedCanon: project.storyBible.lockedCanon,
        }
      : null,
    locations: projectLocations.map((location) => projectLocationProjection(location)),
    characters: orderedCharacters.map((c) => projectCharacterProjection(c)),
    relationships: project.relationships,
    arcs: project.arcs,
    recentChapters: project.chapters.map((c) => ({
      id: c.id,
      chapterNumber: c.chapterNumber,
      title: c.title,
      summary: c.summary,
      cliffhanger: c.cliffhanger,
    })),
    recentMemory: project.memorySnapshots.map((s) => ({
      chapterId: s.chapterId,
      narrativeSummary: s.narrativeSummary,
      structuredState: s.structuredState,
    })),
    retrievedDocs: retrieved.map((doc) => ({
      title: doc.title,
      entityType: doc.entityType,
      content: doc.content,
      metadata: doc.metadata,
    })),
    recentContinuityEvents: (project.continuityEvents ?? []).slice(0, 12).map((e) => ({
      eventType: e.eventType,
      summary: e.summary,
      permanent: e.permanent,
      importance: e.importance,
      entities: e.entities,
    })),
    seriesSynopsis: buildSeriesSynopsis(
      project.chapters.map((c) => ({
        chapterNumber: c.chapterNumber,
        title: c.title,
        summary: c.summary,
        cliffhanger: c.cliffhanger,
      })),
    ),
  };
}

type LocationRow = {
  id: string;
  name: string;
  slug: string | null;
  type: string | null;
  description: string | null;
  aliases: unknown;
  metadata: unknown;
  visualBrief: string | null;
  establishedVisualBrief: string | null;
  canonImageUrl: string | null;
  visualRefs: unknown;
  canonLocked: boolean;
  parentId: string | null;
  firstSeenChapterId: string | null;
};

function projectLocationProjection(location: LocationRow) {
  const raw =
    location.metadata && typeof location.metadata === "object"
      ? (location.metadata as Record<string, unknown>)
      : {};
  const metaVisualBrief =
    typeof raw.visualBrief === "string" ? raw.visualBrief : null;
  const prismaAliases = Array.isArray(location.aliases)
    ? (location.aliases as unknown[]).filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const metaAliases = Array.isArray(raw.aliases)
    ? raw.aliases.filter((item): item is string => typeof item === "string")
    : [];
  const aliases = [...new Set([...prismaAliases, ...metaAliases])];
  const visualBrief =
    typeof location.visualBrief === "string" &&
    location.visualBrief.trim().length > 0
      ? location.visualBrief
      : metaVisualBrief ??
        (typeof location.description === "string" ? location.description : null);
  return {
    id: location.id,
    name: location.name,
    slug: location.slug ?? null,
    type: location.type,
    description: location.description,
    aliases,
    visualBrief,
    establishedVisualBrief: location.establishedVisualBrief,
    canonImageUrl: location.canonImageUrl,
    visualRefs: location.visualRefs,
    metadata: raw,
    canonLocked: location.canonLocked,
    parentLocationId: location.parentId ?? null,
    firstSeenChapterId: location.firstSeenChapterId ?? null,
  };
}

interface CharacterRow {
  id: string;
  name: string;
  roleType: string | null;
  biography: string | null;
  objective: string | null;
  fear: string | null;
  emotionalState: string | null;
  status: string;
  canonLocked: boolean;
  traits: unknown;
  flaws: unknown;
  [k: string]: unknown;
}

function projectCharacterProjection(c: CharacterRow) {
  const raw = c as Record<string, unknown>;
  const continuity =
    raw.continuityProfile && typeof raw.continuityProfile === "object"
      ? (raw.continuityProfile as Record<string, unknown>)
      : null;
  const stringField = (key: string): string | null =>
    continuity && typeof continuity[key] === "string"
      ? (continuity[key] as string)
      : null;
  const objectField = (key: string): Record<string, unknown> => {
    const v = raw[key];
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  };
  return {
    id: c.id,
    name: c.name,
    roleType: c.roleType,
    gender: typeof raw.gender === "string" ? raw.gender : null,
    biography: c.biography,
    objective: c.objective,
    fear: c.fear,
    emotionalState: c.emotionalState,
    status: c.status,
    canonLocked: c.canonLocked,
    traits: Array.isArray(c.traits)
      ? (c.traits as unknown[]).filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    flaws: Array.isArray(c.flaws)
      ? (c.flaws as unknown[]).filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    appearance: typeof raw.appearance === "string" ? raw.appearance : null,
    outfitDefault: typeof raw.outfitDefault === "string" ? raw.outfitDefault : null,
    hairColor: typeof raw.hairColor === "string" ? raw.hairColor : null,
    eyeColor: typeof raw.eyeColor === "string" ? raw.eyeColor : null,
    speechProfile: objectField("speechProfile"),
    bodyState: objectField("bodyState"),
    wardrobeProfile: objectField("wardrobeProfile"),
    visualProfile: objectField("visualProfile"),
    continuityProfile: continuity ?? {},
    entityKind: stringField("entityKind"),
    speciesLabel: stringField("speciesLabel"),
    dialogueMode: stringField("dialogueMode"),
    recurrencePolicy: stringField("recurrencePolicy"),
    stableVisualDNA:
      raw.stableVisualDNA !== null &&
      typeof raw.stableVisualDNA === "object" &&
      !Array.isArray(raw.stableVisualDNA)
        ? (raw.stableVisualDNA as Record<string, unknown>)
        : null,
  };
}
