/**
 * Client unique pour lancer la génération complète d'un chapitre premium
 * depuis le studio (route canonique, obligatoire en prod premium-only).
 */

export type LaunchChapterGenerationResult = Record<string, unknown> & {
  ok?: boolean;
  jobId?: string;
  message?: string;
  error?: string;
  code?: string;
};

export class ChapterLaunchRequestError extends Error {
  readonly status: number;
  readonly payload: LaunchChapterGenerationResult | null;

  constructor(
    message: string,
    options: { status: number; payload: LaunchChapterGenerationResult | null },
  ) {
    super(message);
    this.name = "ChapterLaunchRequestError";
    this.status = options.status;
    this.payload = options.payload;
  }
}

export async function launchChapterGeneration(input: {
  projectId: string;
  chapterId: string;
}): Promise<LaunchChapterGenerationResult> {
  const response = await fetch(
    `/api/projects/${input.projectId}/chapters/${input.chapterId}/launch`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "premium",
        source: "studio",
      }),
    },
  );

  const data = (await response.json().catch(() => null)) as LaunchChapterGenerationResult | null;

  if (!response.ok) {
    const msg =
      (typeof data?.message === "string" && data.message)
      || (typeof data?.error === "string" && data.error)
      || `chapter_launch_failed:${response.status}`;
    throw new ChapterLaunchRequestError(msg, { status: response.status, payload: data });
  }

  return data ?? {};
}

/** Codes renvoyés quand une route legacy a été utilisée ou bloquée côté API. */
export const STUDIO_WRONG_GENERATION_ROUTE_ERRORS = new Set([
  "premium_only_launch_route_required",
  "run_now_disabled_in_premium_only",
  "dev_image_generate_route_disabled",
  "dev_estimate_image_route_disabled",
]);

export function isWrongGenerationRouteError(error: unknown): boolean {
  if (error instanceof ChapterLaunchRequestError) {
    const key = error.payload?.error ?? error.payload?.code;
    if (typeof key === "string" && STUDIO_WRONG_GENERATION_ROUTE_ERRORS.has(key)) return true;
  }
  if (!(error instanceof Error)) return false;
  const t = error.message.toLowerCase();
  return (
    t.includes("premium_only_launch")
    || t.includes("run_now_disabled")
    || t.includes("dev_image_generate_route_disabled")
    || t.includes("dev_estimate_image_route_disabled")
    || t.includes("utilisez uniquement le lancement chapitre depuis le studio")
  );
}

export const STUDIO_WRONG_ROUTE_USER_MESSAGE =
  "La génération doit être lancée depuis le bouton principal du chapitre. Rechargez le studio puis relancez la génération.";
