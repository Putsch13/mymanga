/**
 * MOAT-1 — Évolution canonique cross-chapitre.
 *
 * Pour un personnage donné, retourne la timeline des chapitres dans lesquels
 * il apparaît avec :
 *  - meilleure image (panelCast.focus = ce perso, score consistency max)
 *  - événements canon (CanonTimelineEvent) associés
 *  - changements canon (CanonChangeRequest) associés
 *
 * Cette route est read-only et n'effectue aucune génération IA.
 */
import { NextResponse } from "next/server";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedCharacter } from "@/lib/ownership";
import { signSupabaseUrlIfNeeded } from "@/lib/images/sign-supabase-url";

type Ctx = { params: Promise<{ characterId: string }> };

interface PanelCastFocus {
  characterId?: string | null;
  name?: string | null;
}
interface PanelCastShape {
  focus?: PanelCastFocus | null;
  supporting?: Array<{ characterId?: string | null; name?: string | null }> | null;
}

function isCharacterInPanelCast(
  panelCast: unknown,
  characterId: string,
  characterName: string,
): { isFocus: boolean; isPresent: boolean } {
  if (!panelCast || typeof panelCast !== "object") return { isFocus: false, isPresent: false };
  const cast = panelCast as PanelCastShape;
  const focusMatchById = cast.focus?.characterId === characterId;
  const focusMatchByName = !cast.focus?.characterId && cast.focus?.name === characterName;
  const isFocus = focusMatchById || focusMatchByName;
  const inSupporting = (cast.supporting ?? []).some(
    (s) => (s.characterId === characterId) || (!s.characterId && s.name === characterName),
  );
  return { isFocus, isPresent: isFocus || inSupporting };
}

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { characterId } = await ctx.params;

  const character = await getOwnedCharacter(user.id, characterId);
  if (!character) return notFound();
  const projectId = character.projectId;
  const characterName = character.name;

  const [chapters, timelineEvents, changeRequests] = await Promise.all([
    prisma.chapter.findMany({
      where: { projectId },
      orderBy: { chapterNumber: "asc" },
      include: {
        scenes: {
          include: {
            images: {
              select: {
                id: true,
                panelNumber: true,
                imageUrl: true,
                persistedUrl: true,
                consistencyScore: true,
                panelCast: true,
                status: true,
              },
            },
          },
        },
      },
    }),
    prisma.canonTimelineEvent.findMany({
      where: { projectId, subjectCharacterId: characterId },
      orderBy: [{ chapterNumber: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        chapterId: true,
        chapterNumber: true,
        eventType: true,
        title: true,
        description: true,
        importance: true,
        irreversible: true,
        createdAt: true,
      },
    }),
    prisma.canonChangeRequest.findMany({
      where: { projectId, characterId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        chapterId: true,
        type: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);

  const timelineByChapter = new Map<string, typeof timelineEvents>();
  for (const e of timelineEvents) {
    if (!e.chapterId) continue;
    const arr = timelineByChapter.get(e.chapterId) ?? [];
    arr.push(e);
    timelineByChapter.set(e.chapterId, arr);
  }
  const changesByChapter = new Map<string, typeof changeRequests>();
  for (const c of changeRequests) {
    if (!c.chapterId) continue;
    const arr = changesByChapter.get(c.chapterId) ?? [];
    arr.push(c);
    changesByChapter.set(c.chapterId, arr);
  }

  const evolution = [];
  for (const chapter of chapters) {
    let bestImage: {
      sceneImageId: string;
      url: string | null;
      consistencyScore: number | null;
      isFocus: boolean;
    } | null = null;
    let appearancesCount = 0;

    for (const scene of chapter.scenes) {
      for (const img of scene.images) {
        const presence = isCharacterInPanelCast(img.panelCast, characterId, characterName);
        if (!presence.isPresent) continue;
        if (img.status !== "completed" && img.status !== "ready") continue;
        appearancesCount += 1;
        const url = img.persistedUrl ?? img.imageUrl;
        if (!url) continue;
        const score = typeof img.consistencyScore === "number" ? img.consistencyScore : null;
        const candidate = {
          sceneImageId: img.id,
          url,
          consistencyScore: score,
          isFocus: presence.isFocus,
        };
        if (!bestImage) {
          bestImage = candidate;
          continue;
        }
        // Préférer focus + score plus haut
        if (candidate.isFocus && !bestImage.isFocus) {
          bestImage = candidate;
        } else if (candidate.isFocus === bestImage.isFocus) {
          if ((candidate.consistencyScore ?? 0) > (bestImage.consistencyScore ?? 0)) {
            bestImage = candidate;
          }
        }
      }
    }

    if (appearancesCount === 0 && !timelineByChapter.has(chapter.id) && !changesByChapter.has(chapter.id)) {
      continue;
    }

    let signedUrl: string | null = null;
    if (bestImage?.url) {
      signedUrl = (await signSupabaseUrlIfNeeded(bestImage.url)) ?? bestImage.url;
    }

    evolution.push({
      chapterId: chapter.id,
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      status: chapter.status,
      appearancesCount,
      bestImage: bestImage
        ? {
            sceneImageId: bestImage.sceneImageId,
            url: signedUrl,
            consistencyScore: bestImage.consistencyScore,
            isFocus: bestImage.isFocus,
          }
        : null,
      events: (timelineByChapter.get(chapter.id) ?? []).map((e) => ({
        id: e.id,
        eventType: e.eventType,
        title: e.title,
        description: e.description,
        importance: e.importance,
        irreversible: e.irreversible,
      })),
      changes: (changesByChapter.get(chapter.id) ?? []).map((c) => ({
        id: c.id,
        type: c.type,
        status: c.status,
      })),
    });
  }

  return NextResponse.json({
    characterId,
    characterName,
    projectId,
    chapters: evolution,
  });
}
