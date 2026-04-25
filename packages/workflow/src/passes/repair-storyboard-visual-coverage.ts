import type { CanonicalChapterProductionPlan } from "@manga-ai-studio/core";
import type { StoryboardPanel, StoryboardPlan } from "@manga-ai-studio/ai/contracts";
import type { VisualCoverageGap } from "@manga-ai-studio/ai";

type PanelRef = { pageIdx: number; panelIdx: number; panel: StoryboardPanel };

function collectPanelRefs(plan: StoryboardPlan): PanelRef[] {
  const out: PanelRef[] = [];
  for (let pageIdx = 0; pageIdx < plan.pages.length; pageIdx++) {
    const page = plan.pages[pageIdx]!;
    for (let panelIdx = 0; panelIdx < page.panels.length; panelIdx++) {
      out.push({ pageIdx, panelIdx, panel: page.panels[panelIdx]! });
    }
  }
  return out;
}

function panelsForBeat(refs: PanelRef[], beatId: string): PanelRef[] {
  return refs.filter((r) => r.panel.sourceBeatId === beatId);
}

/** Score plus haut = meilleur candidat pour accueillir un insert prop / décor. */
function scorePanelForPropRepair(p: StoryboardPanel): number {
  let s = 0;
  if (p.cutawayType !== "none") s += 4;
  if (p.subjectFocus === "prop") s += 5;
  if (p.subjectFocus === "environment") s += 3;
  if (p.panelPurpose === "prop_insert" || p.panelPurpose === "environment_cutaway") s += 3;
  if (p.panelPurpose === "transition") s += 2;
  if (p.renderMode === "insert_object" || p.renderMode === "surveillance_reveal") s += 2;
  if (p.renderMode === "silent_transition") s += 1;
  if (p.cutawayType === "aftermath") s += 2;
  return s;
}

function scorePanelForLocationRepair(p: StoryboardPanel): number {
  let s = 0;
  if (p.renderMode === "establishing_environment") s += 6;
  if (p.subjectFocus === "environment") s += 5;
  if (p.panelPurpose === "location_establishing") s += 5;
  if (p.cutawayType === "environment") s += 3;
  if (p.cutawayType !== "none") s += 1;
  return s;
}

function pickBest(
  candidates: PanelRef[],
  score: (p: StoryboardPanel) => number,
): PanelRef | null {
  if (candidates.length === 0) return null;
  let best = candidates[0]!;
  let bestScore = score(best.panel);
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i]!;
    const sc = score(c.panel);
    if (sc > bestScore) {
      best = c;
      bestScore = sc;
    }
  }
  return best;
}

function mergeTokensForBeat(gaps: VisualCoverageGap[]): string[] {
  const set = new Set<string>();
  for (const g of gaps) {
    const c = g.coverage;
    const hints = c.tokensHint.length > 0 ? c.tokensHint : [c.entity];
    for (const h of hints) {
      const t = h.toLowerCase().trim();
      if (t) set.add(t);
    }
  }
  return [...set];
}

/**
 * Tente de combler les gaps visuels réparables (props, lieux, surveillance)
 * en réutilisant des panels existants du même beat (pas d’ajout de panels).
 */
export function repairStoryboardVisualCoverage(args: {
  storyboardPlan: StoryboardPlan;
  gaps: VisualCoverageGap[];
  productionPlan?: unknown;
  canonicalPlan?: CanonicalChapterProductionPlan | null;
}): StoryboardPlan {
  const plan = structuredClone(args.storyboardPlan) as StoryboardPlan;
  const refs = collectPanelRefs(plan);

  const propGapsByBeat = new Map<string, VisualCoverageGap[]>();
  const locGapsByBeat = new Map<string, VisualCoverageGap[]>();

  for (const g of args.gaps) {
    const t = g.coverage.entityType;
    const bid = g.coverage.sourceBeatId;
    if (t === "location") {
      const arr = locGapsByBeat.get(bid) ?? [];
      arr.push(g);
      locGapsByBeat.set(bid, arr);
    } else if (t === "prop" || t === "surveillance" || t === "threat_silhouette") {
      const arr = propGapsByBeat.get(bid) ?? [];
      arr.push(g);
      propGapsByBeat.set(bid, arr);
    }
  }

  for (const [beatId, gapList] of propGapsByBeat) {
    const beatPanels = panelsForBeat(refs, beatId);
    const target = pickBest(beatPanels, scorePanelForPropRepair);
    if (!target) continue;

    const p = plan.pages[target.pageIdx]!.panels[target.panelIdx]!;
    const tokens = mergeTokensForBeat(gapList);
    const mergedShow = new Set([...(p.mustShow ?? []), ...tokens]);

    const wantsSurveillance = gapList.some((g) => g.coverage.entityType === "surveillance");
    p.mustShow = [...mergedShow];
    p.renderMode = wantsSurveillance ? "surveillance_reveal" : "insert_object";
    p.subjectFocus = "prop";
    if (p.cutawayType === "none") p.cutawayType = "prop_insert";
    p.panelPurpose = wantsSurveillance ? "surveillance_insert" : "prop_insert";
    const label = tokens.slice(0, 5).join(", ");
    p.actionLine = `${p.actionLine} Insert visuel : ${label}.`.trim();
  }

  for (const [beatId, gapList] of locGapsByBeat) {
    const beatPanels = panelsForBeat(refs, beatId);
    const target =
      pickBest(beatPanels, scorePanelForLocationRepair)
      ?? pickBest(beatPanels, scorePanelForPropRepair);
    if (!target) continue;

    const firstGap = gapList[0]!;
    const locLabel = firstGap.coverage.entity;
    const p = plan.pages[target.pageIdx]!.panels[target.panelIdx]!;
    p.renderMode = "establishing_environment";
    p.subjectFocus = "environment";
    if (p.cutawayType === "none") p.cutawayType = "environment";
    p.panelPurpose = "location_establishing";
    p.locationName = locLabel || p.locationName;
    const mergedShow = new Set([...(p.mustShow ?? []), locLabel.toLowerCase(), "lieu"]);
    p.mustShow = [...mergedShow];
    p.actionLine = `${p.actionLine} Établir le lieu : ${locLabel}.`.trim();
  }

  return plan;
}
