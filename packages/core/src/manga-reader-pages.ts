/**
 * Normalise le contenu d'un chapitre en « pages » lisibles pour le reader (spec PDF §19.4).
 * Priorité : storyboard.pages → scènes + images → repli sur résumé / outline.
 */

export type MangaPanel = {
  id: string;
  dialogue?: string;
  caption?: string;
  imageUrl?: string | null;
  sfx?: string;
};

export type MangaReaderPage = {
  id: string;
  pageIndex: number;
  /** Une page peut être une seule case ou une demi-spread */
  panels: MangaPanel[];
  isCover?: boolean;
};

export type ParsedStoryboard = {
  pages?: Array<{
    id?: string;
    pageNumber?: number;
    panels?: MangaPanel[];
  }>;
};

function panelsFromStoryboard(sb: unknown): MangaReaderPage[] | null {
  if (!sb || typeof sb !== "object") return null;
  const raw = sb as ParsedStoryboard;
  if (!Array.isArray(raw.pages) || raw.pages.length === 0) return null;
  return raw.pages.map((p, i) => ({
    id: String(p.id ?? `sb-${i}`),
    pageIndex: i,
    panels: (p.panels ?? []).map((pan, j) => ({
      id: String(pan.id ?? `p-${i}-${j}`),
      dialogue: pan.dialogue,
      caption: pan.caption,
      imageUrl: pan.imageUrl,
      sfx: pan.sfx,
    })),
    isCover: i === 0 && (p.panels?.length ?? 0) === 0,
  }));
}

export function buildMangaPagesFromChapter(input: {
  chapterNumber: number;
  title: string | null;
  summary: string | null;
  cliffhanger: string | null;
  storyboard: unknown;
  outline: unknown;
  script: unknown;
}): MangaReaderPage[] {
  const fromSb = panelsFromStoryboard(input.storyboard);
  if (fromSb && fromSb.length > 0) return fromSb;

  const pages: MangaReaderPage[] = [];
  pages.push({
    id: "cover",
    pageIndex: 0,
    isCover: true,
    panels: [
      {
        id: "cover-panel",
        caption: `Chapitre ${input.chapterNumber}`,
        dialogue: input.title ?? `Chapitre ${input.chapterNumber}`,
      },
    ],
  });

  const summary = input.summary?.trim();
  if (summary) {
    const chunks = summary.match(/.{1,280}(\s|$)/g) ?? [summary];
    chunks.forEach((text, i) => {
      pages.push({
        id: `sum-${i}`,
        pageIndex: pages.length,
        panels: [{ id: `sum-p-${i}`, caption: i === 0 ? "Résumé" : undefined, dialogue: text.trim() }],
      });
    });
  } else {
    pages.push({
      id: "placeholder-1",
      pageIndex: pages.length,
      panels: [
        {
          id: "ph1",
          dialogue:
            "Le storyboard et le script seront assemblés ici après génération (pipeline Inngest / éditeur). En attendant, édite le résumé du chapitre dans les métadonnées ou lance le pipeline depuis l’atelier chapitre.",
        },
      ],
    });
  }

  const outlineBeats =
    input.outline && typeof input.outline === "object" && input.outline !== null && "beats" in input.outline
      ? (input.outline as { beats?: { summary?: string }[] }).beats
      : undefined;
  if (Array.isArray(outlineBeats) && outlineBeats.length > 0) {
    outlineBeats.slice(0, 6).forEach((beat, i) => {
      if (!beat?.summary) return;
      pages.push({
        id: `beat-${i}`,
        pageIndex: pages.length,
        panels: [{ id: `beat-p-${i}`, caption: `Beat ${i + 1}`, dialogue: beat.summary }],
      });
    });
  }

  if (input.cliffhanger?.trim()) {
    pages.push({
      id: "cliffhanger",
      pageIndex: pages.length,
      panels: [
        {
          id: "cliff-panel",
          caption: "Cliffhanger",
          dialogue: input.cliffhanger.trim(),
          sfx: "...",
        },
      ],
    });
  }

  return pages;
}

/** Regroupe les pages en « spreads » (2 pages côte à côte, style manga ouvert). */
export function groupIntoSpreads(pages: MangaReaderPage[]): MangaReaderPage[][] {
  const spreads: MangaReaderPage[][] = [];
  let i = 0;
  if (pages[0]?.isCover) {
    spreads.push([pages[0]]);
    i = 1;
  }
  while (i < pages.length) {
    const left = pages[i];
    const right = pages[i + 1];
    if (right) {
      spreads.push([left, right]);
      i += 2;
    } else {
      spreads.push([left]);
      i += 1;
    }
  }
  return spreads;
}
