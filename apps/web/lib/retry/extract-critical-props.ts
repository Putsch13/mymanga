/**
 * P1.4 (sprint 3) — Extraction normalisée des props critiques depuis le
 * `panelContract` persistant en DB (SceneImage.metadata.panelContract).
 *
 * Problème adressé : la route retry lit directement
 * `metadata.panelContract.requiredPropsTyped` en castant en
 * `Array<{ mustBeVisible: boolean }>`. Ça fonctionnait tant que le shape
 * exact était respecté, mais le moindre champ manquant ou mal typé pouvait
 * faire dériver un prop critique vers `mustBeVisible = false` silencieusement
 * (donc disparaître en reroll).
 *
 * Ce helper :
 *   1. lit defensivement le JSON metadata
 *   2. normalise chaque entrée en `CriticalProp` typé
 *   3. retourne `hasMandatoryProps` (au moins un prop mustBeVisible)
 *   4. retourne aussi la liste des noms canoniques visibles (utile pour les
 *      retries compliance: on injecte ces noms dans le prompt positif afin
 *      que le reroll ne les efface pas).
 */

export type CriticalProp = {
  canonicalName: string;
  mustBeVisible: boolean;
  narrativeRole: string | null;
  visibilityMode: string | null;
  category: string | null;
};

export type CriticalPropsExtraction = {
  allProps: CriticalProp[];
  mandatoryProps: CriticalProp[];
  hasMandatoryProps: boolean;
  mandatoryCanonicalNames: string[];
};

function readString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function readBool(v: unknown): boolean {
  return v === true;
}

function normalizeProp(entry: unknown): CriticalProp | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  const canonicalName = readString(e.canonicalName);
  if (!canonicalName) return null;
  return {
    canonicalName,
    mustBeVisible: readBool(e.mustBeVisible),
    narrativeRole: readString(e.narrativeRole),
    visibilityMode: readString(e.visibilityMode),
    category: readString(e.category),
  };
}

/**
 * Extrait les props critiques d'un panelContract JSON.
 *
 * @param panelContractMeta peut être `undefined`, `null`, un objet arbitraire
 *   provenant de `SceneImage.metadata.panelContract`.
 */
export function extractCriticalPropsFromPanelContractMeta(
  panelContractMeta: unknown,
): CriticalPropsExtraction {
  const obj =
    panelContractMeta && typeof panelContractMeta === "object"
      ? (panelContractMeta as Record<string, unknown>)
      : null;
  const raw = obj && Array.isArray(obj.requiredPropsTyped) ? (obj.requiredPropsTyped as unknown[]) : [];
  const allProps: CriticalProp[] = [];
  for (const entry of raw) {
    const normalized = normalizeProp(entry);
    if (normalized) allProps.push(normalized);
  }
  const mandatoryProps = allProps.filter((p) => p.mustBeVisible);
  return {
    allProps,
    mandatoryProps,
    hasMandatoryProps: mandatoryProps.length > 0,
    mandatoryCanonicalNames: mandatoryProps.map((p) => p.canonicalName),
  };
}
