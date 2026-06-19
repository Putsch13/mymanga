/**
 * P0.4 — Render Mode Normalizer
 *
 * Corrige les contradictions entre renderMode et shotType/promptIntent.
 * Par exemple : character_focus + wide establishing shot est contradictoire.
 */

/** Panel générique qui peut être StoryboardPanel ou similaire */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPanel = Record<string, any>;

export interface RenderModeNormalizerInput {
  panels: AnyPanel[];
}

export interface RenderModeNormalizerResult {
  panels: AnyPanel[];
  fixed: number;
  contradictions: string[];
}

/**
 * P0.4 — Patterns qui indiquent un plan large/établissement
 */
const WIDE_ESTABLISHING_PATTERNS = [
  /wide establishing/i,
  /establishing shot/i,
  /plan large/i,
  /vue d['']ensemble/i,
  /panoramic/i,
  /extreme wide/i,
  /very wide/i,
  /full scene/i,
  /scene overview/i,
];

/**
 * P0.4 — Shot types qui ne sont pas compatibles avec character_focus
 */
const WIDE_SHOT_TYPES = [
  "extreme_wide",
  "very_wide",
  "wide",
  "establishing",
  "full",
  "environment",
];

/**
 * P0.4 — Vérifie si un panel a une contradiction character_focus / wide
 */
function hasCharacterFocusWideContradiction(panel: AnyPanel): boolean {
  const renderMode = (panel as Record<string, unknown>).renderMode as string | undefined;
  if (renderMode !== "character_focus") return false;

  // Vérifier le shotType
  const shotType = (panel as Record<string, unknown>).shotType as string | undefined;
  if (shotType && WIDE_SHOT_TYPES.includes(shotType.toLowerCase())) {
    return true;
  }

  // Vérifier le promptIntent
  const promptIntent = (panel as Record<string, unknown>).promptIntent as string | undefined;
  if (promptIntent) {
    for (const pattern of WIDE_ESTABLISHING_PATTERNS) {
      if (pattern.test(promptIntent)) {
        return true;
      }
    }
  }

  // Vérifier actionLine (équivalent de description pour StoryboardPanel)
  const actionLine = (panel as Record<string, unknown>).actionLine as string | undefined;
  if (actionLine) {
    for (const pattern of WIDE_ESTABLISHING_PATTERNS) {
      if (pattern.test(actionLine)) {
        return true;
      }
    }
  }

  // Vérifier panelPurpose pour StoryboardPanel
  const panelPurpose = (panel as Record<string, unknown>).panelPurpose as string | undefined;
  if (panelPurpose === "establishing" || panelPurpose === "environment") {
    return true;
  }

  return false;
}

/**
 * P0.4 — Normalise les render modes contradictoires.
 */
export function runRenderModeNormalizer(
  input: RenderModeNormalizerInput,
): RenderModeNormalizerResult {
  const { panels } = input;
  let fixed = 0;
  const contradictions: string[] = [];

  for (const panel of panels) {
    if (hasCharacterFocusWideContradiction(panel)) {
      const panelId = (panel as Record<string, unknown>).panelId as string | undefined;
      const panelNumber = (panel as Record<string, unknown>).panelNumber as number | undefined;
      const id = panelId ?? `p${panelNumber ?? "?"}`;
      contradictions.push(`panel=${id} was character_focus + wide/establishing`);

      // P0.4 — Corriger le renderMode (valeur valide StoryboardRenderMode)
      (panel as Record<string, unknown>).renderMode = "establishing_environment";
      (panel as Record<string, unknown>).subjectFocus = "environment";

      fixed++;
    }
  }

  console.info(
    `[render-mode-normalizer] fixed=${fixed} contradictions=${contradictions.length > 0 ? contradictions.slice(0, 3).join(", ") : "0"}`,
  );

  return { panels, fixed, contradictions };
}
