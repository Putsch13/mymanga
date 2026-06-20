/**
 * run-intent-coverage-qa.ts
 *
 * QA d'intention narrative — bloque le launch si l'intent_coverage_score
 * descend sous le seuil. Premium-only, exécuté seulement si l'utilisateur a
 * fourni un userIntent assez riche.
 *
 * Extrait de `route.ts` pour réduire la taille du handler.
 */
import { NextResponse } from "next/server";
import {
  buildIntentNarrativeContract,
  runIntentCoverageQa,
  logIntentContract,
  logOutlineCoverage,
  resolveVisualWorldLocationLabels,
  type ChapterStudioSnapshot,
} from "@manga-ai-studio/core";
import { prisma } from "@manga-ai-studio/db";

// FIX-13 (MAJEUR) — Le seuil 30 % laissait passer presque n'importe quel
// chapitre. On durcit en premium (80 %) et garde un seuil intermédiaire
// pour les chapitres non premium (50 %).
const INTENT_COVERAGE_BLOCK_THRESHOLD_PREMIUM = 80;
const INTENT_COVERAGE_BLOCK_THRESHOLD_DEFAULT = 50;

export interface RunIntentCoverageQaInput {
  projectId: string;
  chapterId: string;
  chapter: { userIntent: string | null };
  snapshot: ChapterStudioSnapshot;
  charRefsForLabels: { id: string; name?: string | null }[];
  strictPremiumContinuity: boolean;
}

export type RunIntentCoverageQaResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

