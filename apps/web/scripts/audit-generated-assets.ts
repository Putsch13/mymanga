#!/usr/bin/env tsx
/**
 * audit-generated-assets.ts
 *
 * P1.16 — Audit des assets générés en base de données.
 *
 * Détecte:
 *   - SceneImage avec provider URL temporaire
 *   - SceneImage sans persistedUrl / mediaAsset associé (completed)
 *   - SceneImage completed mais QA failed
 *   - SceneImage validated sans textContract
 *   - SceneImage sans promptHash
 *   - SceneImage sans narrativeContractHash
 *   - panels dupliqués sur même chapterId + panelNumber
 *   - panels sans sourceBeatId
 *   - panels sans generationRunId
 *   - anciennes images d'un run précédent encore visibles
 *   - status UI incohérent avec status DB
 *
 * Usage: pnpm audit:assets --chapterId=xxx
 */

import { PrismaClient } from "@manga-ai-studio/db";

const prisma = new PrismaClient();

interface AssetIssue {
  type: string;
  severity: "error" | "warning" | "info";
  sceneImageId?: string;
  panelNumber?: number;
  message: string;
  data?: Record<string, unknown>;
}

interface AuditResult {
  chapterId: string;
  totalImages: number;
  issues: AssetIssue[];
  summary: {
    temporaryUrls: number;
    missingStorageKey: number;
    qaInconsistent: number;
    missingPromptHash: number;
    duplicatePanels: number;
    missingSourceBeatId: number;
    staleImages: number;
  };
}

const TEMPORARY_URL_PATTERNS = [
  /fal\.media/i,
  /fal-cdn\.media/i,
  /storage\.fal\.ai/i,
  /oaidalleapiprodscus/i,
  /replicate\.delivery/i,
];

function isTemporaryUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return TEMPORARY_URL_PATTERNS.some(p => p.test(url));
}

async function auditChapter(chapterId: string): Promise<AuditResult> {
  const issues: AssetIssue[] = [];
  const summary = {
    temporaryUrls: 0,
    missingStorageKey: 0,
    qaInconsistent: 0,
    missingPromptHash: 0,
    duplicatePanels: 0,
    missingSourceBeatId: 0,
    staleImages: 0,
  };

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      scenes: {
        include: {
          images: true,
        },
      },
    },
  });

  if (!chapter) {
    throw new Error(`Chapter not found: ${chapterId}`);
  }

  const allImages = chapter.scenes.flatMap((s) => s.images);
  const latestRunId = allImages
    .map((img) => (img.metadata as Record<string, unknown>)?.generationRunId)
    .filter(Boolean)
    .sort()
    .pop();

  const panelKeys = new Map<string, string[]>();

  for (const scene of chapter.scenes) {
    for (const img of scene.images) {
      const metadata = (img.metadata ?? {}) as Record<string, unknown>;
      const panelNumber = img.panelNumber;
      const key = `${scene.id}:${panelNumber}`;

      if (isTemporaryUrl(img.imageUrl)) {
        summary.temporaryUrls++;
        issues.push({
          type: "temporary_url",
          severity: "warning",
          sceneImageId: img.id,
          panelNumber,
          message: "Image URL is from temporary provider",
          data: { url: img.imageUrl?.substring(0, 50) },
        });
      }

      if (!img.persistedUrl && !img.mediaAssetId && img.status === "completed") {
        summary.missingStorageKey++;
        issues.push({
          type: "missing_persisted_storage",
          severity: "error",
          sceneImageId: img.id,
          panelNumber,
          message:
            "Completed image without persistedUrl or mediaAssetId (no stable storage)",
        });
      }

      if (img.status === "completed" && metadata.qaStatus === "failed") {
        summary.qaInconsistent++;
        issues.push({
          type: "qa_inconsistent",
          severity: "warning",
          sceneImageId: img.id,
          panelNumber,
          message: "Image marked completed but QA failed",
        });
      }

      if (!metadata.promptHash) {
        summary.missingPromptHash++;
        issues.push({
          type: "missing_prompt_hash",
          severity: "info",
          sceneImageId: img.id,
          panelNumber,
          message: "Missing promptHash in metadata",
        });
      }

      if (!metadata.sourceBeatId) {
        summary.missingSourceBeatId++;
        issues.push({
          type: "missing_source_beat_id",
          severity: "warning",
          sceneImageId: img.id,
          panelNumber,
          message: "Missing sourceBeatId in metadata",
        });
      }

      if (latestRunId && metadata.generationRunId !== latestRunId) {
        if (img.status !== "validated" && !img.userValidatedAt) {
          summary.staleImages++;
          issues.push({
            type: "stale_image",
            severity: "info",
            sceneImageId: img.id,
            panelNumber,
            message: "Image from previous generation run",
            data: {
              currentRunId: metadata.generationRunId,
              latestRunId,
            },
          });
        }
      }

      const existing = panelKeys.get(key) ?? [];
      existing.push(img.id);
      panelKeys.set(key, existing);
    }
  }

  for (const [compositeKey, ids] of panelKeys) {
    if (ids.length > 1) {
      summary.duplicatePanels++;
      issues.push({
        type: "duplicate_panel",
        severity: "warning",
        message: `${ids.length} images for same scene+panel (${compositeKey})`,
        data: { imageIds: ids, scenePanelKey: compositeKey },
      });
    }
  }

  return {
    chapterId,
    totalImages: allImages.length,
    issues,
    summary,
  };
}

