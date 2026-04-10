import {
  buildChapterReadinessReport,
  buildStudioSnapshotFromLegacy,
  buildStructuredChapterRuntimeFields,
  chapterStudioSnapshotSchema,
  createEmptyChapterStudioSnapshot,
  updateChapterStudioSnapshot,
} from "../../core/src/index.ts";
import { prisma } from "../src/index";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const chapters = await prisma.chapter.findMany({
    select: {
      id: true,
      chapterNumber: true,
      title: true,
      summary: true,
      cliffhanger: true,
      userIntent: true,
      outline: true,
      scenes: {
        select: {
          images: {
            select: { status: true, metadata: true },
          },
        },
      },
    },
  });

  let updated = 0;

  for (const chapter of chapters) {
    const outlineRecord = asRecord(chapter.outline);
    const parsedStudio = chapterStudioSnapshotSchema.safeParse(outlineRecord.studio);
    const approvedOutline = asRecord(outlineRecord.approvedOutline);
    const snapshot = parsedStudio.success
      ? updateChapterStudioSnapshot(parsedStudio.data, {}, { transitionReason: "backfill_runtime_structured" })
      : Object.keys(approvedOutline).length > 0
        ? buildStudioSnapshotFromLegacy({
            approvedOutline: approvedOutline as never,
            chapterNumber: chapter.chapterNumber,
            chapterTitle: chapter.title,
            chapterSummary: chapter.summary,
            cliffhanger: chapter.cliffhanger,
            userIntent: chapter.userIntent,
          })
        : createEmptyChapterStudioSnapshot();
    const readiness = snapshot.data.readinessReport ?? buildChapterReadinessReport(snapshot);
    const images = chapter.scenes.flatMap((scene) => scene.images);
    const acceptedImages = images.filter((image) => image.status === "completed").length;
    const rejectedImages = images.filter((image) => image.status === "failed" || image.status === "blocked").length;
    const criticalPanelsCount = images.filter((image) => {
      const validationDetails = asRecord(asRecord(image.metadata).validationDetails);
      return asRecord(validationDetails.panelCriticality).level === "CRITICAL" || validationDetails.qaWasRequired === true;
    }).length;
    const criticalPanelsBlocked = images.filter((image) => {
      const validationDetails = asRecord(asRecord(image.metadata).validationDetails);
      return validationDetails.qaWasRequired === true && (validationDetails.qaWasExecuted !== true || typeof validationDetails.qaFailureReason === "string");
    }).length;
    const fields = buildStructuredChapterRuntimeFields({
      snapshot,
      counts: {
        minimumImages: readiness.imageCounts.minimumImages,
        generatedImages: images.length,
        acceptedImages,
        rejectedImages,
      },
      criticalPanelsCount,
      criticalPanelsBlocked,
      criticalPanelsMissingQa: criticalPanelsBlocked,
    });

    if (!dryRun) {
      await prisma.chapter.update({
        where: { id: chapter.id },
        data: {
          studioStatus: fields.studioStatus,
          studioCurrentStep: fields.studioCurrentStep,
          studioUpdatedAt: fields.studioUpdatedAt ? new Date(fields.studioUpdatedAt) : null,
          studioAutosaveVersion: fields.studioAutosaveVersion,
          minimumImages: fields.minimumImages,
          generatedImages: fields.generatedImages,
          acceptedImages: fields.acceptedImages,
          rejectedImages: fields.rejectedImages,
          missingImages: fields.missingImages,
          criticalPanelsCount: fields.criticalPanelsCount,
          criticalPanelsBlocked: fields.criticalPanelsBlocked,
          criticalPanelsMissingQa: fields.criticalPanelsMissingQa,
          reviewBlockedReason: fields.reviewBlockedReason,
        },
      });
    }
    updated += 1;
  }

  console.log(JSON.stringify({ ok: true, dryRun, scanned: chapters.length, updated }, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    prisma.$disconnect();
    process.exit(1);
  });