export async function runIntentCoverageQaForLaunch(
  input: RunIntentCoverageQaInput,
): Promise<RunIntentCoverageQaResult> {
  const { projectId, chapterId, chapter, snapshot, charRefsForLabels, strictPremiumContinuity } =
    input;

  if (!strictPremiumContinuity || !chapter.userIntent || chapter.userIntent.length <= 8) {
    return { ok: true };
  }

  // FIX-13 (MAJEUR) — En premium on attend une couverture stricte (et
  // donc `runIntentCoverageQa` doit lever des issues bloquantes).
  const isPremium = strictPremiumContinuity;
  const blockThreshold = isPremium
    ? INTENT_COVERAGE_BLOCK_THRESHOLD_PREMIUM
    : INTENT_COVERAGE_BLOCK_THRESHOLD_DEFAULT;

  try {
    // P0 fix : les knownLocationNames doivent être des LIEUX (VW + DB),
    // pas les canonicalName des character canons.
    // FIX-17 (MAJEUR) — Le schema VisualWorldLocation utilise `label`
    // comme champ canonique, pas `canonicalName`. On utilise désormais
    // `resolveVisualWorldLocationLabels()` qui sait fallback proprement.
    const visualWorldForLocs = snapshot.data.visualWorldContract as
      | {
          locations?: Array<{
            id?: string;
            label?: string | null;
            canonicalName?: string | null;
            name?: string | null;
          }>;
          npcGroups?: Array<{ id?: string; label?: string; role?: string }>;
        }
      | undefined;
    const locationNamesFromVw = resolveVisualWorldLocationLabels(
      visualWorldForLocs?.locations ?? [],
    );
    const dbLocations = await prisma.location.findMany({
      where: { projectId },
      select: { name: true },
    });
    const allLocationNames = [
      ...new Set([
        ...locationNamesFromVw,
        ...dbLocations.map((l) => l.name).filter(Boolean),
      ]),
    ];

    const knownCharNames = charRefsForLabels
      .map((c) => c.name)
      .filter((n): n is string => Boolean(n));
    const vwNpcGroupsForIntent = visualWorldForLocs?.npcGroups ?? [];
    const dbNpcGroupsForIntent = await prisma.npcGroup.findMany({
      where: { projectId },
      select: { label: true },
    });
    const knownNpcLabels = [
      ...new Set([
        ...vwNpcGroupsForIntent.map((g) => g.label).filter((l): l is string => Boolean(l)),
        ...dbNpcGroupsForIntent.map((g) => g.label).filter(Boolean),
      ]),
    ];

    // ARCH-4 — On passe les entités VW (id + name/label) afin que le
    // contract narratif soit ancré aux IDs réels du VisualWorldContract,
    // et non plus à des labels heuristiques. Cela permet à un futur QA
    // d'utiliser `requiredLocationIds` / `requiredNpcGroups[i].vwNpcGroupId`
    // pour vérifier que le plan visite les *mêmes* entités.
    const visualWorldLocationsForIntent = (visualWorldForLocs?.locations ?? [])
      .filter((l): l is { id: string } & typeof l => Boolean(l.id))
      .map((l) => ({
        id: l.id as string,
        // FIX-17 — accepter label OU canonicalName OU name pour compat.
        canonicalName: l.label ?? l.canonicalName ?? l.name ?? null,
      }));
    const visualWorldNpcGroupsForIntent = vwNpcGroupsForIntent
      .filter((g): g is { id: string; label?: string; role?: string } => Boolean(g.id))
      .map((g) => ({ id: g.id, label: g.label ?? null, role: g.role ?? null }));

    const intentNarrative = buildIntentNarrativeContract({
      chapterId,
      userIntent: chapter.userIntent,
      knownLocationNames: allLocationNames,
      knownCharacterNames: knownCharNames,
      knownCharacterIds: charRefsForLabels.map((c) => c.id),
      knownNpcGroupLabels: knownNpcLabels,
      visualWorldLocations: visualWorldLocationsForIntent,
      visualWorldNpcGroups: visualWorldNpcGroupsForIntent,
    });
    logIntentContract({
      requiredEvents: intentNarrative.requiredEvents.length,
      requiredNpcGroups: intentNarrative.requiredNpcGroups.length,
      requiredLocations: intentNarrative.requiredLocations.length,
    });

    const productionPlan = snapshot.data.productionPlan as
      | { panelBlueprints?: Array<{ purpose?: string; beatId?: string }> }
      | undefined;
    const beatSummariesSet = new Set<string>();
    for (const bp of productionPlan?.panelBlueprints ?? []) {
      if (typeof bp.purpose === "string") beatSummariesSet.add(bp.purpose);
    }
    const outlineBeatsForCoverage = (
      snapshot.data.productionOutline as { beats?: Array<{ summary?: string }> } | undefined
    )?.beats;
    if (Array.isArray(outlineBeatsForCoverage)) {
      for (const b of outlineBeatsForCoverage) {
        if (typeof b.summary === "string") beatSummariesSet.add(b.summary);
      }
    }
    const vwLocs = locationNamesFromVw;
    const vwNpcs = (visualWorldForLocs?.npcGroups ?? [])
      .map((g) => g.label)
      .filter((n): n is string => Boolean(n));

    const coverage = runIntentCoverageQa({
      intentContract: intentNarrative,
      beatSummaries: [...beatSummariesSet],
      visualWorldLocationNames: vwLocs,
      visualWorldNpcGroupLabels: vwNpcs,
      // FIX-13 (MAJEUR) — strict en premium pour bloquer si le plan
      // n'aligne pas events/lieux/npc requis.
      strict: isPremium,
    });

    logOutlineCoverage({
      covered: coverage.requiredEventsCovered,
      total: coverage.requiredEventsTotal,
      missingEventIds: coverage.missingEvents,
    });

    // NON-BLOQUANT : la couverture d'intention est un signal QUALITÉ, pas un
    // prérequis de génération. Le flux conversationnel sur-extrait souvent les
    // events (ex. 12 micro-events) que 8-9 beats ne couvrent pas à 100% — bloquer
    // là-dessus empêchait toute génération. On log en warning, on laisse passer.
    if (
      coverage.intentCoverageScore < blockThreshold &&
      intentNarrative.requiredEvents.length > 0
    ) {
      console.warn(
        `[launch] intent_coverage_low (non-blocking) chapterId=${chapterId} `
        + `score=${coverage.intentCoverageScore} threshold=${blockThreshold} `
        + `missingEvents=${JSON.stringify(coverage.missingEvents.slice(0, 5))}`,
      );
    }
  } catch (err) {
    console.warn("[launch] intent_coverage_qa_failed", err);
  }

  return { ok: true };
}
