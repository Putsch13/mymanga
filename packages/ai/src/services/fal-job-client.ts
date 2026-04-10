import { fal } from "@fal-ai/client";
import type { FalMode } from "@manga-ai-studio/core";

export interface FalJobTimings {
  submittedAt: number;
  completedAt?: number;
  totalMs?: number;
  queueMs?: number;
  pollCount: number;
}

export interface FalJobClientResult {
  ok: boolean;
  model: string;
  mode: FalMode;
  requestId?: string;
  jobId?: string;
  outputUrls: string[];
  raw: unknown;
  timings: FalJobTimings;
  error?: string;
}

export interface FalJobClientInput {
  model: string;
  mode: FalMode;
  input: Record<string, unknown>;
  timeoutMs?: number;
  pollIntervalMs?: number;
  networkRetries?: number;
  logs?: boolean;
  onQueueUpdate?: (status: unknown) => void;
}

function ensureConfigured(apiKey: string | undefined) {
  if (!apiKey?.trim()) {
    throw new Error("FAL_KEY absente");
  }
  fal.config({
    credentials: apiKey.trim(),
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries<T>(action: () => Promise<T>, retries: number) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await sleep(800 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("fal_request_failed");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error(`${label}_timeout_${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

function extractRequestId(payload: unknown) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const value = record.request_id ?? record.requestId;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function extractJobId(payload: unknown) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const value = record.job_id ?? record.jobId;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function extractOutputUrls(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const directData =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : record;
  const images = Array.isArray(directData.images) ? directData.images : [];
  const urlsFromImages = images
    .map((image) => {
      if (image && typeof image === "object") {
        const url = (image as Record<string, unknown>).url;
        return typeof url === "string" ? url : null;
      }
      return null;
    })
    .filter((url): url is string => Boolean(url));
  const singleUrl =
    directData.image && typeof directData.image === "object"
      ? (directData.image as Record<string, unknown>).url
      : directData.url;
  return [...urlsFromImages, ...(typeof singleUrl === "string" ? [singleUrl] : [])];
}

export function createFalJobClient(apiKey: string | undefined) {
  ensureConfigured(apiKey);

  return {
    async submit(input: FalJobClientInput): Promise<FalJobClientResult> {
      const submittedAt = Date.now();
      try {
        const raw = await withRetries(
          () =>
            fal.queue.submit(input.model, {
              input: input.input,
              webhookUrl: undefined,
            }) as Promise<unknown>,
          input.networkRetries ?? 2,
        );
        const requestId = extractRequestId(raw);
        const jobId = extractJobId(raw);
        console.log(`[fal-job] submit model=${input.model} mode=${input.mode} requestId=${requestId ?? "n/a"} jobId=${jobId ?? "n/a"}`);
        return {
          ok: true,
          model: input.model,
          mode: input.mode,
          requestId,
          jobId,
          outputUrls: [],
          raw,
          timings: {
            submittedAt,
            pollCount: 0,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "fal_submit_failed";
        console.error(`[fal-job] submit failed model=${input.model} mode=${input.mode} error=${message}`);
        return {
          ok: false,
          model: input.model,
          mode: input.mode,
          outputUrls: [],
          raw: null,
          timings: {
            submittedAt,
            completedAt: Date.now(),
            totalMs: Date.now() - submittedAt,
            pollCount: 0,
          },
          error: message,
        };
      }
    },

    async poll(input: FalJobClientInput & { requestId: string }): Promise<FalJobClientResult> {
      const submittedAt = Date.now();
      const timeoutMs = input.timeoutMs ?? 180_000;
      const pollIntervalMs = input.pollIntervalMs ?? 2_000;
      let pollCount = 0;
      try {
        const raw = await withTimeout(
          (async () => {
            while (true) {
              pollCount += 1;
              const status = await withRetries(
                () =>
                  fal.queue.status(input.model, {
                    requestId: input.requestId,
                    logs: input.logs ?? true,
                  }) as Promise<unknown>,
                input.networkRetries ?? 2,
              );
              input.onQueueUpdate?.(status);
              const statusRecord = status && typeof status === "object" ? (status as Record<string, unknown>) : {};
              const state = typeof statusRecord.status === "string" ? statusRecord.status : "unknown";
              if (state === "COMPLETED") {
                return withRetries(
                  () =>
                    fal.queue.result(input.model, {
                      requestId: input.requestId,
                    }) as Promise<unknown>,
                  input.networkRetries ?? 2,
                );
              }
              if (state === "FAILED") {
                throw new Error(`fal_queue_failed:${JSON.stringify(statusRecord).slice(0, 800)}`);
              }
              await sleep(pollIntervalMs);
            }
          })(),
          timeoutMs,
          "fal_poll",
        );
        const completedAt = Date.now();
        return {
          ok: true,
          model: input.model,
          mode: input.mode,
          requestId: input.requestId,
          jobId: extractJobId(raw),
          outputUrls: extractOutputUrls(raw),
          raw,
          timings: {
            submittedAt,
            completedAt,
            totalMs: completedAt - submittedAt,
            queueMs: completedAt - submittedAt,
            pollCount,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "fal_poll_failed";
        console.error(`[fal-job] poll failed model=${input.model} requestId=${input.requestId} error=${message}`);
        return {
          ok: false,
          model: input.model,
          mode: input.mode,
          requestId: input.requestId,
          outputUrls: [],
          raw: null,
          timings: {
            submittedAt,
            completedAt: Date.now(),
            totalMs: Date.now() - submittedAt,
            pollCount,
          },
          error: message,
        };
      }
    },

    async subscribe(input: FalJobClientInput): Promise<FalJobClientResult> {
      const submittedAt = Date.now();
      try {
        const raw = await withTimeout(
          withRetries(
            () =>
              fal.subscribe(input.model, {
                input: input.input,
                logs: input.logs ?? true,
                onQueueUpdate: input.onQueueUpdate as ((status: unknown) => void) | undefined,
              }) as Promise<unknown>,
            input.networkRetries ?? 2,
          ),
          input.timeoutMs ?? 180_000,
          "fal_subscribe",
        );
        const completedAt = Date.now();
        const requestId = extractRequestId(raw);
        const jobId = extractJobId(raw);
        console.log(`[fal-job] subscribe completed model=${input.model} mode=${input.mode} requestId=${requestId ?? "n/a"}`);
        return {
          ok: true,
          model: input.model,
          mode: input.mode,
          requestId,
          jobId,
          outputUrls: extractOutputUrls(raw),
          raw,
          timings: {
            submittedAt,
            completedAt,
            totalMs: completedAt - submittedAt,
            queueMs: completedAt - submittedAt,
            pollCount: 1,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "fal_subscribe_failed";
        console.error(`[fal-job] subscribe failed model=${input.model} mode=${input.mode} error=${message}`);
        return {
          ok: false,
          model: input.model,
          mode: input.mode,
          outputUrls: [],
          raw: null,
          timings: {
            submittedAt,
            completedAt: Date.now(),
            totalMs: Date.now() - submittedAt,
            pollCount: 0,
          },
          error: message,
        };
      }
    },

    async submitAndPoll(input: FalJobClientInput): Promise<FalJobClientResult> {
      const submitted = await this.submit(input);
      if (!submitted.ok || !submitted.requestId) return submitted;
      return this.poll({
        ...input,
        requestId: submitted.requestId,
      });
    },
  };
}
