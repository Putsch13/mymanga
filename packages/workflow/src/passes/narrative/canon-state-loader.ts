/**
 * Narrative pass — chargement du canon state et validation du kernel de continuité.
 *
 * Extrait de narrative-pass.ts. Charge :
 *  - le `previousCanonState` (dernier chapitre du projet antérieur à celui-ci) ;
 *  - le `continuityKernel` (source canonique des états personnages/monde) ;
 *  - valide la cohérence kernel vs canon (T06) avec warnings détaillés ;
 *  - retourne `previousCharacterStates` potentiellement mis à jour par le kernel.
 */

import type { prisma as prismaClient } from "@manga-ai-studio/db";
import {
  loadContinuityKernel,
  type CharacterState,
} from "@manga-ai-studio/continuity";

type PrismaClient = typeof prismaClient;

type ChapterCanonStateRow = {
  characterStates: unknown;
} | null;

type ContinuityKernel = Awaited<ReturnType<typeof loadContinuityKernel>>;

export interface CanonStateBundle {
  previousCanonState: ChapterCanonStateRow;
  continuityKernel: ContinuityKernel;
  previousCharacterStates: CharacterState[];
}

export async function loadPreviousCanonStateAndKernel(
  prisma: PrismaClient,
  params: { projectId: string; chapterNumber: number },
): Promise<CanonStateBundle> {
  const { projectId, chapterNumber } = params;

  const previousCanonState = await prisma.chapterCanonState.findFirst({
    where: {
      projectId,
      chapterNumber: { lt: chapterNumber },
    },
    orderBy: { chapterNumber: "desc" },
  });

  const previousCharacterStates: CharacterState[] = previousCanonState?.characterStates
    ? (previousCanonState.characterStates as CharacterState[])
    : [];

  const continuityKernel = await loadContinuityKernel(prisma, {
    projectId,
    beforeChapterNumber: chapterNumber,
  });

  // T06 : le kernel est canonique — on valide la cohérence contre le canon précédent
  // avant toute écriture. Les divergences ne sont pas fatales mais loggées.
  if (continuityKernel.characterStates.length > 0) {
    const { validateKernelCoherence } = await import("@manga-ai-studio/continuity");
    const coherenceResult = validateKernelCoherence(
      continuityKernel,
      previousCanonState
        ? { characterStates: previousCanonState.characterStates as CharacterState[] }
        : null,
    );
    if (!coherenceResult.coherent) {
      console.warn(
        `[continuity:T06] kernel divergence detected: ${coherenceResult.divergences.length} fields differ`,
      );
      for (const d of coherenceResult.divergences.slice(0, 5)) {
        console.warn(
          `  [divergence] ${d.characterName}.${d.field}: kernel=${JSON.stringify(d.kernelValue)} vs canon=${JSON.stringify(d.chapterCanonValue)} → resolved to ${d.resolvedTo}`,
        );
      }
    }
    if (coherenceResult.warnings.length > 0) {
      console.warn(`[continuity:T06] warnings: ${coherenceResult.warnings.join(", ")}`);
    }
    previousCharacterStates.splice(
      0,
      previousCharacterStates.length,
      ...continuityKernel.characterStates,
    );
  }

  return {
    previousCanonState,
    continuityKernel,
    previousCharacterStates,
  };
}
