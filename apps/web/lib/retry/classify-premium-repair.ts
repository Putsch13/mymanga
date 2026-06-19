/**
 * P2.4 — Orchestrateur d'auto-réparation premium.
 *
 * Map un type d'issue validée (output visual-QA / premium contract) vers un
 * `PremiumRepairMode`, qui est le "mode" logique à passer au flow retry.
 * Le but est d'arrêter de traiter tous les rerolls comme "normal retry" :
 * un panel qui a trahi le contrat `missing_weapon` a besoin d'un reroll
 * avec focus prop renforcé, pas d'une simple réflexion.
 *
 * Utilisé par :
 *   - GET /chapter-health (P5.1) pour afficher l'action recommandée
 *   - le flow retry amont pour prioriser refs / LoRAs / prompts
 */

export const PREMIUM_BREACH_TYPES = [
  "missing_prop",
  "missing_weapon",
  "missing_device",
  "wrong_subject_focus",
  "missing_dialogue_anchor",
  "missing_enemy_presence",
  "npc_population_missing",
  "cutaway_not_respected",
  "cutaway_collapsed_to_hero",
  "wrong_cutaway_target",
  "object_used_but_not_visible",
  "missing_environment_establishing",
] as const;

export type PremiumBreachType = typeof PREMIUM_BREACH_TYPES[number];

export type PremiumRepairMode =
  | "prop"
  | "subject_focus"
  | "speaker"
  | "enemy_presence"
  | "npc_population"
  | "cutaway"
  | "environment";

export function classifyPremiumBreach(type: PremiumBreachType): PremiumRepairMode {
  switch (type) {
    case "missing_prop":
    case "missing_weapon":
    case "missing_device":
    case "object_used_but_not_visible":
      return "prop";
    case "wrong_subject_focus":
      return "subject_focus";
    case "missing_dialogue_anchor":
      return "speaker";
    case "missing_enemy_presence":
      return "enemy_presence";
    case "npc_population_missing":
      return "npc_population";
    case "cutaway_not_respected":
    case "cutaway_collapsed_to_hero":
    case "wrong_cutaway_target":
      return "cutaway";
    case "missing_environment_establishing":
      return "environment";
  }
}

/**
 * Reçoit la liste brute d'issues type (venant de `metadata.validationDetails.issues`)
 * et retourne un plan de réparation :
 *   - le mode principal (issue "dominante", critique en priorité)
 *   - la liste complète des modes à appliquer (ex: un panel peut être à la
 *     fois `wrong_subject_focus` + `missing_weapon`)
 *   - un flag `contractualCritical` à remonter du contrat du panel
 */
export function planPremiumRepair(params: {
  breachTypes: string[];
  contractualCritical: boolean;
}): {
  primary: PremiumRepairMode | null;
  modes: PremiumRepairMode[];
  contractualCritical: boolean;
} {
  const validBreaches = params.breachTypes.filter(
    (t): t is PremiumBreachType => (PREMIUM_BREACH_TYPES as readonly string[]).includes(t),
  );
  const modes = Array.from(new Set(validBreaches.map(classifyPremiumBreach)));
  // Priorité : prop > enemy > cutaway > subject_focus > npc > environment > speaker.
  const priority: PremiumRepairMode[] = [
    "prop",
    "enemy_presence",
    "cutaway",
    "subject_focus",
    "npc_population",
    "environment",
    "speaker",
  ];
  const primary = priority.find((m) => modes.includes(m)) ?? null;
  return {
    primary,
    modes,
    contractualCritical: params.contractualCritical,
  };
}
