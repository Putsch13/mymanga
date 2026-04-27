/**
 * assert-prompt-contract-coverage.ts
 *
 * P0 — Vérifie que le prompt final contient tous les éléments contractuels obligatoires.
 *
 * Règles:
 *   - Les éléments contract_required ne doivent JAMAIS être coupés
 *   - Si le prompt dépasse la limite, couper les éléments optionnels
 *   - En premium, throw si un élément obligatoire est manquant
 */

export type PromptConstraintPriority = 
  | "contract_required"
  | "panel_required" 
  | "style" 
  | "optional";

export interface PromptElement {
  content: string;
  priority: PromptConstraintPriority;
  type: "character" | "action" | "location" | "prop" | "npc" | "text_policy" | "style" | "mood";
}

export interface PromptContractCoverageInput {
  prompt: string;
  requiredCharacterNames: string[];
  requiredAction?: string;
  requiredLocation?: string;
  requiredProps: string[];
  requiredNpcGroups: string[];
  panelId: string;
}

export interface PromptContractCoverageResult {
  valid: boolean;
  missingElements: string[];
  warnings: string[];
  coverage: {
    characters: number;
    props: number;
    npcs: number;
    location: boolean;
    action: boolean;
  };
}

function normalizeForMatch(text: string): string {
  return text.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function promptContains(prompt: string, term: string): boolean {
  const normalizedPrompt = normalizeForMatch(prompt);
  const normalizedTerm = normalizeForMatch(term);

  if (normalizedPrompt.includes(normalizedTerm)) {
    return true;
  }

  const termWords = normalizedTerm.split(" ").filter(w => w.length > 2);
  if (termWords.length > 1) {
    const matchedWords = termWords.filter(w => normalizedPrompt.includes(w));
    return matchedWords.length >= Math.ceil(termWords.length * 0.6);
  }

  return false;
}

export function checkPromptContractCoverage(
  input: PromptContractCoverageInput
): PromptContractCoverageResult {
  const missingElements: string[] = [];
  const warnings: string[] = [];

  let charactersCovered = 0;
  for (const name of input.requiredCharacterNames) {
    if (promptContains(input.prompt, name)) {
      charactersCovered++;
    } else {
      missingElements.push(`character:${name}`);
    }
  }

  let propsCovered = 0;
  for (const prop of input.requiredProps) {
    if (promptContains(input.prompt, prop)) {
      propsCovered++;
    } else {
      warnings.push(`prop_missing:${prop}`);
    }
  }

  let npcsCovered = 0;
  for (const npc of input.requiredNpcGroups) {
    if (promptContains(input.prompt, npc)) {
      npcsCovered++;
    } else {
      warnings.push(`npc_missing:${npc}`);
    }
  }

  const locationCovered = !input.requiredLocation || 
    promptContains(input.prompt, input.requiredLocation);
  if (input.requiredLocation && !locationCovered) {
    warnings.push(`location_missing:${input.requiredLocation}`);
  }

  const actionCovered = !input.requiredAction || 
    promptContains(input.prompt, input.requiredAction);
  if (input.requiredAction && !actionCovered) {
    warnings.push(`action_missing:${input.requiredAction}`);
  }

  return {
    valid: missingElements.length === 0,
    missingElements,
    warnings,
    coverage: {
      characters: input.requiredCharacterNames.length > 0 
        ? charactersCovered / input.requiredCharacterNames.length 
        : 1,
      props: input.requiredProps.length > 0 
        ? propsCovered / input.requiredProps.length 
        : 1,
      npcs: input.requiredNpcGroups.length > 0 
        ? npcsCovered / input.requiredNpcGroups.length 
        : 1,
      location: locationCovered,
      action: actionCovered,
    },
  };
}

export function assertPromptContractCoverage(
  input: PromptContractCoverageInput,
  isPremiumRun: boolean
): void {
  const result = checkPromptContractCoverage(input);

  if (isPremiumRun && !result.valid) {
    throw new Error(
      `prompt_missing_required_contract_term:${input.panelId}:${result.missingElements.join(",")}`
    );
  }
}

export function buildPrioritizedPrompt(
  elements: PromptElement[],
  maxLength: number
): { prompt: string; truncatedElements: string[] } {
  const priorityOrder: PromptConstraintPriority[] = [
    "contract_required",
    "panel_required",
    "style",
    "optional",
  ];

  const sorted = [...elements].sort((a, b) => {
    return priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
  });

  const parts: string[] = [];
  const truncatedElements: string[] = [];
  let currentLength = 0;

  for (const element of sorted) {
    const elementLength = element.content.length + 2;

    if (currentLength + elementLength <= maxLength) {
      parts.push(element.content);
      currentLength += elementLength;
    } else {
      if (element.priority === "contract_required") {
        parts.push(element.content);
        currentLength += elementLength;
      } else {
        truncatedElements.push(`${element.type}:${element.content.slice(0, 30)}...`);
      }
    }
  }

  return {
    prompt: parts.join(". "),
    truncatedElements,
  };
}

export function assertNoContractElementsTruncated(
  truncatedElements: string[],
  isPremiumRun: boolean,
  panelId: string
): void {
  if (!isPremiumRun) return;

  const contractTruncated = truncatedElements.filter(e => 
    e.startsWith("character:") || e.startsWith("action:")
  );

  if (contractTruncated.length > 0) {
    throw new Error(
      `premium_contract_elements_truncated:${panelId}:${contractTruncated.join(",")}`
    );
  }
}
