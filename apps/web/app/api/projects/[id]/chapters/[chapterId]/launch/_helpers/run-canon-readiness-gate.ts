/**
 * Gate "canon readiness" sur les personnages critiques — **advisory only**.
 *
 * Wraps `assertChapterCanonReadiness` :
 *   - Violations `blocking` → logguées mais ne bloquent plus le launch.
 *   - Warnings → log.
 *   - Exception inattendue → log et on continue.
 */
import { assertChapterCanonReadiness } from "@/lib/canon/assert-chapter-canon-readiness";

export type RunCanonReadinessGateResult = { ok: true };

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
      console.warn(
        `[launch] canon_readiness_advisory chapterId=${chapterId} `
        + `violations=${JSON.stringify(
          blockingViolations.map((v) => ({ id: v.characterId, score: v.score, reason: v.reason })),
        )} — lancement autorisé : readiness informatif uniquement`,
      );
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
