/**
 * P7.4 — Politique formelle de drift visuel.
 *
 * Source de vérité unique sur "qu'est-ce qui peut changer entre deux
 * panels du même personnage / lieu ?". Partagée entre :
 *   - Validation post-génération (QA)
 *   - Logique de retry (retry hints positifs/négatifs)
 *   - UI (bannière "Canon visuel modifié")
 *   - Score de stabilité canonique (P7.1)
 *
 * Règle d'or : un trait `hard` ne doit JAMAIS varier sans approbation
 * explicite via `Character.requiresCanonApprovalFor`. Un trait `soft` peut
 * varier selon le contexte narratif (blessure, émotion, tenue alt).
 */

export type DriftAxis =
  | "face_identity"
  | "hair_color"
  | "hair_style"
  | "eye_color"
  | "eye_shape"
  | "skin_tone"
  | "body_build"
  | "silhouette"
  | "height"
  | "scars"
  | "tattoos"
  | "prosthetics"
  | "fixed_accessories"
  | "outfit_default"
  | "outfit_alt"
  | "pose"
  | "expression"
  | "light"
  | "angle";

export type DriftClass = "hard" | "soft" | "free";

export const DRIFT_POLICY: Readonly<Record<DriftAxis, DriftClass>> = {
  // HARD — interdit sans approbation explicite
  face_identity: "hard",
  hair_color: "hard",
  eye_color: "hard",
  skin_tone: "hard",
  body_build: "hard",
  silhouette: "hard",
  height: "hard",
  scars: "hard",
  tattoos: "hard",
  prosthetics: "hard",
  fixed_accessories: "hard",
  outfit_default: "hard",

  // SOFT — peut varier selon contexte narratif (cf. `wardrobeProfile.altOutfits`)
  hair_style: "soft",
  eye_shape: "soft",
  outfit_alt: "soft",

  // FREE — varie à chaque panel, n'entre pas dans la continuité canon
  pose: "free",
  expression: "free",
  light: "free",
  angle: "free",
};

export function classifyDriftAxis(axis: DriftAxis): DriftClass {
  return DRIFT_POLICY[axis];
}

export function isHardDriftAxis(axis: DriftAxis): boolean {
  return DRIFT_POLICY[axis] === "hard";
}

/**
 * Filtre une liste de traits en conservant seulement ceux classés `hard`.
 * Utilisé par le retry pour construire la `mustKeep` list.
 */
export function filterHardAxes<T extends { axis: DriftAxis }>(items: T[]): T[] {
  return items.filter((i) => DRIFT_POLICY[i.axis] === "hard");
}

/**
 * Décide si un changement sur un axe donné requiert une approbation canon
 * explicite. Lit `Character.requiresCanonApprovalFor` (array de strings
 * libre, cf. schema.prisma) + la politique par défaut (toutes les axes hard).
 */
export function requiresCanonApproval(
  axis: DriftAxis,
  requiresCanonApprovalFor: readonly string[] | null | undefined,
): boolean {
  const list = (requiresCanonApprovalFor ?? []).map((s) => s.toLowerCase());
  if (list.includes(axis)) return true;
  if (list.includes("*")) return true;
  return isHardDriftAxis(axis);
}

/**
 * Helper produisant les deux blocs "mustKeep / canVary" à partir des
 * axes d'un personnage canon, destinés à alimenter les hints retry et
 * les negative prompts.
 */
export type DriftHintBundle = {
  mustKeep: DriftAxis[];
  canVary: DriftAxis[];
  free: DriftAxis[];
};

export function buildDriftHintBundle(enabledAxes: ReadonlyArray<DriftAxis>): DriftHintBundle {
  const mustKeep: DriftAxis[] = [];
  const canVary: DriftAxis[] = [];
  const free: DriftAxis[] = [];
  for (const axis of enabledAxes) {
    const c = DRIFT_POLICY[axis];
    if (c === "hard") mustKeep.push(axis);
    else if (c === "soft") canVary.push(axis);
    else free.push(axis);
  }
  return { mustKeep, canVary, free };
}

/**
 * Change-policy convenience — lit les flags `canChangeXxx` de Character
 * (cf. schema.prisma) et produit la liste d'axes que ce perso tolère en
 * `soft` au-delà de la politique par défaut.
 */
export type CharacterChangePolicy = {
  canChangeHair?: boolean | null;
  canChangeOutfitFreely?: boolean | null;
  canChangeVisibleScars?: boolean | null;
};

export function overrideDriftForCharacter(policy: CharacterChangePolicy): Partial<Record<DriftAxis, DriftClass>> {
  const overrides: Partial<Record<DriftAxis, DriftClass>> = {};
  if (policy.canChangeHair) overrides.hair_color = "soft";
  if (policy.canChangeOutfitFreely) overrides.outfit_default = "soft";
  if (policy.canChangeVisibleScars) overrides.scars = "soft";
  return overrides;
}

/**
 * Applique les overrides perso sur la policy par défaut et renvoie la
 * classification effective pour un axe donné.
 */
export function resolveEffectiveDriftClass(
  axis: DriftAxis,
  overrides: Partial<Record<DriftAxis, DriftClass>>,
): DriftClass {
  return overrides[axis] ?? DRIFT_POLICY[axis];
}
