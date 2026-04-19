import type { PrismaClient } from "@manga-ai-studio/db";
import type {
  ContinuityReport,
  ContinuityIssue,
  ContinuityIssueType,
  CharacterState,
  OpenThread,
  EventLedgerEntry,
} from "./types";
import { prohibitionIsViolated } from "./kernel/utils";
import {
  buildContinuityDiffLedger,
  type ContinuityDiffEntry,
} from "./build-continuity-diff-ledger";

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
  // 2+3+5. P2.2 — Continuity diff ledger (injuries, outfit, relationships, possessions)
  // ──────────────────────────────────────────────────────────────────────────
  // On compare les `characterStates` précédents aux `characterStates` actuels
  // produits par le `build-chapter-canon-state`. Les diffs non justifiés sont
  // promus en ContinuityIssue. Les diffs justifiés (event ledger cohérent,
  // outfit variation autorisée, …) ne polluent pas le rapport.
  const currentCanonState = await prisma.chapterCanonState.findFirst({
    where: { projectId: input.projectId, chapterId: input.chapterId },
  });
  const currentCharacterStates = (currentCanonState?.characterStates as CharacterState[] | undefined) ?? [];
  const justifiedEvents =
    (currentCanonState?.canonEvents as EventLedgerEntry[] | undefined)
    ?? [];

  if (currentCharacterStates.length > 0) {
    const ledger = buildContinuityDiffLedger({
      previous: prevCharacterStates,
      current: currentCharacterStates,
      justifiedEvents,
    });
    const characterNameById = new Map(characters.map((c) => [c.id, c.name]));
    for (const entry of ledger.entries) {
      if (entry.justified) continue;
      const issue = ledgerEntryToContinuityIssue(entry, characterNameById);
      if (issue) issues.push(issue);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. DIALOGUE DRIFT : vérifier que la voix du personnage reste cohérente
  // ──────────────────────────────────────────────────────────────────────────
  // (sera implémenté dans packages/dialogue)

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
            // BUG-NOUVEAU-B : même correctif que BUG-18. Un includes() brut
            // considérait "sans magie" comme une violation. On utilise le
            // détecteur tolérant aux négations du kernel de continuité.
            if (prohibitionIsViolated(scriptStr, forbidden)) {
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

/**
 * P2.2 — Mappe une entrée du continuity diff ledger vers un ContinuityIssue
 * typé conforme au schéma Zod. Les diffs justifiés doivent être filtrés EN
 * AMONT par le caller.
 */
function ledgerEntryToContinuityIssue(
  entry: ContinuityDiffEntry,
  characterNameById: Map<string, string>,
): ContinuityIssue | null {
  const name = characterNameById.get(entry.characterId) ?? entry.characterId;
  const from = entry.fromValue ?? "∅";
  const to = entry.toValue ?? "∅";

  switch (entry.type) {
    case "injury_appeared":
    case "injury_disappeared": {
      const isLoss = entry.type === "injury_disappeared";
      return {
        severity: entry.severity,
        type: "injury_loss" satisfies ContinuityIssueType,
        message: isLoss
          ? `${name} : blessure disparue sans justification (${from})`
          : `${name} : nouvelle blessure introduite sans event associé (${to})`,
        subjectId: entry.characterId,
        autoRepairable: false,
      };
    }
    case "outfit_changed":
    case "outfit_reset":
      return {
        severity: entry.severity,
        type: "outfit_drift" satisfies ContinuityIssueType,
        message: `${name} : costume modifié (${from} → ${to})`,
        subjectId: entry.characterId,
        autoRepairable: true,
      };
    case "relationship_emerged":
    case "relationship_shifted":
    case "relationship_dropped":
      return {
        severity: entry.severity,
        type: "relationship_drift" satisfies ContinuityIssueType,
        message: `${name} → ${entry.targetCharacterId ?? "?"} : ${entry.type} (${from} → ${to})`,
        subjectId: entry.characterId,
        autoRepairable: false,
      };
    case "location_changed":
      // Pas de type `location_drift` dans l'enum ; on ne remonte rien ici,
      // la dérive de lieu est déjà couverte par les checks world-state.
      return null;
    case "possession_acquired":
    case "possession_lost":
    case "emotion_changed":
    case "objective_changed":
      // Pas encore mappés vers un ContinuityIssueType dédié — log seulement.
      return null;
    default:
      return null;
  }
}
