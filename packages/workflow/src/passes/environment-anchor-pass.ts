/**
 * P0.3 — Environment Anchor Pass
 *
 * Injecte environmentAnchorId dans tous les panels qui n'en ont pas.
 * Garantit que chaque panel a un décor exploitable.
 *
 * Supporte à la fois StoryboardPanel (visualAnchors.environmentAnchorId)
 * et PanelBlueprintPremium (pas de champ natif, on utilise un champ dynamique).
 */

/** Panel générique qui peut être StoryboardPanel ou similaire */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPanel = Record<string, any>;

export interface EnvironmentAnchorPassInput {
  panels: AnyPanel[];
  /** ID du lieu principal (premier environnement disponible) */
  primaryEnvironmentAnchorId: string | null;
  /** Lieux disponibles par beatId */
  beatLocationMap?: Map<string, string>;
}

export interface EnvironmentAnchorPassResult {
  panels: AnyPanel[];
  anchored: number;
  alreadyAnchored: number;
  missing: number;
}

/**
 * P0.3 — Récupère le beatId d'un panel (supporte plusieurs formats)
 */
function getPanelBeatId(panel: AnyPanel): string | null {
  if ("sourceBeatId" in panel && typeof panel.sourceBeatId === "string") {
    return panel.sourceBeatId;
  }
  if ("beatId" in panel && typeof panel.beatId === "string") {
    return panel.beatId;
  }
  return null;
}

/**
 * P0.3 — Récupère l'environmentAnchorId actuel d'un panel
 */
function getEnvironmentAnchorId(panel: AnyPanel): string | null {
  // StoryboardPanel format
  if ("visualAnchors" in panel && panel.visualAnchors) {
    const anchors = panel.visualAnchors as { environmentAnchorId?: string | null };
    return anchors.environmentAnchorId ?? null;
  }
  // Fallback format
  if ("environmentAnchorId" in panel && typeof panel.environmentAnchorId === "string") {
    return panel.environmentAnchorId;
  }
  return null;
}

/**
 * P0.3 — Définit l'environmentAnchorId sur un panel
 */
function setEnvironmentAnchorId(panel: AnyPanel, anchorId: string): void {
  // StoryboardPanel format
  if ("visualAnchors" in panel && panel.visualAnchors) {
    (panel.visualAnchors as { environmentAnchorId?: string | null }).environmentAnchorId = anchorId;
    return;
  }
  // Créer visualAnchors si absent
  if (!("visualAnchors" in panel)) {
    (panel as Record<string, unknown>).visualAnchors = {
      characterIds: [],
      environmentAnchorId: anchorId,
      previousPanelAnchorId: null,
    };
    return;
  }
  // Fallback
  (panel as Record<string, unknown>).environmentAnchorId = anchorId;
}

/**
 * P0.3 — Injecte environmentAnchorId dans tous les panels.
 *
 * Règles :
 * 1. Si panel a déjà un environmentAnchorId, on garde
 * 2. Si le beatId a un lieu dédié, on utilise ce lieu
 * 3. Sinon on utilise primaryEnvironmentAnchorId
 */
export function runEnvironmentAnchorPass(
  input: EnvironmentAnchorPassInput,
): EnvironmentAnchorPassResult {
  const { panels, primaryEnvironmentAnchorId, beatLocationMap } = input;
  let anchored = 0;
  let alreadyAnchored = 0;
  let missing = 0;

  for (const panel of panels) {
    // Déjà ancré
    const existingAnchor = getEnvironmentAnchorId(panel);
    if (existingAnchor) {
      alreadyAnchored++;
      continue;
    }

    // Chercher un lieu dédié au beat
    const beatId = getPanelBeatId(panel);
    const beatLocation = beatId ? beatLocationMap?.get(beatId) : null;
    const anchorId = beatLocation ?? primaryEnvironmentAnchorId;

    if (anchorId) {
      setEnvironmentAnchorId(panel, anchorId);
      anchored++;
    } else {
      missing++;
    }
  }

  console.info(
    `[environment-anchor-pass] panels=${panels.length} anchored=${anchored} alreadyAnchored=${alreadyAnchored} missing=${missing}`,
  );

  return { panels, anchored, alreadyAnchored, missing };
}

/**
 * P0.3 — Extrait le primaryEnvironmentAnchorId depuis les lieux disponibles.
 */
export function extractPrimaryEnvironmentAnchorId(
  locations: Array<{ id: string; name?: string | null }>,
  temporaryLocations: Array<{ id: string; label: string }>,
): string | null {
  // Priorité aux lieux DB
  if (locations.length > 0) {
    return locations[0].id;
  }
  // Fallback sur les lieux temporaires
  if (temporaryLocations.length > 0) {
    return temporaryLocations[0].id;
  }
  return null;
}
