#!/usr/bin/env tsx
/**
 * cleanup-stale-generation-run.ts
 *
 * P1.16 — Nettoie les images obsolètes d'un chapitre.
 *
 * Le cleanup ne doit jamais supprimer:
 *   - images validées manuellement
 *   - images exportées dans un PDF final
 *   - images liées à un run verrouillé
 *
 * Usage:
 *   pnpm cleanup:generation --chapterId=xxx --dry-run
 *   pnpm cleanup:generation --chapterId=xxx --apply
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface CleanupCandidate {
  id: string;
  panelNumber: number | null;
  generationRunId: string | null;
  status: string;
  reason: string;
}

interface CleanupResult {
  chapterId: string;
  candidates: CleanupCandidate[];
  protected: CleanupCandidate[];
  deleted: string[];
  dryRun: boolean;
}

async function findCleanupCandidates(chapterId: string): Promise<{
  candidates: CleanupCandidate[];
  protected: CleanupCandidate[];
}> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      scenes: {
        include: {
          SceneImage: true,
        },
      },
    },
  });

  if (!chapter) {
    throw new Error(`Chapter not found: ${chapterId}`);
  }

  const allImages = chapter.scenes.flatMap(s => s.SceneImage);
  
  const runIds = allImages
    .map(img => (img.metadata as Record<string, unknown>)?.generationRunId as string | undefined)
    .filter((id): id is string => !!id);
  
  const latestRunId = runIds.sort().pop();

  const candidates: CleanupCandidate[] = [];
  const protectedImages: CleanupCandidate[] = [];

  for (const img of allImages) {
    const metadata = (img.metadata ?? {}) as Record<string, unknown>;
    const generationRunId = metadata.generationRunId as string | undefined;

    const isProtected = 
      img.userValidatedAt != null ||
      img.status === "validated" ||
      metadata.exportedToPdf === true ||
      metadata.runLocked === true;

    const isStale = 
      latestRunId &&
      generationRunId &&
      generationRunId !== latestRunId;

    const isDuplicate = allImages.some(
      other => 
        other.id !== img.id &&
        other.panelNumber === img.panelNumber &&
        ((other.metadata as Record<string, unknown>)?.generationRunId === latestRunId ||
         other.userValidatedAt != null)
    );

    const isCandidate = isStale || isDuplicate;

    if (isCandidate) {
      const entry: CleanupCandidate = {
        id: img.id,
        panelNumber: img.panelNumber,
        generationRunId: generationRunId ?? null,
        status: img.status,
        reason: isStale ? "stale_run" : "duplicate",
      };

      if (isProtected) {
        protectedImages.push(entry);
      } else {
        candidates.push(entry);
      }
    }
  }

  return { candidates, protected: protectedImages };
}

async function executeCleanup(
  chapterId: string,
  candidateIds: string[]
): Promise<string[]> {
  const deleted: string[] = [];

  for (const id of candidateIds) {
    try {
      await prisma.sceneImage.delete({
        where: { id },
      });
      deleted.push(id);
    } catch (error) {
      console.warn(`Failed to delete ${id}:`, error);
    }
  }

  return deleted;
}

function formatReport(result: CleanupResult): string {
  const lines: string[] = [
    "# Cleanup Report",
    "",
    `> Chapter: ${result.chapterId}`,
    `> Mode: ${result.dryRun ? "DRY RUN" : "APPLIED"}`,
    `> Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Candidates for cleanup: ${result.candidates.length}`,
    `- Protected (not deleted): ${result.protected.length}`,
    `- Actually deleted: ${result.deleted.length}`,
    "",
  ];

  if (result.protected.length > 0) {
    lines.push("## Protected Images (Not Deleted)");
    lines.push("");
    lines.push("| ID | Panel | Run ID | Status | Reason |");
    lines.push("|----|----|--------|--------|--------|");
    for (const p of result.protected) {
      lines.push(`| ${p.id.slice(0, 8)}... | ${p.panelNumber ?? "-"} | ${p.generationRunId?.slice(0, 8) ?? "-"}... | ${p.status} | ${p.reason} |`);
    }
    lines.push("");
  }

  if (result.candidates.length > 0) {
    lines.push("## Cleanup Candidates");
    lines.push("");
    lines.push("| ID | Panel | Run ID | Status | Reason | Deleted |");
    lines.push("|----|----|--------|--------|--------|---------|");
    for (const c of result.candidates) {
      const deleted = result.deleted.includes(c.id) ? "✅" : "❌";
      lines.push(`| ${c.id.slice(0, 8)}... | ${c.panelNumber ?? "-"} | ${c.generationRunId?.slice(0, 8) ?? "-"}... | ${c.status} | ${c.reason} | ${deleted} |`);
    }
    lines.push("");
  }

  if (result.dryRun && result.candidates.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("⚠️ **DRY RUN** - No images were deleted.");
    lines.push("Run with `--apply` to actually delete these images.");
  }

  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const chapterIdArg = args.find(a => a.startsWith("--chapterId="));
  const applyMode = args.includes("--apply");
  const dryRun = !applyMode;
  
  if (!chapterIdArg) {
    console.error("Usage:");
    console.error("  pnpm cleanup:generation --chapterId=<id> --dry-run");
    console.error("  pnpm cleanup:generation --chapterId=<id> --apply");
    process.exit(1);
  }
  
  const chapterId = chapterIdArg.split("=")[1];
  
  console.log(`🧹 Cleanup for chapter: ${chapterId}`);
  console.log(`   Mode: ${dryRun ? "DRY RUN" : "APPLY"}`);
  
  try {
    const { candidates, protected: protectedImages } = await findCleanupCandidates(chapterId);
    
    let deleted: string[] = [];
    if (!dryRun && candidates.length > 0) {
      console.log(`\n⚠️ About to delete ${candidates.length} images...`);
      deleted = await executeCleanup(chapterId, candidates.map(c => c.id));
    }
    
    const result: CleanupResult = {
      chapterId,
      candidates,
      protected: protectedImages,
      deleted,
      dryRun,
    };
    
    const report = formatReport(result);
    console.log("\n" + report);
    
    if (dryRun && candidates.length > 0) {
      console.log(`\n⚠️ Would delete ${candidates.length} images. Run with --apply to execute.`);
    } else if (deleted.length > 0) {
      console.log(`\n✅ Deleted ${deleted.length} images.`);
    } else {
      console.log("\n✅ Nothing to clean up.");
    }
  } catch (error) {
    console.error("Cleanup failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
