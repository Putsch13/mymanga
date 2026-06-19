import { prisma, type Prisma } from "../src/index";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type LegacyBeat = {
  id?: unknown;
  summary?: unknown;
  characters?: unknown;
  location?: unknown;
  pageRole?: unknown;
  turn?: unknown;
};

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function buildStudioFromLegacy(input: {
  chapterNumber: number;
  title: string | null;
  summary: string | null;
  cliffhanger: string | null;
  userIntent: string | null;
  approvedOutline: Record<string, unknown>;
}) {
  const beats = Array.isArray(input.approvedOutline.beats) ? (input.approvedOutline.beats as LegacyBeat[]) : [];
  return {
    status: beats.length >= 10 ? "PRODUCTION_PLAN_READY" : beats.length > 0 ? "OUTLINE_PRODUCTION_READY" : "DRAFT",
    currentStep: beats.length >= 10 ? "production_plan" : beats.length > 0 ? "production_outline" : "intent",
    data: {
      intent: {
        chapterNumber: input.chapterNumber,
        workingTitle: input.title,
        shortPitch: input.userIntent,
        mainConflict: input.summary,
      },
      editorialOutline: beats.length > 0 ? {
        summary: typeof input.approvedOutline.summary === "string" ? input.approvedOutline.summary : input.summary,
        validationNotes: [],
        beats: beats.slice(0, 5).map((beat, index) => ({
          beatId: typeof beat.id === "string" ? beat.id : `beat_${index + 1}`,
          label: `Bloc ${index + 1}`,
          summary: typeof beat.summary === "string" ? beat.summary : `Beat ${index + 1}`,
          narrativePurpose: typeof beat.pageRole === "string" ? beat.pageRole : null,
          dramaticShift: typeof beat.turn === "string" ? beat.turn : null,
          involvedCharacters: asStringArray(beat.characters),
        })),
      } : undefined,
      productionOutline: beats.length > 0 ? {
        source: "legacy_adapted",
        chapterGoal: typeof input.approvedOutline.summary === "string" ? input.approvedOutline.summary : input.summary,
        cliffhanger: typeof input.approvedOutline.cliffhanger === "string" ? input.approvedOutline.cliffhanger : input.cliffhanger,
        beats: beats.map((beat, index) => ({
          beatId: typeof beat.id === "string" ? beat.id : `beat_${index + 1}`,
          summary: typeof beat.summary === "string" ? beat.summary : `Beat ${index + 1}`,
          narrativeFunction: typeof beat.pageRole === "string" ? beat.pageRole : "progression",
          whyThisBeatExists: typeof beat.summary === "string" ? beat.summary : `Beat ${index + 1}`,
          dramaticChange: typeof beat.turn === "string" ? beat.turn : "evolution",
          involvedCharacters: asStringArray(beat.characters),
          activeCanonConstraints: [],
          environmentContext: typeof beat.location === "string" ? [beat.location] : [],
          visualPriority: "high",
          estimatedPanels: 4,
          criticality: "medium",
          continuityDependencies: [],
          indispensabilityScore: 70,
          redundancyRisk: 20,
          infoGained: null,
          emotionProduced: null,
        })),
      } : undefined,
    },
    history: [
      {
        from: "DRAFT",
        to: beats.length > 0 ? "OUTLINE_PRODUCTION_READY" : "DRAFT",
        at: new Date().toISOString(),
        reason: "backfill_chapter_studio",
      },
    ],
    autosaveVersion: 1,
    updatedAt: new Date().toISOString(),
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const chapters = await prisma.chapter.findMany({
    where: {},
    select: {
      id: true,
      chapterNumber: true,
      title: true,
      summary: true,
      cliffhanger: true,
      userIntent: true,
      outline: true,
    },
  });

  let updated = 0;
  let skipped = 0;

  for (const chapter of chapters) {
    const outline = asRecord(chapter.outline);
    if (outline.studio) {
      skipped += 1;
      continue;
    }
    const approvedOutline = asRecord(outline.approvedOutline);
    if (Object.keys(approvedOutline).length === 0) {
      skipped += 1;
      continue;
    }

    const studio = buildStudioFromLegacy({
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      summary: chapter.summary,
      cliffhanger: chapter.cliffhanger,
      userIntent: chapter.userIntent,
      approvedOutline,
    });

    if (!dryRun) {
      await prisma.chapter.update({
        where: { id: chapter.id },
        data: {
          outline: ({
            ...outline,
            studio,
          } as unknown) as Prisma.InputJsonValue,
        },
      });
    }
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        scanned: chapters.length,
        updated,
        skipped,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    prisma.$disconnect();
    process.exit(1);
  });
