/**
 * P5.2 — Gate "canon readiness" sur les personnages critiques.
 *
 * Wraps `assertChapterCanonReadiness` :
 *   - Si une violation `blocking` est détectée → renvoie 422 avec premiumErrors.
 *   - Si seulement des warnings → log mais autorise le launch.
 *   - Si le check échoue (exception inattendue) → on log et on continue (non-bloquant).
 */
import { NextResponse } from "next/server";
import { assertChapterCanonReadiness } from "@/lib/canon/assert-chapter-canon-readiness";
import { canonViolationsToPremiumErrors } from "@/shared/errors/generation-errors";

export type RunCanonReadinessGateResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

export async function runCanonReadinessGate(args: {
  projectId: string;
  chapterId: string;
  requiredCharacterIds: string[];
}): Promise<RunCanonReadinessGateResult> {
  const { projectId, chapterId, requiredCharacterIds } = args;

  try {
    const canonReport = await assertChapterCanonReadiness({
      projectId,
      requiredCharacterIds: requiredCharacterIds.length > 0 ? requiredCharacterIds : null,
    });

    if (canonReport.blocking) {
      const blockingViolations = canonReport.violations.filter((v) => v.severity === "blocking");
      const premiumErrors = canonViolationsToPremiumErrors(blockingViolations, { projectId, chapterId });
      const leadUserMessage =
        premiumErrors[0]?.userMessage
        ?? "Un ou plusieurs personnages critiques n’ont pas une assise canonique suffisante pour lancer le chapitre.";
      console.warn(
        `[launch] canon_readiness_blocked chapterId=${chapterId} `
        + `violations=${JSON.stringify(
          blockingViolations.map((v) => ({ id: v.characterId, score: v.score, reason: v.reason })),
        )}`,
      );
      return {
        ok: false,
        response: NextResponse.json(
          {
            error:
              "Un ou plusieurs personnages critiques (héros, antagoniste, lockés) "
              + "n'ont pas une assise canonique suffisante pour lancer le chapitre. "
              + "Régénère leurs visuels canoniques ou active leur visual lock.",
            code: "CANON_READINESS_BLOCKED",
            violations: canonReport.violations,
            thresholds: canonReport.thresholds,
            leadUserMessage,
            premiumErrors,
          },
          { status: 422 },
        ),
      };
    }

    if (canonReport.violations.length > 0) {
      console.warn(
        `[launch] canon_readiness_warnings chapterId=${chapterId} count=${canonReport.violations.length}`,
      );
    }
  } catch (canonErr) {
    console.warn(
      `[launch] canon_readiness_check_failed (non-blocking): ${canonErr instanceof Error ? canonErr.message : canonErr}`,
    );
  }

  return { ok: true };
}
