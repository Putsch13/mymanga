/**
 * SPRINT 1.2 — Review Queue API.
 *
 * GET: Récupère les panels en `manual_review_required` ou avec QA échouée.
 * POST: Actions sur les panels: accept | reject | regenerate.
 *
 * Un panel est considéré "en attente de review" si:
 *   - metadata.finalStatus === "manual_review_required"
 *   - OU metadata.visualQa.passed === false (sans validation manuelle)
 *   - ET metadata.userValidatedAt === null
 */

import { NextResponse } from "next/server";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import type { Prisma } from "@manga-ai-studio/db";

type Metadata = Prisma.JsonObject;

interface ReviewQueuePanel {
  id: string;
  panelNumber: number;
  sceneNumber: number;
  sceneTitle: string | null;
  imageUrl: string | null;
  status: string;
  finalStatus: string | null;
  visualQaPassed: boolean | null;
  visualQaReasons: string[];
  visualQaScore: number | null;
  userValidatedAt: string | null;
  createdAt: string;
}

interface ReviewQueueResponse {
  panels: ReviewQueuePanel[];
  totalCount: number;
  pendingReviewCount: number;
}

function extractMetaField<T>(meta: unknown, key: string, fallback: T): T {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const obj = meta as Record<string, unknown>;
    if (key in obj) return obj[key] as T;
  }
  return fallback;
}

function extractVisualQa(meta: unknown): {
  passed: boolean | null;
  reasons: string[];
  score: number | null;
} {
  const visualQa = extractMetaField<unknown>(meta, "visualQa", null);
  if (!visualQa || typeof visualQa !== "object") {
    return { passed: null, reasons: [], score: null };
  }
  const qa = visualQa as Record<string, unknown>;
  return {
    passed: typeof qa.passed === "boolean" ? qa.passed : null,
    reasons: Array.isArray(qa.reasons) ? qa.reasons.filter((r): r is string => typeof r === "string") : [],
    score: typeof qa.score === "number" ? qa.score : null,
  };
}

function needsReview(meta: unknown): boolean {
  const finalStatus = extractMetaField<string | null>(meta, "finalStatus", null);
  const userValidatedAt = extractMetaField<string | null>(meta, "userValidatedAt", null);

  if (userValidatedAt) return false;

  if (finalStatus === "manual_review_required") return true;

  const qa = extractVisualQa(meta);
  if (qa.passed === false) return true;

  return false;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> },
) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const { id: projectId, chapterId } = await params;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      project: { select: { userId: true } },
      scenes: {
        orderBy: { sceneNumber: "asc" },
        include: {
          images: {
            orderBy: { panelNumber: "asc" },
          },
        },
      },
    },
  });

  if (!chapter || chapter.projectId !== projectId) {
    return notFound();
  }

  if (chapter.project.userId !== user.id) {
    return unauthorized();
  }

  const panels: ReviewQueuePanel[] = [];
  let pendingReviewCount = 0;

  for (const scene of chapter.scenes) {
    for (const image of scene.images) {
      const meta = image.metadata as Metadata | null;
      const isReview = needsReview(meta);

      if (isReview) {
        pendingReviewCount++;
        const qa = extractVisualQa(meta);
        panels.push({
          id: image.id,
          panelNumber: image.panelNumber,
          sceneNumber: scene.sceneNumber,
          sceneTitle: scene.title,
          imageUrl: image.imageUrl,
          status: image.status ?? "unknown",
          finalStatus: extractMetaField(meta, "finalStatus", null),
          visualQaPassed: qa.passed,
          visualQaReasons: qa.reasons,
          visualQaScore: qa.score,
          userValidatedAt: extractMetaField(meta, "userValidatedAt", null),
          createdAt: image.createdAt.toISOString(),
        });
      }
    }
  }

  const response: ReviewQueueResponse = {
    panels,
    totalCount: panels.length,
    pendingReviewCount,
  };

  return NextResponse.json(response);
}

type ReviewAction = "accept" | "reject" | "regenerate";

interface ReviewActionRequest {
  panelId: string;
  action: ReviewAction;
  hints?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> },
) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const { id: projectId, chapterId } = await params;

  const body = (await request.json()) as ReviewActionRequest;
  const { panelId, action, hints } = body;

  if (!panelId || !action) {
    return NextResponse.json({ error: "missing_panelId_or_action" }, { status: 400 });
  }

  if (!["accept", "reject", "regenerate"].includes(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const image = await prisma.sceneImage.findUnique({
    where: { id: panelId },
    include: {
      scene: {
        include: {
          chapter: {
            include: { project: { select: { userId: true } } },
          },
        },
      },
    },
  });

  if (!image || image.scene.chapter.id !== chapterId || image.scene.chapter.projectId !== projectId) {
    return notFound();
  }

  if (image.scene.chapter.project.userId !== user.id) {
    return unauthorized();
  }

  const now = new Date().toISOString();
  const currentMeta = (image.metadata ?? {}) as Record<string, unknown>;

  if (action === "accept") {
    const newMeta: Prisma.JsonObject = {
      ...currentMeta,
      userValidatedAt: now,
      userValidationAction: "accept",
      finalStatus: "passed_by_user",
    };

    await prisma.sceneImage.update({
      where: { id: panelId },
      data: { metadata: newMeta },
    });

    return NextResponse.json({ success: true, action: "accept", panelId });
  }

  if (action === "reject") {
    const newMeta: Prisma.JsonObject = {
      ...currentMeta,
      userValidatedAt: now,
      userValidationAction: "reject",
      userRejectionReason: hints ?? null,
      finalStatus: "rejected_by_user",
    };

    await prisma.sceneImage.update({
      where: { id: panelId },
      data: {
        metadata: newMeta,
        status: "failed",
      },
    });

    return NextResponse.json({ success: true, action: "reject", panelId });
  }

  if (action === "regenerate") {
    const newMeta: Prisma.JsonObject = {
      ...currentMeta,
      userRegenerateRequest: {
        requestedAt: now,
        hints: hints ?? null,
        originalImageUrl: image.imageUrl,
      },
    };

    await prisma.sceneImage.update({
      where: { id: panelId },
      data: {
        metadata: newMeta,
        status: "pending",
        imageUrl: null,
      },
    });

    return NextResponse.json({ success: true, action: "regenerate", panelId });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
