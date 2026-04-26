/**
 * P1.7 — props-qa-pass : détection des props fantômes.
 *
 * Un "prop fantôme" est un objet/accessoire mentionné dans un panel ou beat
 * qui n'existe pas dans le ChapterStoryContract.
 *
 * Ce QA vérifie :
 * 1. Les props mentionnés dans actionLine/environmentHint sont autorisés
 * 2. Aucun prop interdit (forbiddenProps) n'apparaît
 * 3. Pas de props modernes anachroniques (smartphone, voiture, etc.)
 *
 * @module props-qa-pass
 */

import type { PanelRenderSpec } from "@manga-ai-studio/ai";
import { type ChapterStoryContract, isPropForbidden } from "@manga-ai-studio/core";
import { PIPELINE_ERROR_CODES, type PipelineErrorCode } from "@manga-ai-studio/core";

export interface PropsQaPassInput {
  specs: PanelRenderSpec[];
  storyContract: ChapterStoryContract;
  /** Mode strict : fail sur tout prop inconnu. Par défaut on warn seulement. */
  strictMode?: boolean;
}

export interface PropQaIssue {
  panelId: string;
  propName: string;
  code: PipelineErrorCode;
  message: string;
  severity: "error" | "warning";
}

export interface PropsQaPassOutput {
  issues: PropQaIssue[];
  errorCount: number;
  warningCount: number;
  ok: boolean;
}

/**
 * Patterns pour détecter les props dans le texte.
 * Ces regex sont volontairement larges ; le QA vérifie ensuite si le mot est interdit.
 */
const PROP_EXTRACTION_PATTERNS = [
  /\bholding\s+(?:a\s+|the\s+)?(\w+(?:\s+\w+)?)/gi,
  /\bcarrying\s+(?:a\s+|the\s+)?(\w+(?:\s+\w+)?)/gi,
  /\bwith\s+(?:a\s+|the\s+)?(\w+)\s+in\s+(?:his|her|their)\s+hand/gi,
  /\bwielding\s+(?:a\s+|the\s+)?(\w+)/gi,
  /\busing\s+(?:a\s+|the\s+)?(\w+)/gi,
  /\b(smartphone|phone|mobile|cellphone|tablet|laptop|computer|gun|pistol|rifle|car|automobile|television|tv)\b/gi,
];

/**
 * Props considérés comme "modernes" et interdits par défaut dans les univers non-contemporains.
 */
const ANACHRONISTIC_PROPS = new Set([
  "smartphone",
  "phone",
  "mobile",
  "cellphone",
  "tablet",
  "laptop",
  "computer",
  "television",
  "tv",
  "drone",
  "vr headset",
  "smartwatch",
]);

/**
 * P8 — Props génériques/suspects qui sentent le fallback du moteur narratif.
 * Ces termes sont souvent insérés automatiquement quand le système manque de contexte.
 */
const SUSPICIOUS_GENERIC_PROPS = new Set([
  "document",
  "evidence",
  "document/evidence",
  "obstacle",
  "generic_object",
  "item",
  "thing",
  "object",
  "macguffin",
]);

/**
 * Extrait les props potentiels d'un texte.
 */
export function extractPotentialProps(text: string): string[] {
  const props = new Set<string>();
  for (const pattern of PROP_EXTRACTION_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match[1]) {
        props.add(match[1].toLowerCase().trim());
      }
    }
  }
  return [...props];
}

/**
 * Vérifie si un prop est anachronique.
 */
export function isAnachronisticProp(propName: string): boolean {
  const normalized = propName.toLowerCase().trim();
  return ANACHRONISTIC_PROPS.has(normalized);
}

/**
 * P8 — Vérifie si un prop est un fallback générique suspect.
 */
export function isSuspiciousGenericProp(propName: string): boolean {
  const normalized = propName.toLowerCase().trim();
  return SUSPICIOUS_GENERIC_PROPS.has(normalized);
}

/**
 * Exécute le QA anti-props fantômes.
 */
export function runPropsQaPass(input: PropsQaPassInput): PropsQaPassOutput {
  const issues: PropQaIssue[] = [];
  const { storyContract, strictMode = false } = input;

  const allowedPropNames = new Set(
    storyContract.allowedProps.map((p) => p.canonicalName.toLowerCase()),
  );

  for (const spec of input.specs) {
    const envDesc =
      typeof spec.environmentDNA?.description === "string" ? spec.environmentDNA.description : "";
    const textsToScan = [
      spec.actionLine,
      spec.emotionLine,
      envDesc,
      ...(spec.constraints.mustShow ?? []),
    ].filter(Boolean);

    const fullText = textsToScan.join(" ");
    const extractedProps = extractPotentialProps(fullText);
    const reportedProps = new Set<string>();

    for (const propName of extractedProps) {
      if (reportedProps.has(propName)) continue;
      reportedProps.add(propName);
      const isForbidden = isPropForbidden(storyContract, propName);
      const isAnachronistic = isAnachronisticProp(propName);
      const isSuspiciousGeneric = isSuspiciousGenericProp(propName);

      if (isForbidden) {
        issues.push({
          panelId: spec.panelId,
          propName,
          code: PIPELINE_ERROR_CODES.E_ENTITY_PHANTOM_PROP,
          message: `Forbidden prop "${propName}" detected in panel ${spec.panelId}`,
          severity: "error",
        });
      } else if (isAnachronistic) {
        issues.push({
          panelId: spec.panelId,
          propName,
          code: PIPELINE_ERROR_CODES.E_ENTITY_PHANTOM_PROP,
          message: `Anachronistic prop "${propName}" detected — likely a phantom prop`,
          severity: strictMode ? "error" : "warning",
        });
      } else if (isSuspiciousGeneric) {
        // P8 — Props génériques suspects = fallback du moteur narratif
        issues.push({
          panelId: spec.panelId,
          propName,
          code: PIPELINE_ERROR_CODES.E_ENTITY_PHANTOM_PROP,
          message: `Suspicious generic prop "${propName}" detected — likely a narrative engine fallback`,
          severity: "warning",
        });
      } else if (strictMode && allowedPropNames.size > 0 && !allowedPropNames.has(propName)) {
        issues.push({
          panelId: spec.panelId,
          propName,
          code: PIPELINE_ERROR_CODES.E_ENTITY_UNKNOWN_PROP,
          message: `Unknown prop "${propName}" not in allowedProps list`,
          severity: "warning",
        });
      }
    }
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return {
    issues,
    errorCount,
    warningCount,
    ok: errorCount === 0,
  };
}

/**
 * Formate le résultat du QA pour le logging.
 */
export function formatPropsQaLog(output: PropsQaPassOutput): string {
  if (output.ok && output.warningCount === 0) {
    return "[props-qa] ok — no phantom props detected";
  }

  const errorSummary =
    output.errorCount > 0
      ? output.issues
          .filter((i) => i.severity === "error")
          .slice(0, 5)
          .map((i) => `  - ${i.panelId}: ${i.propName}`)
          .join("\n")
      : "";

  return (
    `[props-qa] errors=${output.errorCount} warnings=${output.warningCount}` +
    (errorSummary ? `\n${errorSummary}` : "")
  );
}
