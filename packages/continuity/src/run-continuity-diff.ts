import type { PrismaClient } from "@manga-ai-studio/db";
import type {
  ContinuityReport,
  ContinuityIssue,
  CharacterState,
  OpenThread,
} from "./types";

/**
 * Exécute une analyse de cohérence avant validation finale du chapitre.
 * Vérifie : visual drift, dialogue drift, injury loss, outfit drift,
 * relationship drift, lore violation, timeline violation, thread drop, causality break.
 */
export async function runContinuityDiff(
  prisma: PrismaClient,
  input: {
    projectId: string;
    chapterId: string;
    chapterNumber: number;
    outline: unknown;
    script: unknown;
    generatedImages?: Array<{
      id: string;
      sceneId?: string;
      metadata?: unknown;
    }>;
    generatedDialogues?: Array<{
      sceneId?: string;
      characterId?: string;
      text?: string;
    }>;
  },
): Promise<ContinuityReport> {
  const issues: ContinuityIssue[] = [];

  // Charger le canon state précédent
  const previousCanonState = await prisma.chapterCanonState.findFirst({
    where: {
      projectId: input.projectId,
      chapterNumber: { lt: input.chapterNumber },
    },
    orderBy: { chapterNumber: "desc" },
  });

  if (!previousCanonState) {
    // Premier chapitre : pas de diff possible
    return {
      score: 1.0,
      issues: [],
      suggestedRepairs: [],
    };
  }

  const prevCharacterStates = previousCanonState.characterStates as CharacterState[];
  const prevOpenThreads = previousCanonState.openThreads as OpenThread[];

  // ──────────────────────────────────────────────────────────────────────────
  // 1. VISUAL DRIFT : vérifier que les traits verrouillés ne changent pas
  // ──────────────────────────────────────────────────────────────────────────
  const characters = await prisma.character.findMany({
    where: { projectId: input.projectId },
  });

  for (const char of characters) {
    const prevState = prevCharacterStates.find((cs) => cs.characterId === char.id);
    if (!prevState) continue;

    const lockedAppearance = prevState.appearanceLocked;

    // Vérifier hairColor, eyeColor, silhouette, scars, tattoos, fixedAccessories
    const stableVisualDNA = char.stableVisualDNA as {
      hairColor?: string;
      eyeColor?: string;
      silhouette?: string;
      scars?: string[];
      tattoos?: string[];
      fixedAccessories?: string[];
    } | undefined;

    if (lockedAppearance.hairColor && stableVisualDNA?.hairColor !== lockedAppearance.hairColor) {
      issues.push({
        severity: "critical",
        type: "visual_drift",
        message: `${char.name} : couleur de cheveux changeante (canon: ${lockedAppearance.hairColor}, actuel: ${stableVisualDNA?.hairColor ?? "none"})`,
        subjectId: char.id,
        autoRepairable: false,
      });
    }

    if (lockedAppearance.eyeColor && stableVisualDNA?.eyeColor !== lockedAppearance.eyeColor) {
      issues.push({
        severity: "critical",
        type: "visual_drift",
        message: `${char.name} : couleur des yeux changeante (canon: ${lockedAppearance.eyeColor}, actuel: ${stableVisualDNA?.eyeColor ?? "none"})`,
        subjectId: char.id,
        autoRepairable: false,
      });
    }

    // Vérifier scars permanentes : si une cicatrice était présente, elle doit rester
    if (lockedAppearance.scars.length > 0) {
      const currentScars = stableVisualDNA?.scars ?? [];
      const missingScars = lockedAppearance.scars.filter((scar) => !currentScars.includes(scar));
      if (missingScars.length > 0) {
        issues.push({
          severity: "major",
          type: "injury_loss",
          message: `${char.name} : cicatrices manquantes (${missingScars.join(", ")})`,
          subjectId: char.id,
          autoRepairable: true,
        });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. INJURY LOSS : vérifier que les blessures courantes ne disparaissent pas sans justification
  // ──────────────────────────────────────────────────────────────────────────
  for (const prevState of prevCharacterStates) {
    const currentChar = characters.find((c) => c.id === prevState.characterId);
    if (!currentChar) continue;

    if (prevState.currentState.injuries.length > 0) {
      // Vérifier si des blessures ont disparu (heuristique simple : on suppose qu'elles doivent rester au moins 1 chapitre)
      // TODO: enrichir avec un système de persistance de blessure (durée, guérison, etc.)
      issues.push({
        severity: "minor",
        type: "injury_loss",
        message: `${currentChar.name} : vérifier la persistance des blessures (${prevState.currentState.injuries.join(", ")})`,
        subjectId: currentChar.id,
        autoRepairable: false,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. OUTFIT DRIFT : vérifier que le costume ne change pas sans transition
  // ──────────────────────────────────────────────────────────────────────────
  // (heuristique basique : si outfit était X, et devient Y sans mention dans le script, c'est suspect)
  // TODO: implémenter une vérification plus fine avec analyse du script

  // ──────────────────────────────────────────────────────────────────────────
  // 4. DIALOGUE DRIFT : vérifier que la voix du personnage reste cohérente
  // ──────────────────────────────────────────────────────────────────────────
  // (sera implémenté dans packages/dialogue)

  // ──────────────────────────────────────────────────────────────────────────
  // 5. RELATIONSHIP DRIFT : vérifier que les relations ne repartent pas à zéro
  // ──────────────────────────────────────────────────────────────────────────
  // TODO: comparer relationshipStates entre previousCanonState et currentCanonState

  // ──────────────────────────────────────────────────────────────────────────
  // 6. THREAD DROP : vérifier que les fils narratifs ouverts ne sont pas abandonnés
  // ──────────────────────────────────────────────────────────────────────────
  if (prevOpenThreads.length > 0) {
    const scriptStr = JSON.stringify(input.script).toLowerCase();
    for (const thread of prevOpenThreads) {
      if (thread.priority === "high") {
        // Thread haute priorité : doit être mentionné ou avancé dans ce chapitre
        const threadKeywords = thread.label.toLowerCase().split(" ");
        const mentionsCount = threadKeywords.filter((kw) => scriptStr.includes(kw)).length;
        if (mentionsCount === 0) {
          issues.push({
            severity: "major",
            type: "thread_drop",
            message: `Fil narratif haute priorité abandonné : ${thread.label}`,
            subjectId: null,
            autoRepairable: false,
          });
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 7. LORE VIOLATION : vérifier que les règles du monde sont respectées
  // ──────────────────────────────────────────────────────────────────────────
  const storyBible = await prisma.storyBible.findUnique({
    where: { projectId: input.projectId },
  });

  if (storyBible?.lore) {
    const loreObj = storyBible.lore as {
      hardRules?: Array<{ rule: string }>;
      forbiddenLoreDrift?: string[];
    };
    if (loreObj.hardRules) {
      const scriptStr = JSON.stringify(input.script).toLowerCase();
      for (const rule of loreObj.hardRules) {
        // Heuristique simple : vérifier si des mots-clés de la règle sont violés
        // TODO: LLM-based violation detection
        if (loreObj.forbiddenLoreDrift) {
          for (const forbidden of loreObj.forbiddenLoreDrift) {
            if (scriptStr.includes(forbidden.toLowerCase())) {
              issues.push({
                severity: "major",
                type: "lore_violation",
                message: `Possible violation de règle du monde : ${rule.rule} (détecté: ${forbidden})`,
                subjectId: null,
                autoRepairable: false,
              });
            }
          }
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 8. TIMELINE VIOLATION : vérifier que la chronologie est cohérente
  // ──────────────────────────────────────────────────────────────────────────
  // TODO: implémenter une vérification de chronologie basée sur les events

  // ──────────────────────────────────────────────────────────────────────────
  // 9. CAUSALITY BREAK : vérifier qu'une conséquence d'un événement précédent n'est pas ignorée
  // ──────────────────────────────────────────────────────────────────────────
  // TODO: implémenter une analyse de causalité

  // Calculer score global
  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const majorCount = issues.filter((i) => i.severity === "major").length;
  const minorCount = issues.filter((i) => i.severity === "minor").length;

  let score = 1.0;
  score -= criticalCount * 0.3;
  score -= majorCount * 0.1;
  score -= minorCount * 0.03;
  score = Math.max(0, score);

  // Suggested repairs
  const suggestedRepairs: string[] = [];
  if (criticalCount > 0) {
    suggestedRepairs.push("Corriger les dérives visuelles critiques avant publication.");
  }
  if (issues.some((i) => i.type === "thread_drop")) {
    suggestedRepairs.push("Réintégrer ou résoudre les fils narratifs abandonnés.");
  }

  return {
    score,
    issues,
    suggestedRepairs,
  };
}
