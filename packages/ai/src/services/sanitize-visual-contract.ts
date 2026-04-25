import type { CanonicalChapterProductionPlan } from "@manga-ai-studio/core";
import type { RequiredVisualCoverage } from "./required-visual-coverage";

/** auto_strip : obligations créature/ennemi non citées dans l’outline → rejetées (pas de merge couverture). keep_all : conserve le comportement historique (suspicious + confirmé). */
export type VisualContractParasiteSanitizePolicy = "auto_strip" | "keep_all";

export interface SanitizeVisualContractArgs {
  requiredCoverage: RequiredVisualCoverage[];
  outlineText: string;
  canonicalPlan?: CanonicalChapterProductionPlan | null;
  knownCharacters: Array<{ id: string; name: string }>;
  knownLocations?: Array<{ id?: string; name: string; aliases?: string[] }>;
  projectGenre?: string | null;
  projectTone?: string | null;
  /** Politique pour les slices « parasites » issues du plan brut (pas du contrat LLM chapitre). Défaut : auto_strip. */
  parasitePolicy?: VisualContractParasiteSanitizePolicy;
}

export interface SanitizeVisualContractResult {
  requiredConfirmed: RequiredVisualCoverage[];
  optional: RequiredVisualCoverage[];
  suspicious: RequiredVisualCoverage[];
  rejected: RequiredVisualCoverage[];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function outlineMentions(outlineNorm: string, entity: string): boolean {
  const e = normalize(entity).trim();
  if (e.length < 2) return false;
  if (outlineNorm.includes(e)) return true;
  for (const w of e.split(/[\s/|,_-]+/).filter((x) => x.length > 2)) {
    if (outlineNorm.includes(w)) return true;
  }
  return false;
}

/** Texte concaténé des beats canoniques (réutilisé par le classifieur de gaps). */
export function canonicalPlanBeatsPlainText(plan: CanonicalChapterProductionPlan | null | undefined): string {
  if (!plan?.beats?.length) return "";
  return plan.beats
    .map((b) =>
      [b.summary, b.narrativeFunction, b.dramaticChange, ...(b.environmentContext ?? [])].filter(Boolean).join(" "),
    )
    .join(" | ");
}

/**
 * Filtre les obligations visuelles parasites (anciennes props, lieux hors texte)
 * avant la QA de couverture. Seul `requiredConfirmed` est validé strictement.
 */
export function sanitizeVisualContractBeforeCoverage(args: SanitizeVisualContractArgs): SanitizeVisualContractResult {
  const parasitePolicy: VisualContractParasiteSanitizePolicy = args.parasitePolicy ?? "auto_strip";
  const outlineNorm = normalize(
    `${args.outlineText} ${canonicalPlanBeatsPlainText(args.canonicalPlan ?? null)}`,
  );
  const knownIds = new Set(args.knownCharacters.map((c) => normalize(c.id)));
  const knownNames = new Set(
    args.knownCharacters.flatMap((c) => [normalize(c.name), normalize(c.id)]).filter(Boolean),
  );
  const locNames = new Set<string>();
  for (const loc of args.knownLocations ?? []) {
    locNames.add(normalize(loc.name));
    for (const a of loc.aliases ?? []) locNames.add(normalize(a));
  }

  const requiredConfirmed: Array<RequiredVisualCoverage & { rejected?: boolean }> = [];
  const optional: RequiredVisualCoverage[] = [];
  const suspicious: RequiredVisualCoverage[] = [];
  const rejected: RequiredVisualCoverage[] = [];

  for (const raw of args.requiredCoverage) {
    const cov: RequiredVisualCoverage = { ...raw };

    if (cov.entityType === "character") {
      const ent = normalize(cov.entity);
      if (knownIds.has(ent) || knownNames.has(ent) || outlineMentions(outlineNorm, cov.entity)) {
        requiredConfirmed.push(cov);
      } else {
        rejected.push({ ...cov, rejected: true });
      }
      continue;
    }

    if (cov.entityType === "enemy" || cov.entityType === "creature") {
      if (outlineMentions(outlineNorm, cov.entity)) {
        requiredConfirmed.push(cov);
      } else if (cov.requiresDedicatedPanel) {
        suspicious.push({ ...cov });
        if (parasitePolicy === "keep_all") {
          requiredConfirmed.push(cov);
        } else {
          rejected.push({ ...cov, rejected: true });
        }
      } else {
        suspicious.push({ ...cov });
        optional.push({ ...cov });
      }
      continue;
    }

    if (cov.entityType === "location") {
      const ent = normalize(cov.entity);
      if (ent === "unknown" || ent.length === 0) {
        rejected.push({ ...cov, rejected: true });
        continue;
      }
      if (outlineMentions(outlineNorm, cov.entity) || [...locNames].some((ln) => ent.includes(ln) || ln.includes(ent))) {
        requiredConfirmed.push(cov);
      } else {
        suspicious.push({ ...cov });
        rejected.push({ ...cov, rejected: true });
      }
      continue;
    }

    if (cov.entityType === "prop" || cov.entityType === "surveillance" || cov.entityType === "threat_silhouette") {
      const tokenHit =
        cov.tokensHint.length > 0
          ? cov.tokensHint.some((h) => outlineMentions(outlineNorm, h))
          : outlineMentions(outlineNorm, cov.entity);
      if (tokenHit) {
        requiredConfirmed.push(cov);
      } else {
        suspicious.push({ ...cov });
        rejected.push({ ...cov, rejected: true });
      }
      continue;
    }

    requiredConfirmed.push(cov);
  }

  return { requiredConfirmed, optional, suspicious, rejected };
}

/** Concatène outline / intent pour la sanitation. */
export function buildOutlineTextForSanitizer(args: {
  approvedOutline?: Record<string, unknown> | null;
  productionOutline?: Record<string, unknown> | null;
  chapterSummary?: string | null;
  chapterUserIntent?: string | null;
}): string {
  const chunks: string[] = [];
  if (args.chapterSummary) chunks.push(String(args.chapterSummary));
  if (args.chapterUserIntent) chunks.push(String(args.chapterUserIntent));

  const pushBeats = (root: Record<string, unknown> | null | undefined) => {
    if (!root) return;
    const beats = root.beats;
    if (!Array.isArray(beats)) return;
    for (const b of beats) {
      if (b && typeof b === "object") {
        const o = b as Record<string, unknown>;
        chunks.push(
          [o.summary, o.whyThisBeatExists, o.dramaticChange, o.chapterGoal, o.text, o.title]
            .filter((x) => typeof x === "string")
            .join(" "),
        );
      }
    }
  };

  if (args.approvedOutline && typeof args.approvedOutline === "object") {
    pushBeats(args.approvedOutline as Record<string, unknown>);
  }
  if (args.productionOutline && typeof args.productionOutline === "object") {
    pushBeats(args.productionOutline as Record<string, unknown>);
  }

  return chunks.join(" | ");
}
