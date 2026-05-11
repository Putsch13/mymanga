/**
 * Script CLI orchestrant le backfill « hard switch ».
 *
 * Exécute les 4 phases dans l'ordre, persiste l'état entre chaque
 * itération et imprime un récap (post-checks compris).
 *
 * Voir `_backfill-hard-switch/` pour le détail de chaque sous-module.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/index";
import { parseArgs } from "./_backfill-hard-switch/cli";
import { loadState, persistState } from "./_backfill-hard-switch/state";
import { runMediaAssetsPhase } from "./_backfill-hard-switch/phases/media-assets";
import { runCharacterLocksPhase } from "./_backfill-hard-switch/phases/character-locks";
import { runSceneKeyframesPhase } from "./_backfill-hard-switch/phases/scene-keyframes";
import { runFalTracesPhase } from "./_backfill-hard-switch/phases/fal-traces";
import { buildPostChecks, type PostChecks } from "./_backfill-hard-switch/post-checks";
import type { BackfillState, CliOptions } from "./_backfill-hard-switch/types";

export {
  remainingTake,
  scannedThisInvocation,
} from "./_backfill-hard-switch/utils";

function printFinalSummary(
  options: CliOptions,
  state: BackfillState,
  postChecks: PostChecks,
): void {
  const summary = {
    dryRun: options.dryRun,
    onlyProject: options.onlyProject,
    limitPerPhase: options.limit,
    stateFile: options.stateFile,
    phases: state.phases,
    postChecks,
  };

  console.log("[backfill-hard-switch] summary");
  console.log(JSON.stringify(summary, null, 2));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const state = await loadState(options);

  console.log(
    "[backfill-hard-switch] start",
    JSON.stringify({
      dryRun: options.dryRun,
      limitPerPhase: options.limit,
      onlyProject: options.onlyProject,
      resume: options.resume,
      stateFile: options.stateFile,
    }),
  );

  await persistState(state, options);
  await runMediaAssetsPhase(options, state);
  await runCharacterLocksPhase(options, state);
  await runSceneKeyframesPhase(options, state);
  await runFalTracesPhase(options, state);

  const postChecks = await buildPostChecks(options);
  printFinalSummary(options, state, postChecks);
}

const isExecutedDirectly =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isExecutedDirectly) {
  main()
    .catch((error) => {
      console.error("[backfill-hard-switch] failed", error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
