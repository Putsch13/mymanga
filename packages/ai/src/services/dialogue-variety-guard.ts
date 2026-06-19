/**
 * Garde-fou léger sur la répétition / le ton « catalogue » des textes de case.
 */

export type DialogueVarietyPanelLine = {
  panelId: string;
  text?: string;
  speakerId?: string | null;
  mode: string;
};

export type DialogueVarietyReport = {
  ok: boolean;
  repeatedLineCount: number;
  genericLineCount: number;
  expositionDumpCount: number;
  toneMismatchCount: number;
  issues: string[];
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Anciennes répliques template du pipeline (à détecter comme « génériques »). */
const LEGACY_TEMPLATE_SNIPPETS = [
  "tu ne m'as jamais fait confiance",
  "je ne veux pas te combattre",
  "tout me relie encore a lui",
  "tu es mon ami",
  "je ne veux pas te blesser",
  "je ne cederai pas",
  "je ne céderai pas",
  "la verite c'est que",
];

const GENERIC_ANIME_SNIPPETS = [
  "je dois proteger",
  "je dois devenir plus fort",
  "ce n'est qu'un reve",
  "je ne perdrai pas",
  "je ne perds pas",
];

// SPRINT 5 — clichés FR "remplisseur" (audit v7 : dialogues plats récurrents).
// Ces phrases passent le test sémantique mais font sonner faux les répliques.
// On les détecte comme génériques pour pousser le LLM vers du concret/spécifique.
const FRENCH_CLICHES = [
  "c'est incroyable",
  "ce n'est pas possible",
  "ce n'est pas vrai",
  "je n'arrive pas a y croire",
  "je rêve",
  "je reve",
  "c'est exactement ce que je pense",
  "tu as raison",
  "tu n'as pas tort",
  "quelle surprise",
  "qu'est ce qui se passe",
  "qu'est-ce qui se passe",
  "qu'est ce que tu fais",
  "n'aie pas peur",
  "tout va bien se passer",
  "fais moi confiance",
  "fais-moi confiance",
  "il n'est pas trop tard",
  "ensemble on peut y arriver",
  "on va y arriver",
  "ne baisse pas les bras",
  "ne lache pas",
  "ne lâche pas",
  "courage",
  "tiens bon",
];

function isExpositionDump(text: string): boolean {
  const t = norm(text);
  return t.length > 140 && !/[.!?…]/.test(text.slice(80, 140));
}

export function validateDialogueVariety(input: {
  panelTexts: DialogueVarietyPanelLine[];
  previousDialogueEchoes?: string[];
  genre?: string | null;
  targetAudience?: string | null;
}): DialogueVarietyReport {
  const issues: string[] = [];
  const counts = new Map<string, number>();
  let genericLineCount = 0;
  let expositionDumpCount = 0;

  const echoes = new Set((input.previousDialogueEchoes ?? []).map(norm));

  for (const row of input.panelTexts) {
    const raw = row.text?.trim() ?? "";
    if (!raw) continue;
    const n = norm(raw);
    counts.set(n, (counts.get(n) ?? 0) + 1);

    if (
      LEGACY_TEMPLATE_SNIPPETS.some((s) => n.includes(s))
      || GENERIC_ANIME_SNIPPETS.some((s) => n.includes(s))
      || FRENCH_CLICHES.some((s) => n.includes(s))
    ) {
      genericLineCount += 1;
      issues.push(`generic_line panel=${row.panelId}`);
    }
    if (isExpositionDump(raw)) {
      expositionDumpCount += 1;
      issues.push(`exposition_dump panel=${row.panelId}`);
    }
    if (echoes.has(n)) {
      issues.push(`echo_previous_chapter panel=${row.panelId}`);
    }
  }

  let repeatedLineCount = 0;
  for (const [, c] of counts) {
    if (c > 1) repeatedLineCount += c - 1;
  }
  if (repeatedLineCount > 0) {
    issues.push(`repeated_identical_lines count=${repeatedLineCount}`);
  }

  const toneMismatchCount = 0;

  return {
    ok: issues.length === 0,
    repeatedLineCount,
    genericLineCount,
    expositionDumpCount,
    toneMismatchCount,
    issues,
  };
}
