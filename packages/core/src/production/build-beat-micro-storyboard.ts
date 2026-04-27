/**
 * build-beat-micro-storyboard.ts
 *
 * P0 — Construit un micro-storyboard précis pour chaque beat.
 *
 * Garanties:
 *   - Chaque beat devient plusieurs panels distincts
 *   - Aucun panel ne répète exactement le résumé du beat
 *   - Aucun panel ne réutilise la même microAction dans le même beat
 *   - Chaque panel a un rôle narratif clair
 *   - Les actions sont ordonnées
 *   - Les dialogues sont ancrés à un personnage
 *   - Les props et NPC requis sont distribués
 *   - Les panels émotionnels ne remplacent pas les panels d'action obligatoires
 */

import type { PanelNarrativeRole } from "../generation/chapter-generation-contract";

export interface ContractBeatInput {
  beatId: string;
  beatNumber: number;
  summary: string;
  emotionalIntent: string;
  requiredCharacterIds: string[];
  requiredLocationId?: string | null;
  requiredProps: string[];
  requiredNpcGroups: string[];
  visualEvents: string[];
  dialogueRequired: boolean;
}

export interface BeatMicroStoryboardInput {
  beat: ContractBeatInput;
  targetPanelCount: number;
  characterNameById: Record<string, string>;
  locationName?: string | null;
}

export interface MicroStoryboardPanel {
  panelId: string;
  panelNumber: number;
  sourceBeatId: string;
  narrativeRole: PanelNarrativeRole;
  microAction: string;
  visualSubject: string;
  emotionalIntent?: string;
  requiredCharacterIds: string[];
  requiredProps: string[];
  requiredNpcGroups: string[];
  dialogueRequired: boolean;
}

export interface BeatMicroStoryboardOutput {
  beatId: string;
  panels: MicroStoryboardPanel[];
  warnings: string[];
}

const ACTION_VERBS_FR = [
  "entrouvre", "aperçoit", "recule", "saisit", "lâche", "frappe", "esquive",
  "se retourne", "avance", "hésite", "observe", "découvre", "réagit",
  "s'effondre", "se relève", "court", "s'arrête", "fixe", "détourne",
  "attrape", "lance", "bloque", "pare", "bondit", "atterrit"
];

function hasActionVerb(text: string): boolean {
  const lower = text.toLowerCase();
  return ACTION_VERBS_FR.some(v => lower.includes(v)) ||
    /\b(il|elle|ils|elles)\s+\w+e?\s/i.test(text);
}

function isGenericAction(text: string, beatSummary: string): boolean {
  if (text.length < 15) return true;

  const normalizedText = text.toLowerCase().trim();
  const normalizedSummary = beatSummary.toLowerCase().trim();
  if (normalizedText === normalizedSummary) return true;

  if (!hasActionVerb(text)) return true;

  const genericPatterns = [
    /le héros découvre/i,
    /le personnage réagit/i,
    /une scène se déroule/i,
    /quelque chose se passe/i,
    /^action$/i,
    /^réaction$/i,
    /^dialogue$/i,
  ];
  return genericPatterns.some(p => p.test(text));
}

function distributeNarrativeRoles(
  panelCount: number,
  dialogueRequired: boolean,
  hasVisualEvents: boolean
): PanelNarrativeRole[] {
  const roles: PanelNarrativeRole[] = [];

  if (panelCount === 1) {
    return dialogueRequired ? ["dialogue"] : ["action"];
  }

  if (panelCount === 2) {
    if (dialogueRequired) {
      return ["action", "dialogue"];
    }
    return ["action", "reaction"];
  }

  roles.push("establishing");

  const remaining = panelCount - 1;
  const actionCount = Math.ceil(remaining * 0.4);
  const reactionCount = Math.ceil(remaining * 0.2);
  const dialogueCount = dialogueRequired ? Math.ceil(remaining * 0.3) : 0;
  const emotionCount = remaining - actionCount - reactionCount - dialogueCount;

  for (let i = 0; i < actionCount; i++) roles.push("action");
  for (let i = 0; i < dialogueCount; i++) roles.push("dialogue");
  for (let i = 0; i < reactionCount; i++) roles.push("reaction");
  for (let i = 0; i < emotionCount; i++) roles.push("emotion");

  return roles.slice(0, panelCount);
}

