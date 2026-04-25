/**
 * Répartition globale des cutaways selon le motif actor-driven [2,3,2,3,…]
 * entre deux cutaways, sans forcer systématiquement le cutaway en fin de beat.
 */
import type { CanonicalPanelPlan } from "./canonical-production-plan";
import { determinePanelRole, determinePanelTextPlan } from "./panel-rhythm-planner";
import { PRODUCTION_RULES } from "./production-rules";
import type { NormalizedBeat, NormalizedOutline } from "./normalize-outline";

function countsPerBeat(panels: CanonicalPanelPlan[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of panels) {
    m.set(p.beatId, (m.get(p.beatId) ?? 0) + 1);
  }
  return m;
}

/** Index dans le beat + total panels du beat (ordre global préservé). */
function beatIndexMeta(panels: CanonicalPanelPlan[]): Array<{
  indexInBeat: number;
  totalInBeat: number;
}> {
  const totals = countsPerBeat(panels);
  const seen = new Map<string, number>();
  return panels.map((p) => {
    const idx = seen.get(p.beatId) ?? 0;
    seen.set(p.beatId, idx + 1);
    return { indexInBeat: idx, totalInBeat: totals.get(p.beatId) ?? 1 };
  });
}

export function refreshPanelCutawayState(
  panel: CanonicalPanelPlan,
  beat: NormalizedBeat,
  panelIndexInBeat: number,
  totalPanelsInBeat: number,
  isCutaway: boolean,
): CanonicalPanelPlan {
  const role = determinePanelRole(beat, panelIndexInBeat, totalPanelsInBeat, isCutaway);
  const textBase = determinePanelTextPlan(beat, role, isCutaway);
  const isActorDriven =
    !isCutaway
    && ["hero", "duo", "enemy", "reaction", "action", "speaker", "listener", "group"].includes(role);
  return {
    ...panel,
    role,
    isCutaway,
    isActorDriven,
    mustShowCharacterIds: isCutaway ? [] : beat.involvedCharacters.slice(0, 2),
    shotType: isCutaway ? "wide" : "medium",
    textPlan: { ...textBase, panelId: panel.panelId },
  };
}

/**
 * Repositionne les cutaways sur la séquence globale (pattern 2/3/2/3),
 * en évitant le premier panel d’un beat et le dernier panel des beats « tension »
 * (réserve aftermath / climax en actor-driven).
 */
export function applyDistributedCutawayRhythmToPanels(
  panels: CanonicalPanelPlan[],
  outline: NormalizedOutline,
): CanonicalPanelPlan[] {
  const beatById = new Map(outline.beats.map((b) => [b.beatId, b]));
  const meta = beatIndexMeta(panels);
  const n = panels.length;
  if (n === 0) return panels;

  const targetCutaways = panels.filter((p) => p.isCutaway).length;
  const pattern = [...PRODUCTION_RULES.rhythm.preferredNarrativePattern];
  const maxRatio = PRODUCTION_RULES.cutaway.maxRatio;
  const maxConsecutive = PRODUCTION_RULES.cutaway.maxConsecutive;

  let next = panels.map((p, i) => {
    const beat = beatById.get(p.beatId);
    if (!beat) return p;
    const m = meta[i]!;
    return refreshPanelCutawayState(p, beat, m.indexInBeat, m.totalInBeat, false);
  });

  if (targetCutaways === 0) return next;

  let remaining = targetCutaways;
  let pi = 0;
  let actorSinceLastCut = 0;

  const cutCount = () => next.filter((p) => p.isCutaway).length;

  function consecutiveCutawaysEndingBefore(endExclusive: number): number {
    let c = 0;
    for (let j = endExclusive - 1; j >= 0; j--) {
      if (!next[j]!.isCutaway) break;
      c++;
    }
    return c;
  }

  for (let i = 0; i < n && remaining > 0; i++) {
    const p = next[i]!;
    const beat = beatById.get(p.beatId);
    if (!beat) continue;
    const m = meta[i]!;
    if (p.isCutaway) {
      actorSinceLastCut = 0;
      continue;
    }

    const needCutaway = actorSinceLastCut >= pattern[pi % pattern.length];
    const eligible =
      m.indexInBeat > 0
      && !(beat.hasTension && m.indexInBeat === m.totalInBeat - 1);
    const ratioOk = (cutCount() + 1) / n <= maxRatio + 1e-6;
    const streakIfPlaced = consecutiveCutawaysEndingBefore(i) + 1;

    if (needCutaway && eligible && ratioOk && streakIfPlaced <= maxConsecutive) {
      next[i] = refreshPanelCutawayState(p, beat, m.indexInBeat, m.totalInBeat, true);
      remaining -= 1;
      pi += 1;
      actorSinceLastCut = 0;
    } else {
      actorSinceLastCut += 1;
    }
  }

  // Seconde passe : placer les cutaways restants (milieu de beat, ratio max)
  for (let i = 1; i < n && remaining > 0; i++) {
    const p = next[i]!;
    if (p.isCutaway) continue;
    const beat = beatById.get(p.beatId);
    if (!beat) continue;
    const m = meta[i]!;
    if (m.indexInBeat === 0) continue;
    if (beat.hasTension && m.indexInBeat === m.totalInBeat - 1) continue;
    if ((cutCount() + 1) / n > maxRatio + 1e-6) break;
    next[i] = refreshPanelCutawayState(p, beat, m.indexInBeat, m.totalInBeat, true);
    remaining -= 1;
  }

  return next;
}
