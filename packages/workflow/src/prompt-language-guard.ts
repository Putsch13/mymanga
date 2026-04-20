import { detectResidualFrenchTokens } from "@manga-ai-studio/ai";

/**
 * Politique du garde linguistique provider (P1.1).
 *
 * Contexte
 * --------
 * Les prompts runtime doivent etre en anglais structure avant envoi au provider
 * image (FAL). Le compilateur canonique produit bien un prompt EN, mais des
 * champs libres (auteur, overrides retry) peuvent reinjecter du FR residuel
 * silencieusement. On applique donc `detectResidualFrenchTokens` au moment
 * exact de l'envoi pour bloquer ou tracer.
 *
 * Politique
 * ---------
 * - `block` : le prompt positif contient plus de `blockThreshold` tokens FR
 *   critiques → on refuse l'envoi (erreur).
 * - `warn`  : resttokens FR < threshold → warning + trace, mais on envoie.
 * - `ok`    : aucun token FR detecte.
 *
 * Par defaut, le seuil bloquant est eleve pour ne pas casser les runs legacy
 * ou les descriptions auteurs qui contiennent un mot FR isole (ex: un nom
 * d'objet "château" qui ne serait pas traduit). On peut serrer la politique
 * via le flag `MANGA_PROMPT_LANGUAGE_GUARD_STRICT=true`.
 */

export type PromptLanguageGuardOutcome = "ok" | "warn" | "block";

export type PromptLanguageGuardResult = {
  outcome: PromptLanguageGuardOutcome;
  positiveTokens: string[];
  negativeTokens: string[];
  message?: string;
};

export type EvaluatePromptLanguageInput = {
  positivePrompt: string;
  negativePrompt?: string;
  /**
   * Seuil au-dessus duquel on bascule en `block` au lieu de `warn`.
   * Defaut : 3 tokens critiques (ou 1 en mode strict).
   */
  blockThreshold?: number;
  /**
   * Si vrai, 1 token FR suffit pour bloquer. Utile pour tests / mode
   * production-sealed.
   */
  strict?: boolean;
};

function resolveStrictFlag(strictOverride: boolean | undefined): boolean {
  if (typeof strictOverride === "boolean") return strictOverride;
  const env = process.env.MANGA_PROMPT_LANGUAGE_GUARD_STRICT;
  return env === "true" || env === "1";
}

export function evaluatePromptLanguage(
  input: EvaluatePromptLanguageInput,
): PromptLanguageGuardResult {
  const strict = resolveStrictFlag(input.strict);
  const blockThreshold = input.blockThreshold ?? (strict ? 1 : 3);
  const positiveTokens = detectResidualFrenchTokens(input.positivePrompt ?? "");
  const negativeTokens = input.negativePrompt
    ? detectResidualFrenchTokens(input.negativePrompt)
    : [];

  const total = positiveTokens.length + negativeTokens.length;

  if (total === 0) {
    return { outcome: "ok", positiveTokens, negativeTokens };
  }

  if (positiveTokens.length >= blockThreshold) {
    return {
      outcome: "block",
      positiveTokens,
      negativeTokens,
      message: `Prompt positif contient ${positiveTokens.length} tokens FR residuels (seuil=${blockThreshold}, strict=${strict}): ${positiveTokens.join(", ")}`,
    };
  }

  return {
    outcome: "warn",
    positiveTokens,
    negativeTokens,
    message: `Prompt contient ${total} tokens FR residuels (positif=${positiveTokens.join("|")}, negatif=${negativeTokens.join("|")})`,
  };
}

/**
 * Variante qui jette une erreur typee si la politique est `block`. A utiliser
 * dans les chemins critiques (avant `runRoutedImageGeneration`).
 */
export class ResidualFrenchPromptError extends Error {
  public readonly positiveTokens: string[];
  public readonly negativeTokens: string[];
  constructor(result: PromptLanguageGuardResult) {
    super(result.message ?? "Residual French tokens detected in runtime prompt");
    this.name = "ResidualFrenchPromptError";
    this.positiveTokens = result.positiveTokens;
    this.negativeTokens = result.negativeTokens;
  }
}

export function enforcePromptLanguageGuard(
  input: EvaluatePromptLanguageInput,
): PromptLanguageGuardResult {
  const result = evaluatePromptLanguage(input);
  if (result.outcome === "block") {
    throw new ResidualFrenchPromptError(result);
  }
  return result;
}
