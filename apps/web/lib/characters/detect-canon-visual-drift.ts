/**
 * P1.6 — Détection des changements canon visuels côté UI.
 *
 * Quand l'utilisateur édite un personnage, on compare l'état d'origine
 * (tel que chargé) avec l'état courant du formulaire. Si un champ critique
 * change (traits durs, outfit, visualProfile, bodyState, DNA…), on propose :
 *   - soit de générer une nouvelle ref candidate
 *   - soit de promouvoir en primaire
 *
 * Le détecteur est pur et sans dépendance React : utilisable côté
 * composant, côté hook, et côté test.
 */

type CharacterVisualSnapshot = {
  appearance?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  outfitDefault?: string | null;
  visualProfile?: unknown;
  bodyState?: unknown;
  wardrobeProfile?: unknown;
  stableVisualDNA?: unknown;
};

export type VisualDriftAxis =
  | "appearance"
  | "hairColor"
  | "eyeColor"
  | "outfitDefault"
  | "visualProfile"
  | "bodyState"
  | "wardrobeProfile"
  | "stableVisualDNA";

export type VisualDriftDetection = {
  hasDrift: boolean;
  changedAxes: VisualDriftAxis[];
  critical: VisualDriftAxis[];
  canCritical: VisualDriftAxis[];
};

const CRITICAL_AXES: ReadonlySet<VisualDriftAxis> = new Set<VisualDriftAxis>([
  "appearance",
  "hairColor",
  "eyeColor",
  "bodyState",
  "stableVisualDNA",
]);

function stableStringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function hasChanged(a: unknown, b: unknown): boolean {
  return stableStringify(a) !== stableStringify(b);
}

export function detectCanonVisualDrift(
  initial: CharacterVisualSnapshot,
  current: CharacterVisualSnapshot,
): VisualDriftDetection {
  const axes: VisualDriftAxis[] = [
    "appearance",
    "hairColor",
    "eyeColor",
    "outfitDefault",
    "visualProfile",
    "bodyState",
    "wardrobeProfile",
    "stableVisualDNA",
  ];
  const changedAxes = axes.filter((ax) => hasChanged(initial[ax], current[ax]));
  const critical = changedAxes.filter((ax) => CRITICAL_AXES.has(ax));
  return {
    hasDrift: changedAxes.length > 0,
    changedAxes,
    critical,
    canCritical: Array.from(CRITICAL_AXES),
  };
}
