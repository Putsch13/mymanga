import type { NextResponse } from "next/server";
import type { ZodSchema, ZodError } from "zod";
import { badRequest, validationError } from "./api-response";

/**
 * P1.4 — Helper unifie de parsing + validation des bodies JSON sur routes
 * Next.js. Remplace les `.parse(await req.json())` disperses par un flux
 * deterministe :
 *
 *   1. Si la lecture `req.json()` echoue (malformed JSON) → 400 bad_request.
 *   2. Si le schema Zod rejette le body → 422 validation_error avec details.
 *   3. Sinon on retourne `{ ok: true, data }`.
 *
 * Usage:
 * ```ts
 * const parsed = await parseJsonBody(req, mySchema);
 * if (!parsed.ok) return parsed.response;
 * const body = parsed.data;
 * ```
 */

export type ParseJsonBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export async function parseJsonBody<T>(
  req: Request,
  schema: ZodSchema<T>,
  options?: {
    /**
     * Message utilise dans la reponse 400 si le JSON est malforme.
     */
    malformedMessage?: string;
    /**
     * Message utilise dans la reponse 422 si le schema rejette.
     */
    invalidMessage?: string;
    /**
     * Si vrai et que le body est une string vide ou absente, on renvoie
     * l'objet vide `{}` au schema (utile pour les routes POST sans body).
     * Par defaut `false` (on traite comme bad_request).
     */
    allowEmptyBody?: boolean;
  },
): Promise<ParseJsonBodyResult<T>> {
  let raw: unknown;
  try {
    const text = await req.text();
    if (!text || text.trim().length === 0) {
      if (options?.allowEmptyBody) {
        raw = {};
      } else {
        return {
          ok: false,
          response: badRequest(options?.malformedMessage ?? "Corps JSON requis."),
        };
      }
    } else {
      raw = JSON.parse(text);
    }
  } catch {
    return {
      ok: false,
      response: badRequest(options?.malformedMessage ?? "Corps JSON invalide."),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: validationError(
        options?.invalidMessage ?? "Corps de requete invalide.",
        flattenZodError(parsed.error),
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

function flattenZodError(err: ZodError): Record<string, unknown> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const path = issue.path.join(".") || "_root";
    (fieldErrors[path] ??= []).push(issue.message);
  }
  return { fieldErrors, issuesCount: err.issues.length };
}
