/**
 * `buildSeriesSynopsis` — résumé cumulatif compressé de la série entière.
 *
 * Les 3 derniers chapitres sont détaillés, les anciens sont compressés en une
 * ligne chacun. Permet au LLM de connaître l'arc global sans exploser le
 * contexte (séries longues 50+ chapitres).
 */

export interface SynopsisChapter {
  chapterNumber: number;
  title: string | null;
  summary: string | null;
  cliffhanger: string | null;
}

export function buildSeriesSynopsis(chapters: SynopsisChapter[]): string {
  if (chapters.length === 0) {
    return "Aucun chapitre précédent. C'est le début de la série.";
  }

  const sorted = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);

  if (sorted.length <= 3) {
    return sorted
      .map(
        (c) =>
          `Ch.${c.chapterNumber} "${c.title ?? ""}": ${c.summary ?? "non résumé"}. Fin: ${c.cliffhanger ?? "n/a"}`,
      )
      .join("\n");
  }

  const older = sorted.slice(0, -3);
  const recent = sorted.slice(-3);

  const olderCompressed = older
    .map((c) => `Ch.${c.chapterNumber}: ${(c.summary ?? "").slice(0, 80)}`)
    .join(" → ");

  const recentDetailed = recent
    .map(
      (c) =>
        `Ch.${c.chapterNumber} "${c.title ?? ""}": ${c.summary ?? "non résumé"}. Fin: ${c.cliffhanger ?? "n/a"}`,
    )
    .join("\n");

  return `ARC GLOBAL (${sorted.length} chapitres): ${olderCompressed}\n\nDERNIERS CHAPITRES:\n${recentDetailed}`;
}
