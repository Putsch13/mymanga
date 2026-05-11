/**
 * P5.2 — Parsing + sanitization + validation du body /retry.
 *
 * Centralise :
 *  - lecture brute via `readRetryBody` (back-compat query string)
 *  - parsing Zod (`retryBodySchema.safeParse`)
 *  - sanitization des `userPromptAdditions` / `userPromptExclusions`
 *  - assemblage du `RetryBody` "legacy shape" pour les consumers existants
 *
 * Renvoie soit `{ ok: false, response }` (NextResponse 422) soit
 * `{ ok: true, retryBody, retryBodyParsed, sanitizedAdditions, sanitizedExclusions }`.
 */
import { NextResponse } from "next/server";
import { validationError } from "@/lib/api-response";
import { readRetryBody as readRetryBodyShared } from "@/lib/retry/read-retry-body";
import { sanitizeUserPromptInput } from "@/lib/retry/build-retry-prompts";
import {
  retryBodySchema,
  type RetryBodyParsed,
} from "@/lib/retry/retry-packet-resolver";
import type { RetryMode } from "@/lib/images/retry-reference-policy";

export interface RetryBody {
  mode?: RetryMode;
  targetCharacterId?: string;
  userPromptAdditions?: string;
  userPromptExclusions?: string;
  forceOverrides?: {
    shotType?: "wide" | "medium" | "closeup" | "extreme_closeup" | "over_shoulder";
    subjectFocus?:
      | "hero"
      | "npc"
      | "important_npc"
      | "enemy"
      | "antagonist"
      | "environment"
      | "group"
      | "prop"
      | "reaction"
      | "aftermath";
    cameraAngle?: string;
    forcedCharacterNames?: string[];
  };
}

export type ParseAndValidateRetryBodyResult =
  | {
      ok: true;
      retryBody: RetryBody;
      retryBodyParsed: RetryBodyParsed;
      sanitizedAdditions: string | null | undefined;
      sanitizedExclusions: string | null | undefined;
    }
  | { ok: false; response: NextResponse };

export async function parseAndValidateRetryBody(
  req: Request,
): Promise<ParseAndValidateRetryBodyResult> {
  const rawRetryBody = await readRetryBodyShared<RetryBody>(req);
  const parsedBody = retryBodySchema.safeParse(rawRetryBody);
  if (!parsedBody.success) {
    return {
      ok: false,
      response: validationError(
        "Body invalide: "
        + parsedBody.error.issues
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .join(", "),
      ),
    };
  }
  const retryBodyParsed: RetryBodyParsed = parsedBody.data;

  // AUDIT COMMIT 5 — sanitisation des user overrides.
  const sanitizedAdditions =
    retryBodyParsed.userPromptAdditions === undefined
      ? undefined
      : retryBodyParsed.userPromptAdditions === null
        ? null
        : sanitizeUserPromptInput(retryBodyParsed.userPromptAdditions, 400) || null;
  const sanitizedExclusions =
    retryBodyParsed.userPromptExclusions === undefined
      ? undefined
      : retryBodyParsed.userPromptExclusions === null
        ? null
        : sanitizeUserPromptInput(retryBodyParsed.userPromptExclusions, 200) || null;

  const retryBody: RetryBody = {
    mode: retryBodyParsed.mode as RetryMode | undefined,
    targetCharacterId: retryBodyParsed.targetCharacterId,
    userPromptAdditions:
      sanitizedAdditions === null ? undefined : sanitizedAdditions ?? undefined,
    userPromptExclusions:
      sanitizedExclusions === null ? undefined : sanitizedExclusions ?? undefined,
    forceOverrides: (retryBodyParsed.forceOverrides ?? undefined) as RetryBody["forceOverrides"],
  };

  return {
    ok: true,
    retryBody,
    retryBodyParsed,
    sanitizedAdditions,
    sanitizedExclusions,
  };
}

export function hasUsableCanonicalPacketIn(metadata: Record<string, unknown>): boolean {
  const raw = metadata.canonicalPacket;
  if (raw == null || typeof raw !== "object") return false;
  if (!("finalEnglishStructuredPrompt" in raw)) return false;
  const value = (raw as { finalEnglishStructuredPrompt?: unknown }).finalEnglishStructuredPrompt;
  return typeof value === "string" && value.trim().length > 0;
}
