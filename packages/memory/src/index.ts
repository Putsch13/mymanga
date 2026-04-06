import type { Prisma, PrismaClient } from "@manga-ai-studio/db";

type RagDocumentInput = {
  projectId: string;
  entityType: string;
  entityId?: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
};

type ChapterMemoryInput = {
  projectId: string;
  chapterId: string;
  chapterNumber: number;
  summary: string;
  structuredState?: Prisma.InputJsonValue;
  timelineEvents?: Array<Record<string, unknown>>;
  openLoops?: string[];
  title?: string | null;
};

function sanitizeRagContent(content: string) {
  return content
    .replace(/system\s*:/gi, "")
    .replace(/assistant\s*:/gi, "")
    .replace(/ignore previous instructions/gi, "")
    .trim()
    .slice(0, 4000);
}

// ── Embeddings OpenAI ──────────────────────────────────────────────────────

const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

/**
 * Génère un embedding vectoriel via OpenAI text-embedding-3-small (1536 dims).
 * Retourne null si la clé API n'est pas configurée (fallback gracieux).
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000),
      }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      data?: Array<{ embedding: number[] }>;
    };
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// ── RAG Document management ────────────────────────────────────────────────

export async function indexRagDocument(prisma: PrismaClient, doc: RagDocumentInput) {
  const sanitized = sanitizeRagContent(doc.content);
  const embedding = await generateEmbedding(sanitized);

  // Prisma ne supporte pas nativement vector(1536) — on passe par $executeRaw
  if (embedding) {
    const vectorLiteral = `[${embedding.join(",")}]`;
    // Upsert via raw SQL pour inclure le champ embedding
    const existing = await prisma.ragDocument.findFirst({
      where: {
        projectId: doc.projectId,
        entityType: doc.entityType,
        ...(doc.entityId ? { entityId: doc.entityId } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.$executeRawUnsafe(
        `UPDATE "RagDocument"
         SET content = $1, title = $2, metadata = $3::jsonb, embedding = $4::vector
         WHERE id = $5`,
        sanitized,
        doc.title ?? null,
        JSON.stringify(doc.metadata ?? {}),
        vectorLiteral,
        existing.id,
      );
      return prisma.ragDocument.findUniqueOrThrow({ where: { id: existing.id } });
    } else {
      const created = await prisma.ragDocument.create({
        data: {
          projectId: doc.projectId,
          entityType: doc.entityType,
          entityId: doc.entityId,
          title: doc.title,
          content: sanitized,
          metadata: (doc.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
      await prisma.$executeRawUnsafe(
        `UPDATE "RagDocument" SET embedding = $1::vector WHERE id = $2`,
        vectorLiteral,
        created.id,
      );
      return created;
    }
  }

  // Fallback sans embedding
  return prisma.ragDocument.create({
    data: {
      projectId: doc.projectId,
      entityType: doc.entityType,
      entityId: doc.entityId,
      title: doc.title,
      content: sanitized,
      metadata: (doc.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function replaceRagDocument(prisma: PrismaClient, doc: RagDocumentInput) {
  if (doc.entityId) {
    await prisma.ragDocument.deleteMany({
      where: {
        projectId: doc.projectId,
        entityType: doc.entityType,
        entityId: doc.entityId,
      },
    });
  }
  return indexRagDocument(prisma, doc);
}

export async function listRecentSummaries(prisma: PrismaClient, projectId: string, take = 3) {
  return prisma.memorySnapshot.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/**
 * Recherche vectorielle cosine via pgvector si un embedding est disponible,
 * sinon fallback sur la recherche textuelle LIKE.
 */
