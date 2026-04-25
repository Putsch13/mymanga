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

    if (LEGACY_TEMPLATE_SNIPPETS.some((s) => n.includes(s)) || GENERIC_ANIME_SNIPPETS.some((s) => n.includes(s))) {
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