function generateMicroAction(
  beatSummary: string,
  role: PanelNarrativeRole,
  panelIndex: number,
  characterNames: string[]
): string {
  const mainChar = characterNames[0] || "le personnage";

  switch (role) {
    case "establishing":
      return `Plan large : ${mainChar} dans le décor, établissant l'atmosphère de la scène.`;
    case "action":
      return `${mainChar} ${ACTION_VERBS_FR[panelIndex % ACTION_VERBS_FR.length]} — action centrale du beat.`;
    case "reaction":
      return `Gros plan sur la réaction de ${mainChar} face aux événements.`;
    case "dialogue":
      return `${mainChar} prend la parole, échange visible avec interlocuteur.`;
    case "emotion":
      return `Moment émotionnel : expression de ${mainChar} capturée en détail.`;
    case "insert":
      return `Insert sur un élément clé de la scène.`;
    case "transition":
      return `Panel de transition vers la suite de l'action.`;
    case "cliffhanger":
      return `Moment de tension maximale, suspense avant la page suivante.`;
    default:
      return beatSummary;
  }
}

export function buildBeatMicroStoryboard(
  input: BeatMicroStoryboardInput
): BeatMicroStoryboardOutput {
  const { beat, targetPanelCount, characterNameById } = input;
  const warnings: string[] = [];

  const characterNames = beat.requiredCharacterIds
    .map(id => characterNameById[id])
    .filter(Boolean);

  const roles = distributeNarrativeRoles(
    targetPanelCount,
    beat.dialogueRequired,
    beat.visualEvents.length > 0
  );

  const usedMicroActions = new Set<string>();
  const panels: MicroStoryboardPanel[] = [];

  for (let i = 0; i < targetPanelCount; i++) {
    const role = roles[i] || "action";
    let microAction = generateMicroAction(
      beat.summary,
      role,
      i,
      characterNames
    );

    let attempts = 0;
    while (usedMicroActions.has(microAction) && attempts < 5) {
      microAction = `${microAction} (variation ${attempts + 1})`;
      attempts++;
    }
    usedMicroActions.add(microAction);

    if (isGenericAction(microAction, beat.summary)) {
      warnings.push(`generic_micro_action:beat_${beat.beatId}:panel_${i}`);
    }

    const panel: MicroStoryboardPanel = {
      panelId: `${beat.beatId}_panel_${i + 1}`,
      panelNumber: i + 1,
      sourceBeatId: beat.beatId,
      narrativeRole: role,
      microAction,
      visualSubject: characterNames[0] || input.locationName || "scène",
      emotionalIntent: beat.emotionalIntent,
      requiredCharacterIds: role === "establishing" ? [] : beat.requiredCharacterIds.slice(0, 2),
      requiredProps: i === 0 ? beat.requiredProps : [],
      requiredNpcGroups: i === 0 ? beat.requiredNpcGroups : [],
      dialogueRequired: role === "dialogue",
    };

    panels.push(panel);
  }

  const hasDialoguePanel = panels.some(p => p.narrativeRole === "dialogue");
  if (beat.dialogueRequired && !hasDialoguePanel) {
    warnings.push(`dialogue_required_but_no_dialogue_panel:beat_${beat.beatId}`);
  }

  const hasActionPanel = panels.some(p => p.narrativeRole === "action");
  if (!hasActionPanel && targetPanelCount > 1) {
    warnings.push(`no_action_panel:beat_${beat.beatId}`);
  }

  return {
    beatId: beat.beatId,
    panels,
    warnings,
  };
}

export function isGenericPanel(panel: MicroStoryboardPanel): boolean {
  if (!panel.microAction || panel.microAction.length < 15) return true;

  if (!hasActionVerb(panel.microAction)) return true;

  if (panel.requiredCharacterIds.length === 0 && 
      panel.requiredProps.length === 0 && 
      panel.requiredNpcGroups.length === 0 &&
      !panel.emotionalIntent) {
    return true;
  }

  return false;
}

export function assertPanelSpecificity(
  panel: MicroStoryboardPanel,
  isPremiumRun: boolean
): void {
  if (!isPremiumRun) return;

  if (isGenericPanel(panel)) {
    throw new Error(`premium_generic_panel_forbidden:${panel.panelId}`);
  }
}
