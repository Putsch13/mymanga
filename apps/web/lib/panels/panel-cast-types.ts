/**
 * P2.2 — Type canonique pour `PanelCast`.
 *
 * Historiquement, chaque consommateur redéfinissait son propre contrat
 * (generate-visual, retry route, narrative-pass, studio). Résultat : pas
 * de garantie que `characterId` soit toujours présent, résolution par nom
 * en fallback, collisions héros/PNJ sur duplicate names.
 *
 * Policy stable à partir d'ici :
 *   - `focus.characterId` et `supporting[].characterId` sont *obligatoires*
 *     dès qu'un personnage est connu du projet (hero / secondary / important
 *     supporting / recurring NPC).
 *   - `name` reste utile pour les prompts lisibles mais ne doit plus être
 *     utilisé comme clé d'identité dans les chemins critiques (retry,
 *     validation QA, LoRA routing).
 *   - `role` est une annotation lisible ("hero", "antagonist", "ally"…) ;
 *     la source de vérité pour le tiering reste `Character.roleType`.
 */

export type PanelCastRole =
  | "hero"
  | "antagonist"
  | "ally"
  | "mentor"
  | "supporting"
  | "important_npc"
  | "named_npc"
  | "enemy"
  | "reaction"
  | "witness"
  | "background";

export type PanelCastMember = {
  /**
   * ID stable `Character.id`. Peut être null *uniquement* pour un NPC anonyme
   * jamais persisté (ex: "foule", "garde random"). Dans tous les autres cas,
   * le producteur du panelCast DOIT remplir cette clé.
   */
  characterId: string | null;
  name: string;
  role?: PanelCastRole | string | null;
};

export type PanelCast = {
  focus: PanelCastMember | null;
  supporting: PanelCastMember[];
};

/**
 * Garde-fou à utiliser au moment où on *consomme* un panelCast : on log un
 * warning si un membre sans `characterId` est rencontré dans un chemin
 * critique (retry, validation, LoRA), pour remonter vers le producteur.
 */
export function assertPanelCastHasIds(cast: PanelCast | null | undefined, context: string): void {
  if (!cast) return;
  if (cast.focus && !cast.focus.characterId) {
    console.warn(`[panelCast:missing_id] context=${context} kind=focus name=${cast.focus.name}`);
  }
  for (const m of cast.supporting) {
    if (!m.characterId) {
      console.warn(`[panelCast:missing_id] context=${context} kind=supporting name=${m.name}`);
    }
  }
}

/**
 * Extrait la liste complète des `characterId` non-null (focus + supporting).
 * Ordre stable : focus en premier.
 */
export function collectPanelCastCharacterIds(cast: PanelCast | null | undefined): string[] {
  if (!cast) return [];
  const out: string[] = [];
  if (cast.focus?.characterId) out.push(cast.focus.characterId);
  for (const m of cast.supporting) {
    if (m.characterId && !out.includes(m.characterId)) out.push(m.characterId);
  }
  return out;
}

/**
 * Version souple qui accepte n'importe quelle forme "raw" (metadata ou
 * SceneImage.panelCast) et renvoie un PanelCast canonique. Tolère
 * `characterId: undefined` — on normalise vers `null`.
 */
export function normalizePanelCast(raw: unknown): PanelCast | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const focusRaw = obj.focus && typeof obj.focus === "object" ? (obj.focus as Record<string, unknown>) : null;
  const supportingRaw = Array.isArray(obj.supporting) ? (obj.supporting as Record<string, unknown>[]) : [];
  return {
    focus: focusRaw
      ? {
          characterId: typeof focusRaw.characterId === "string" ? focusRaw.characterId : null,
          name: typeof focusRaw.name === "string" ? focusRaw.name : "",
          role: typeof focusRaw.role === "string" ? focusRaw.role : null,
        }
      : null,
    supporting: supportingRaw.map((s) => ({
      characterId: typeof s.characterId === "string" ? s.characterId : null,
      name: typeof s.name === "string" ? s.name : "",
      role: typeof s.role === "string" ? s.role : null,
    })),
  };
}
