/**
 * Repair actions — structured auto-repair buttons for the wizard.
 *
 * Each repair action maps a blocker code to an API call and a user-facing label.
 * The wizard renders these as buttons with loading states.
 */

export type RepairActionId =
  | "analyze_story"
  | "create_npcs"
  | "create_decors"
  | "repair_plan"
  | "repair_dialogues"
  | "complete_canon_pack";

export interface RepairAction {
  id: RepairActionId;
  label: string;
  description: string;
  blockerCodes: string[];
  endpoint: (ctx: RepairContext) => string;
  method: "POST" | "PUT";
}

export interface RepairContext {
  projectId: string;
  chapterId: string;
  characterId?: string;
}

export const REPAIR_ACTIONS: RepairAction[] = [
  {
    id: "analyze_story",
    label: "Analyser l'histoire",
    description: "Compile l'intention en événements et personnages structurés.",
    blockerCodes: ["INTENT_CONTRACT_REQUIRED", "intent_narrative_missing"],
    endpoint: (ctx) =>
      `/api/projects/${ctx.projectId}/chapters/${ctx.chapterId}/intent-compile`,
    method: "POST",
  },
  {
    id: "create_npcs",
    label: "Créer les PNJ depuis l'histoire",
    description: "Détecte et crée les groupes de PNJ depuis l'intention.",
    blockerCodes: ["npc_group_missing", "missing_npc_visual_dna"],
    endpoint: (ctx) =>
      `/api/projects/${ctx.projectId}/npc-resolve`,
    method: "POST",
  },
  {
    id: "create_decors",
    label: "Créer les décors depuis l'histoire",
    description: "Génère le monde visuel depuis l'intention et les lieux connus.",
    blockerCodes: ["missing_environment_visual_dna", "VISUAL_WORLD_MISSING"],
    endpoint: (ctx) =>
      `/api/projects/${ctx.projectId}/chapters/${ctx.chapterId}/studio`,
    method: "PUT",
  },
  {
    id: "repair_plan",
    label: "Réparer le plan",
    description: "Régénère le plan du chapitre depuis l'intention analysée.",
    blockerCodes: ["PREMIUM_OUTLINE_CONTRACT_INVALID", "DEGRADED_OUTLINE_FALLBACK"],
    endpoint: (ctx) =>
      `/api/projects/${ctx.projectId}/chapters/${ctx.chapterId}/approved-outline`,
    method: "POST",
  },
  {
    id: "repair_dialogues",
    label: "Réparer les dialogues",
    description: "Régénère uniquement les dialogues manquants.",
    blockerCodes: ["required_dialogue_missing", "required_dialogue_act_no_panel_target"],
    endpoint: (ctx) =>
      `/api/projects/${ctx.projectId}/chapters/${ctx.chapterId}/autofill`,
    method: "POST",
  },
  {
    id: "complete_canon_pack",
    label: "Compléter la fiche personnage",
    description: "Génère la fiche visuelle complète depuis les données existantes.",
    blockerCodes: ["canon_pack_incomplete"],
    endpoint: (ctx) =>
      `/api/characters/${ctx.characterId ?? "unknown"}/generate-visual`,
    method: "POST",
  },
];

/**
 * Given a list of blocker codes, find the matching repair actions.
 */
export function findRepairActions(blockerCodes: string[]): RepairAction[] {
  return REPAIR_ACTIONS.filter((action) =>
    action.blockerCodes.some((code) =>
      blockerCodes.some((bc) => bc === code || bc.startsWith(code)),
    ),
  );
}
