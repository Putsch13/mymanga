/**
 * SceneAnchor — ancre spatiale et visuelle d'une scène.
 * Générée au premier panel de chaque scène, réutilisée par tous les panels suivants
 * et lors des rerolls pour éviter les resets visuels.
 */

export interface SceneAnchor {
  sceneId: string;
  /** ID du premier panel généré (keyframe) qui sert d'ancre visuelle */
  anchorImageId?: string;
  /** Cast présent dans cette scène */
  castLineup: string[];
  /** Description textuelle du layout spatial */
  spatialLayout: string;
  /** Lieu dominant de la scène */
  dominantLocation: string;
  /** Positions relatives des personnages dans le cadre */
  characterPositions: Record<string, "left" | "center" | "right" | "background">;
  /** Mood dominant établi */
  dominantMood: string;
  /** Timestamp de création */
  establishedAt: string;
  /** Météo / heure établies pour la scène */
  weather?: string;
  timeOfDay?: string;
  /** Éléments de décor persistants */
  persistentProps?: string[];
}

/** Créer un SceneAnchor depuis les données de scène */
export function buildSceneAnchor(input: {
  sceneId: string;
  castLineup: string[];
  location: string;
  mood: string;
  weather?: string;
  timeOfDay?: string;
  persistentProps?: string[];
  anchorImageId?: string;
}): SceneAnchor {
  const positions: Record<string, "left" | "center" | "right" | "background"> = {};
  const positionOptions: Array<"left" | "center" | "right"> = ["left", "center", "right"];
  input.castLineup.forEach((name, index) => {
    positions[name] = positionOptions[index % 3] ?? "center";
  });

  return {
    sceneId: input.sceneId,
    anchorImageId: input.anchorImageId,
    castLineup: input.castLineup,
    spatialLayout: input.castLineup.length > 0
      ? `${input.castLineup.join(" and ")} in ${input.location}`
      : input.location,
    dominantLocation: input.location,
    characterPositions: positions,
    dominantMood: input.mood,
    establishedAt: new Date().toISOString(),
    weather: input.weather,
    timeOfDay: input.timeOfDay,
    persistentProps: input.persistentProps,
  };
}

/** Construire le bloc prompt depuis un SceneAnchor */
export function buildSceneAnchorPromptBlock(anchor: SceneAnchor): string {
  const parts: string[] = [];
  parts.push(`Scene anchor: ${anchor.spatialLayout}`);

  const positions = Object.entries(anchor.characterPositions);
  if (positions.length > 0) {
    const posStr = positions.map(([name, pos]) => `${name} on ${pos}`).join(", ");
    parts.push(`Spatial continuity: ${posStr}`);
  }

  if (anchor.weather) parts.push(`Weather: ${anchor.weather}`);
  if (anchor.timeOfDay) parts.push(`Time: ${anchor.timeOfDay}`);
  if (anchor.persistentProps && anchor.persistentProps.length > 0) {
    parts.push(`Persistent props: ${anchor.persistentProps.slice(0, 3).join(", ")}`);
  }

  return parts.join(". ");
}
