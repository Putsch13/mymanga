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
  type ChapterStudioSnapshot,
} from "@manga-ai-studio/core";
import { prisma } from "@manga-ai-studio/db";

// Threshold lowered to 30 — heuristic word-overlap between user-intent
// sentences and beat summaries is too fragile for a hard block at 60%.
// La QA structurelle + le score de confiance protègent déjà la qualité.
const INTENT_COVERAGE_BLOCK_THRESHOLD = 30;

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

function logLaunchBlock(
  projectId: string,
  chapterId: string,
  code: string,
  reason: string,
  extra?: Record<string, unknown>,
) {
  console.warn("[launch:block]", { projectId, chapterId, code, reason, ...extra });
}

export async function runIntentCoverageQaForLaunch(
  input: RunIntentCoverageQaInput,
): Promise<RunIntentCoverageQaResult> {
  const { projectId, chapterId, chapter, snapshot, charRefsForLabels, strictPremiumContinuity } =
    input;

  if (!strictPremiumContinuity || !chapter.userIntent || chapter.userIntent.length <= 8) {
    return { ok: true };
  }

  try {
    // P0 fix : les knownLocationNames doivent être des LIEUX (VW + DB),
    // pas les canonicalName des character canons.
    const visualWorldForLocs = snapshot.data.visualWorldContract as
      | {
          locations?: Array<{ id?: string; canonicalName?: string }>;
          npcGroups?: Array<{ id?: string; label?: string; role?: string }>;
        }
      | undefined;
    const locationNamesFromVw = (visualWorldForLocs?.locations ?? [])
      .map((l) => l.canonicalName)
      .filter((n): n is string => Boolean(n));
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
      .filter((l): l is { id: string; canonicalName?: string } => Boolean(l.id))
      .map((l) => ({ id: l.id, canonicalName: l.canonicalName ?? null }));
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
      strict: false,
    });

    logOutlineCoverage({
      covered: coverage.requiredEventsCovered,
      total: coverage.requiredEventsTotal,
      missingEventIds: coverage.missingEvents,
    });

    if (
      coverage.intentCoverageScore < INTENT_COVERAGE_BLOCK_THRESHOLD &&
      intentNarrative.requiredEvents.length > 0
    ) {
      logLaunchBlock(
        projectId,
        chapterId,
        "INTENT_COVERAGE_TOO_LOW",
        `Intent coverage score=${coverage.intentCoverageScore} below threshold=${INTENT_COVERAGE_BLOCK_THRESHOLD}`,
        { missingEvents: coverage.missingEvents, issues: coverage.issues.slice(0, 5) },
      );
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "intent_coverage_too_low",
            code: "INTENT_COVERAGE_TOO_LOW",
            message:
              `Le plan ne couvre que ${coverage.intentCoverageScore}% de ton intention narrative. ` +
              "Régénère le plan ou vérifie l'intention dans le wizard.",
            intentCoverageScore: coverage.intentCoverageScore,
            missingEvents: coverage.missingEvents,
            coverageIssues: coverage.issues.slice(0, 10),
          },
          { status: 422 },
        ),
      };
    }
  } catch (err) {
    console.warn("[launch] intent_coverage_qa_failed", err);
  }

  return { ok: true };
}
