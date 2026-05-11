/**
 * Persistence simple sur disque de l'état du backfill.
 *
 * Le state JSON est utilisé pour reprendre une exécution interrompue
 * (`--resume`) et pour sortir un récap par phase à la fin du run.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { STATE_VERSION, type BackfillState, type CliOptions } from "./types";
import { emptySummary } from "./utils";

export function initialState(options: CliOptions): BackfillState {
  return {
    version: STATE_VERSION,
    updatedAt: new Date().toISOString(),
    options: {
      onlyProject: options.onlyProject,
      limit: options.limit,
    },
    phases: {
      "media-assets": { lastCursor: null, completed: false, summary: emptySummary() },
      "character-locks": { lastCursor: null, completed: false, summary: emptySummary() },
      "scene-keyframes": { lastCursor: null, completed: false, summary: emptySummary() },
      "fal-traces": { lastCursor: null, completed: false, summary: emptySummary() },
    },
  };
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function loadState(options: CliOptions): Promise<BackfillState> {
  if (!options.resume) {
    return initialState(options);
  }

  try {
    const raw = await fs.readFile(options.stateFile, "utf8");
    const parsed = JSON.parse(raw) as BackfillState;
    if (parsed.version !== STATE_VERSION) {
      throw new Error(`Unsupported state version ${parsed.version}`);
    }
    if (
      parsed.options.onlyProject !== options.onlyProject ||
      parsed.options.limit !== options.limit
    ) {
      throw new Error(
        "State file options mismatch. Use the same --only-project and --limit when resuming.",
      );
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Cannot resume: state file not found at ${options.stateFile}`);
    }
    throw error;
  }
}

export async function persistState(
  state: BackfillState,
  options: CliOptions,
): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await ensureParentDirectory(options.stateFile);
  await fs.writeFile(options.stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