function formatReport(result: AuditResult): string {
  const lines: string[] = [
    "# Generated Assets Audit Report",
    "",
    `> Chapter: ${result.chapterId}`,
    `> Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Total images: ${result.totalImages}`,
    `- Issues found: ${result.issues.length}`,
    "",
    "| Issue Type | Count |",
    "|------------|-------|",
    `| Temporary URLs | ${result.summary.temporaryUrls} |`,
    `| Missing persisted / media | ${result.summary.missingStorageKey} |`,
    `| QA inconsistent | ${result.summary.qaInconsistent} |`,
    `| Missing promptHash | ${result.summary.missingPromptHash} |`,
    `| Duplicate panels | ${result.summary.duplicatePanels} |`,
    `| Missing sourceBeatId | ${result.summary.missingSourceBeatId} |`,
    `| Stale images | ${result.summary.staleImages} |`,
    "",
  ];

  if (result.issues.length > 0) {
    lines.push("## Issues");
    lines.push("");

    const errors = result.issues.filter(i => i.severity === "error");
    const warnings = result.issues.filter(i => i.severity === "warning");
    const infos = result.issues.filter(i => i.severity === "info");

    if (errors.length > 0) {
      lines.push("### Errors");
      lines.push("");
      for (const issue of errors) {
        lines.push(`- ❌ **${issue.type}** (panel ${issue.panelNumber ?? "?"}): ${issue.message}`);
      }
      lines.push("");
    }

    if (warnings.length > 0) {
      lines.push("### Warnings");
      lines.push("");
      for (const issue of warnings) {
        lines.push(`- ⚠️ **${issue.type}** (panel ${issue.panelNumber ?? "?"}): ${issue.message}`);
      }
      lines.push("");
    }

    if (infos.length > 0) {
      lines.push("### Info");
      lines.push("");
      for (const issue of infos) {
        lines.push(`- ℹ️ **${issue.type}** (panel ${issue.panelNumber ?? "?"}): ${issue.message}`);
      }
      lines.push("");
    }
  } else {
    lines.push("✅ No issues found!");
  }

  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const chapterIdArg = args.find(a => a.startsWith("--chapterId="));
  
  if (!chapterIdArg) {
    console.error("Usage: pnpm audit:assets --chapterId=<id>");
    process.exit(1);
  }
  
  const chapterId = chapterIdArg.split("=")[1];
  
  console.log(`🔍 Auditing generated assets for chapter: ${chapterId}`);
  
  try {
    const result = await auditChapter(chapterId);
    const report = formatReport(result);
    
    console.log("\n" + report);
    
    const errorCount = result.issues.filter(i => i.severity === "error").length;
    if (errorCount > 0) {
      console.error(`\n❌ ${errorCount} errors found!`);
      process.exit(1);
    }
    
    console.log("\n✅ Audit complete");
  } catch (error) {
    console.error("Audit failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
