/**
 * P2.1 — Convention usecase serveur.
 *
 * Un usecase expose une seule méthode `execute(input): Promise<output>`.
 * Aucune dépendance Next/Request/Response : prêt pour tests vitest unitaires
 * et pour appel direct depuis routes API, jobs Inngest ou scripts CLI.
 */

export interface Usecase<Input, Output> {
  readonly name: string;
  execute(input: Input): Promise<Output>;
}

export type UsecaseError = {
  code: string;
  message: string;
  cause?: unknown;
};

export class UsecaseFailure extends Error {
  readonly code: string;
  readonly cause?: unknown;
  constructor(err: UsecaseError) {
    super(err.message);
    this.name = "UsecaseFailure";
    this.code = err.code;
    this.cause = err.cause;
  }
}
