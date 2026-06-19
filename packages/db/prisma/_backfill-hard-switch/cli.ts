/**
 * Parsing des arguments CLI du script `backfill-hard-switch`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CliOptions, PhaseName } from "./types";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

/**
 * Le state file vit dans `packages/db/prisma/.backfill-hard-switch.state.json`,
 * c'est-à-dire le parent du dossier où vit ce module.
 */
export const DEFAULT_STATE_FILE = path.resolve(
  SCRIPT_DIRECTORY,
  "..",
  ".backfill-hard-switch.state.json",
);

const PHASE_VALUES: ReadonlyArray<PhaseName> = [
  "media-assets",
  "character-locks",
  "scene-keyframes",
  "fal-traces",
];

function isPhaseName(value: string): value is PhaseName {
  return (PHASE_VALUES as ReadonlyArray<string>).includes(value);
}

export function parseArgs(argv: string[]): CliOptions {
  let dryRun = false;
  let limit: number | null = null;
  let onlyProject: string | null = null;
  let stateFile = DEFAULT_STATE_FILE;
  let resume = false;
  let reconcile = false;
  let phases: PhaseName[] | null = null;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--resume") {
      resume = true;
      continue;
    }
    if (arg === "--reconcile") {
      reconcile = true;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const value = Number(arg.slice("--limit=".length));
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`Invalid --limit value: ${arg}`);
      }
      limit = value;
      continue;
    }
    if (arg.startsWith("--only-project=")) {
      onlyProject = arg.slice("--only-project=".length).trim() || null;
      continue;
    }
    if (arg.startsWith("--state-file=")) {
      stateFile = path.resolve(process.cwd(), arg.slice("--state-file=".length));
      continue;
    }
    if (arg.startsWith("--phase=")) {
      const rawValue = arg.slice("--phase=".length).trim();
      const parsedPhases = rawValue
        .split(",")
        .map((value) => value.trim())
        .filter(isPhaseName);
      if (parsedPhases.length === 0) {
        throw new Error(`Invalid --phase value: ${arg}`);
      }
      phases = parsedPhases;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { dryRun, limit, onlyProject, stateFile, resume, reconcile, phases };
}