export async function retrieveRelevantMemory(
  prisma: PrismaClient,
  projectId: string,
  query: string,
  take = 6,
) {
  const normalized = sanitizeRagContent(query);
  const embedding = await generateEmbedding(normalized);

  if (embedding) {
    const vectorLiteral = `[${embedding.join(",")}]`;
    try {
      const docs = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          title: string | null;
          content: string;
          entityType: string;
          metadata: unknown;
          createdAt: Date;
        }>
      >(
        `SELECT id, title, content, "entityType", metadata, "createdAt"
         FROM "RagDocument"
         WHERE "projectId" = $1
           AND embedding IS NOT NULL
         ORDER BY embedding <=> $2::vector
         LIMIT $3`,
        projectId,
        vectorLiteral,
        take,
      );
      return docs;
    } catch {
      // pgvector non disponible, fallback textuel
    }
  }

  // Fallback textuel
  const docs = await prisma.ragDocument.findMany({
    where: {
      projectId,
      OR: [
        { title: { contains: normalized.slice(0, 80), mode: "insensitive" } },
        { content: { contains: normalized.slice(0, 80), mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  return docs;
}

/**
 * Construit un résumé cumulatif compressé de la série entière.
 * Les 3 derniers chapitres sont détaillés, les anciens sont compressés en une ligne chacun.
 * Permet au LLM de connaître l'arc global sans exploser le contexte.
 */
function buildSeriesSynopsis(
  chapters: Array<{ chapterNumber: number; title: string | null; summary: string | null; cliffhanger: string | null }>,
): string {
  if (chapters.length === 0) return "Aucun chapitre précédent. C'est le début de la série.";

  const sorted = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);

  if (sorted.length <= 3) {
    return sorted
      .map((c) => `Ch.${c.chapterNumber} "${c.title ?? ""}": ${c.summary ?? "non résumé"}. Fin: ${c.cliffhanger ?? "n/a"}`)
      .join("\n");
  }

  const older = sorted.slice(0, -3);
  const recent = sorted.slice(-3);

  const olderCompressed = older
    .map((c) => `Ch.${c.chapterNumber}: ${(c.summary ?? "").slice(0, 80)}`)
    .join(" → ");

  const recentDetailed = recent
    .map((c) => `Ch.${c.chapterNumber} "${c.title ?? ""}": ${c.summary ?? "non résumé"}. Fin: ${c.cliffhanger ?? "n/a"}`)
    .join("\n");

  return `ARC GLOBAL (${sorted.length} chapitres): ${olderCompressed}\n\nDERNIERS CHAPITRES:\n${recentDetailed}`;
}

export async function buildProjectContext(
  prisma: PrismaClient,
  projectId: string,
  userIntent?: string | null,
  options?: {
    focusCharacterIds?: string[];
  },
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      settings: true,
      storyBible: true,
      stylePacks: { orderBy: { createdAt: "desc" }, take: 1 },
      characters: { orderBy: { createdAt: "asc" } },
      relationships: true,
      arcs: { orderBy: [{ startChapterNumber: "asc" }, { name: "asc" }] },
      chapters: { orderBy: { chapterNumber: "desc" }, take: 10 },
      memorySnapshots: { orderBy: { createdAt: "desc" }, take: 5 },
      continuityEvents: {
        orderBy: { timelineOrder: "desc" },
        take: 12,
      },
    },
  });

  if (!project) return null;

  const focusSet = new Set((options?.focusCharacterIds ?? []).filter(Boolean));
  const orderedCharacters = [...project.characters].sort((a, b) => {
    const aFocused = focusSet.has(a.id) ? 1 : 0;
    const bFocused = focusSet.has(b.id) ? 1 : 0;
    if (aFocused !== bFocused) return bFocused - aFocused;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const latestStylePack = project.stylePacks[0];

  // Fallback RAG : si pas d'intention, utiliser le titre du projet pour récupérer le contexte pertinent
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
      subGenres: Array.isArray(project.subGenres) ? project.subGenres.filter((item): item is string => typeof item === "string") : [],
      tone: project.tone,
      format: project.format,
      contentRating: project.contentRating,
      intensityLayer: project.intensityLayer,
      visualStyle: project.visualStyle,
    },
    focusCharacterIds: [...focusSet],
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
            ? latestStylePack.negativeConstraints.filter((item): item is string => typeof item === "string")
            : [],
        }
      : null,
    storyBible: project.storyBible
      ? {
          summary: project.storyBible.summary,
          themes: Array.isArray(project.storyBible.themes)
            ? project.storyBible.themes.filter((item): item is string => typeof item === "string")
            : [],
          worldRules: project.storyBible.worldRules,
          lore: project.storyBible.lore,
          glossary: project.storyBible.glossary,
          lockedCanon: project.storyBible.lockedCanon,
        }
      : null,
    characters: orderedCharacters.map((c) => {
      const raw = c as Record<string, unknown>;
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
        traits: Array.isArray(c.traits) ? c.traits.filter((item): item is string => typeof item === "string") : [],
        flaws: Array.isArray(c.flaws) ? c.flaws.filter((item): item is string => typeof item === "string") : [],
        appearance: typeof raw.appearance === "string" ? raw.appearance : null,
        outfitDefault: typeof raw.outfitDefault === "string" ? raw.outfitDefault : null,
        hairColor: typeof raw.hairColor === "string" ? raw.hairColor : null,
        eyeColor: typeof raw.eyeColor === "string" ? raw.eyeColor : null,
        speechProfile:
          raw.speechProfile && typeof raw.speechProfile === "object"
            ? (raw.speechProfile as Record<string, unknown>)
            : {},
        bodyState:
          raw.bodyState && typeof raw.bodyState === "object"
            ? (raw.bodyState as Record<string, unknown>)
            : {},
        wardrobeProfile:
          raw.wardrobeProfile && typeof raw.wardrobeProfile === "object"
            ? (raw.wardrobeProfile as Record<string, unknown>)
            : {},
        visualProfile:
          raw.visualProfile && typeof raw.visualProfile === "object"
            ? (raw.visualProfile as Record<string, unknown>)
            : {},
        continuityProfile:
          raw.continuityProfile && typeof raw.continuityProfile === "object"
            ? (raw.continuityProfile as Record<string, unknown>)
            : {},
      };
    }),
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
    recentContinuityEvents: (project.continuityEvents ?? [])
      .slice(0, 12)
      .map((e) => ({
        eventType: e.eventType,
        summary: e.summary,
        permanent: e.permanent,
        importance: e.importance,
        entities: e.entities,
      })),
    // Résumé cumulatif compressé de toute la série (pour séries longues 50+ chapitres)
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

export async function persistChapterMemory(prisma: PrismaClient, input: ChapterMemoryInput) {
  const snapshot = await prisma.memorySnapshot.create({
    data: {
      projectId: input.projectId,
      chapterId: input.chapterId,
      narrativeSummary: input.summary,
      structuredState: input.structuredState ?? {},
      embeddingStatus: "queued",
    },
  });

  // RAG profond : indexer le résumé du chapitre avec embedding pour recherche sémantique
  await replaceRagDocument(prisma, {
    projectId: input.projectId,
    entityType: "chapter_summary",
    entityId: input.chapterId,
    title: input.title ?? `Chapitre ${input.chapterNumber}`,
    content: input.summary,
    metadata: { chapterId: input.chapterId, chapterNumber: input.chapterNumber },
  });

  // Indexer aussi les événements clés comme documents RAG séparés (recherche sémantique profonde)
  const keyEvents = (input.timelineEvents ?? [])
    .filter((e) => Number(e?.importance ?? 0) >= 60)
    .slice(0, 5);
  for (const event of keyEvents) {
    if (!event) continue;
    const eventSummary = String(event.summary ?? "");
    if (eventSummary.length > 20) {
      await indexRagDocument(prisma, {
        projectId: input.projectId,
        entityType: "key_event",
        entityId: `${input.chapterId}_evt_${String(event.eventType ?? "event")}`,
        title: `Ch.${input.chapterNumber} — ${String(event.eventType ?? "event")}`,
        content: eventSummary,
        metadata: { chapterId: input.chapterId, chapterNumber: input.chapterNumber, importance: event.importance },
      });
    }
  }

  const timelineEvents = input.timelineEvents ?? [];
  for (let i = 0; i < timelineEvents.length; i++) {
    const event = timelineEvents[i];
    if (!event) continue;
    await prisma.continuityEvent.create({
      data: {
        projectId: input.projectId,
        chapterId: input.chapterId,
        eventType: String(event.eventType ?? "chapter_progress"),
        summary: String(event.summary ?? input.summary),
        entities: (event.entities as Prisma.InputJsonValue | undefined) ?? {},
        importance: Number(event.importance ?? 50),
        timelineOrder: input.chapterNumber * 100 + i,
        permanent: Boolean(event.permanent ?? true),
      },
    });
  }

  if (input.openLoops?.length) {
    await replaceRagDocument(prisma, {
      projectId: input.projectId,
      entityType: "open_loops",
      entityId: input.chapterId,
      title: `Open loops chapitre ${input.chapterNumber}`,
      content: input.openLoops.join("\n"),
      metadata: { chapterId: input.chapterId },
    });
  }

  return snapshot;
}

export function detectCanonWarnings(input: {
  characterStatuses: Array<{ name: string; status: string }>;
  scriptText: string;
}) {
  const warnings: string[] = [];

  for (const character of input.characterStatuses) {
    if (
      character.status === "dead" &&
      new RegExp(`\\b${character.name}\\b`, "i").test(input.scriptText)
    ) {
      warnings.push(`${character.name} est marqué comme mort mais réapparaît dans le draft.`);
    }
  }

  return warnings;
}
