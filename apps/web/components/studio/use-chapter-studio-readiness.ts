/**
 * P5.2 — Hook recalculant en temps réel le `readinessReport` et le
 * `premiumReadinessDashboard` à partir du `draft` local du studio.
 *
 * Pourquoi pas le snapshot DB ?
 *   - Les blocants disparaissent dès que l'utilisateur remplit un champ,
 *     sans attendre l'autosave (UX réactive).
 *   - Le dashboard premium recalculé en mémoire évite la latence d'aller-
 *     retour avec le serveur.
 *
 * Les deux exceptions (try/catch) tolèrent un draft incomplet (ex. transition
 * d'étape). On retombe alors sur la dernière valeur persistée du snapshot.
 */
import { useMemo } from "react";
import {
  buildChapterReadinessReport,
  type ChapterStudioData,
  type ChapterStudioSnapshot,
} from "@manga-ai-studio/core";
import { buildPremiumReadinessDashboard } from "@/lib/readiness/build-premium-readiness-dashboard";

type LiveReadiness = ReturnType<typeof buildChapterReadinessReport> | null;
type LivePremiumDashboard = ReturnType<typeof buildPremiumReadinessDashboard> | null;

export function useChapterStudioReadiness(args: {
  draft: ChapterStudioData | null;
  snapshot: ChapterStudioSnapshot | null;
  projectId: string;
  chapterId: string;
  chapterNumber: number | null;
}): {
  liveReadiness: LiveReadiness;
  livePremiumDashboard: LivePremiumDashboard;
} {
  const { draft, snapshot, projectId, chapterId, chapterNumber } = args;

  const liveReadiness = useMemo<LiveReadiness>(() => {
    if (!draft || !snapshot) return null;
    const liveSnapshot: ChapterStudioSnapshot = {
      ...snapshot,
      data: { ...draft },
    };
    try {
      return buildChapterReadinessReport(liveSnapshot);
    } catch {
      return snapshot.data.readinessReport ?? null;
    }
  }, [draft, snapshot]);

  const livePremiumDashboard = useMemo<LivePremiumDashboard>(() => {
    if (!draft || !snapshot) return null;
    const liveSnapshot: ChapterStudioSnapshot = {
      ...snapshot,
      data: { ...draft },
    };
    try {
      return buildPremiumReadinessDashboard({
        snapshot: liveSnapshot,
        projectId,
        chapterId,
        chapterNumber,
      });
    } catch {
      return null;
    }
  }, [draft, snapshot, projectId, chapterId, chapterNumber]);

  return { liveReadiness, livePremiumDashboard };
}
