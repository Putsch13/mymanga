import type { CanonicalChapterProductionPlan } from "@manga-ai-studio/core";
import type { RequiredVisualCoverage } from "../services/required-visual-coverage";
import { canonicalPlanBeatsPlainText } from "../services/sanitize-visual-contract";
import type { VisualCoverageGap } from "./visual-coverage-validator";

export type VisualCoverageGapSeverity = "fatal" | "repairable" | "soft" | "rejected";

export interface ClassifiedVisualCoverageGaps {
  fatalGaps: VisualCoverageGap[];
  repairableGaps: VisualCoverageGap[];
  softGaps: VisualCoverageGap[];
  rejectedGaps: VisualCoverageGap[];
}

export interface VisualCoverageGapClassificationContext {
  outlineNorm: string;
  criticalCharacterEntities: Set<string>;
  beatTextById: Map<string, string>;
  mainLocationEntityNorm?: string | null;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function outlineMentions(outlineNorm: string, entity: string): boolean {
  const e = norm(entity).trim();
  if (e.length < 2) return false;
  if (outlineNorm.includes(e)) return true;
  for (const w of e.split(/[\s/|,_-]+/).filter((x) => x.length > 2)) {
    if (outlineNorm.includes(w)) return true;
  }
  return false;
}

function isConfrontationBeat(beatText: string): boolean {
  return /(confrontation|affrontement|face à|face-a|vs\.|combat|duel|menace|antagon|hostile|attaque|tension dramatique)/i.test(
    beatText,
  );
}

function isSpeakingBeat(beatText: string, entity: string): boolean {
  if (!/\b(dit|demande|répond|repond|murmure|crie|hurle|parle|chuchote|s'exclame|questionne|interroge)\b/i.test(beatText)) {
    return false;
  }
  const low = beatText.toLowerCase();
  const e = norm(entity);
  const first = e.split(/[\s_-]+/).find((w) => w.length > 2);
  return low.includes(e) || Boolean(first && low.includes(first));
}

function locationCompatibleWithMain(entityNorm: string, mainNorm: string | null | undefined): boolean {
  if (!mainNorm || mainNorm.length < 2) return true;
  return entityNorm.includes(mainNorm) || mainNorm.includes(entityNorm);
}

/**
 * Contexte dérivé du chapitre (outline, héros / focus, beats canoniques, lieu principal contrat).
 */
export function buildVisualCoverageGapClassificationContext(args: {
  outlineText: string;
  canonicalPlan: CanonicalChapterProductionPlan | null;
  rawCharacters: Array<{ id: string; name: string }>;
  focusCharacterIds: string[];
  heroCharacterId?: string | null;
  contractMainLocationName?: string | null;
}): VisualCoverageGapClassificationContext {
  const outlineNorm = norm(`${args.outlineText} ${canonicalPlanBeatsPlainText(args.canonicalPlan)}`);
  const beatTextById = new Map<string, string>();
  for (const b of args.canonicalPlan?.beats ?? []) {
    const id = typeof b.beatId === "string" ? b.beatId : "";
    if (!id) continue;
    const text = [b.summary, b.narrativeFunction, b.dramaticChange, ...(b.environmentContext ?? [])]
      .filter(Boolean)
      .join(" ");
    beatTextById.set(id, text);
  }
  const criticalCharacterEntities = new Set<string>();
  for (const id of args.focusCharacterIds) {
    if (id) criticalCharacterEntities.add(norm(id));
  }
  if (args.heroCharacterId) criticalCharacterEntities.add(norm(args.heroCharacterId));
  for (const c of args.rawCharacters) {
    if (args.focusCharacterIds.includes(c.id) || c.id === args.heroCharacterId) {
      criticalCharacterEntities.add(norm(c.name));
      criticalCharacterEntities.add(norm(c.id));
    }
  }
  const mainLocationEntityNorm =
    args.contractMainLocationName && args.contractMainLocationName.trim()
      ? norm(args.contractMainLocationName)
      : null;
  return { outlineNorm, criticalCharacterEntities, beatTextById, mainLocationEntityNorm };
}

/**
 * Classe les écarts de couverture visuelle : seuls les gaps « fatal » doivent
 * bloquer la génération premium. Avec `context`, règles fines (antagoniste /
 * confrontation, personnage critique / parole, lieu incompatible, rejet
 * hors-outline).
 */
export function classifyVisualCoverageGaps(
  gaps: VisualCoverageGap[],
  context?: VisualCoverageGapClassificationContext,
): ClassifiedVisualCoverageGaps {
  const fatalGaps: VisualCoverageGap[] = [];
  const repairableGaps: VisualCoverageGap[] = [];
  const softGaps: VisualCoverageGap[] = [];
  const rejectedGaps: VisualCoverageGap[] = [];

  for (const g of gaps) {
    const c = g.coverage;
    if (isRejectedGap(c)) {
      rejectedGaps.push(g);
      continue;
    }
    if (!context) {
      const sev = classifySingleGapLegacy(c);
      if (sev === "fatal") fatalGaps.push(g);
      else if (sev === "repairable") repairableGaps.push(g);
      else softGaps.push(g);
      continue;
    }
    const sev = classifySingleGapWithContext(c, context);
    if (sev === "fatal") fatalGaps.push(g);
    else if (sev === "repairable") repairableGaps.push(g);
    else if (sev === "rejected") rejectedGaps.push(g);
    else softGaps.push(g);
  }

  return { fatalGaps, repairableGaps, softGaps, rejectedGaps };
}

function isRejectedGap(c: RequiredVisualCoverage): boolean {
  return Boolean((c as { rejected?: boolean }).rejected);
}

/** Comportement historique (sans contexte beat / outline étendu). */
function classifySingleGapLegacy(c: RequiredVisualCoverage): VisualCoverageGapSeverity {
  const t = c.entityType;
  const dedicated = c.requiresDedicatedPanel;

  if (t === "enemy" && dedicated) return "fatal";
  if (t === "creature" && dedicated) return "fatal";

  if (t === "character") {
    if (dedicated) return "fatal";
    return "soft";
  }

  if (t === "prop" || t === "location" || t === "surveillance" || t === "threat_silhouette") {
    return "repairable";
  }

  return "soft";
}

function classifySingleGapWithContext(
  c: RequiredVisualCoverage,
  ctx: VisualCoverageGapClassificationContext,
): VisualCoverageGapSeverity {
  const beatText = ctx.beatTextById.get(c.sourceBeatId) ?? "";
  const beatLow = beatText.toLowerCase();
  const inOutline = outlineMentions(ctx.outlineNorm, c.entity);
  const entityNorm = norm(c.entity);
  const critical = ctx.criticalCharacterEntities.has(entityNorm);

  if (c.entityType === "character") {
    if (!inOutline && !critical && !c.requiresDedicatedPanel) return "rejected";
    if (critical) return "fatal";
    if (c.requiresDedicatedPanel && inOutline) return "fatal";
    if (isSpeakingBeat(beatText, c.entity) && inOutline) return "fatal";
    return "soft";
  }

  if (c.entityType === "enemy") {
    if (c.requiresDedicatedPanel && isConfrontationBeat(beatText)) return "fatal";
    if (c.requiresDedicatedPanel && !inOutline) return "rejected";
    if (!inOutline) return "repairable";
    return "repairable";
  }

  if (c.entityType === "creature") {
    const centralBeat =
      isConfrontationBeat(beatText) ||
      /(menace centrale|créature du beat|monstre principal|présence massive|ombre imposante)/i.test(beatLow);
    if (c.requiresDedicatedPanel && (inOutline || centralBeat)) return "fatal";
    if (c.requiresDedicatedPanel && !inOutline && !centralBeat) return "rejected";
    return "repairable";
  }

  if (c.entityType === "location") {
    if (ctx.mainLocationEntityNorm && !locationCompatibleWithMain(entityNorm, ctx.mainLocationEntityNorm)) {
      return "rejected";
    }
    if (!inOutline) return "rejected";
    return "repairable";
  }

  if (c.entityType === "prop" || c.entityType === "surveillance" || c.entityType === "threat_silhouette") {
    if (!inOutline && c.tokensHint.length > 0 && !c.tokensHint.some((h) => outlineMentions(ctx.outlineNorm, h))) {
      return "rejected";
    }
    return "repairable";
  }

  return "soft";
}
