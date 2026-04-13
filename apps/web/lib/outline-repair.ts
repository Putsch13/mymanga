import { validateOutlineProgression } from "./outline-progression-guard";

type EditorialBeat = {
  beatId?: string;
  label?: string;
  summary: string;
};

type ProductionBeat = Record<string, unknown> & { summary: string; beatId?: string };

type EditorialOutlineInput = {
  summary: string;
  beats: EditorialBeat[];
};

type ProductionOutlineInput = {
  chapterGoal: string;
  cliffhanger: string;
  beats: ProductionBeat[];
};

export async function repairProductionOutlineIfNeeded(input: {
  editorialOutline: EditorialOutlineInput;
  productionOutline: ProductionOutlineInput;
}): Promise<{
  productionOutline: ProductionOutlineInput;
  repaired: boolean;
  repairReason?: string;
}> {
  const { editorialOutline, productionOutline } = input;

  const validation = validateOutlineProgression({
    editorialOutline,
    productionOutline,
  });

  if (validation.ok) {
    return { productionOutline, repaired: false };
  }

  const lateRepeatIssues = validation.issues.filter(
    (issue) => issue.type === "late_repeat_of_opening" || issue.type === "duplicate_beat",
  );

  if (lateRepeatIssues.length === 0) {
    return { productionOutline, repaired: false };
  }

  // Identifier la frontière à partir de laquelle les beats dégénèrent
  const firstBadIndex = Math.min(...lateRepeatIssues.map((i) => i.beatIndex));
  const goodBeats = productionOutline.beats.slice(0, firstBadIndex);
  const badBeatsCount = productionOutline.beats.length - firstBadIndex;

  if (badBeatsCount <= 0) {
    return { productionOutline, repaired: false };
  }

  // Construire des beats de remplacement à partir de l'outline éditorial
  // en utilisant les beats éditoriaux qui correspondent à la seconde moitié
  const editorialHalf = editorialOutline.beats.slice(
    Math.floor(editorialOutline.beats.length / 2),
  );

  const repairedBeats: ProductionBeat[] = [...goodBeats];

  for (let i = 0; i < badBeatsCount; i++) {
    const editorialRef = editorialHalf[i % editorialHalf.length];
    const originalBad = productionOutline.beats[firstBadIndex + i];

    if (!originalBad) continue;

    // Construire un beat réparé qui progresse depuis le dernier bon beat
    const lastGoodBeat = repairedBeats[repairedBeats.length - 1];
    const progressionHint = lastGoodBeat
      ? `Suite directe après : "${lastGoodBeat.summary.slice(0, 80)}…"`
      : "";

    const repairedSummary = editorialRef
      ? `[Progression] ${editorialRef.summary}${progressionHint ? ` — ${progressionHint}` : ""}`
      : `[Progression vers la fin] ${productionOutline.cliffhanger}`;

    repairedBeats.push({
      ...originalBad,
      summary: repairedSummary,
      beatId: originalBad.beatId ?? `repaired_beat_${firstBadIndex + i}`,
    });
  }

  const repairedOutline: ProductionOutlineInput = {
    ...productionOutline,
    beats: repairedBeats,
  };

  return {
    productionOutline: repairedOutline,
    repaired: true,
    repairReason: `${lateRepeatIssues.length} beat(s) répétitif(s) détecté(s) à partir du beat ${firstBadIndex + 1}. La seconde moitié a été reconstruite pour assurer la progression vers : "${productionOutline.cliffhanger}".`,
  };
}
