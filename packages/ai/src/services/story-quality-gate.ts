import type { GeneratedChapterBundle } from "../chapter/shared-types";
import type { ChapterDramaticSpine } from "./story-spine";
import type { GenreDirectorMode } from "./genre-director";

export type StoryQualityIssue = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  sceneIndex?: number;
};

/**
 * Patch narratif léger suggéré ou appliqué automatiquement par le quality gate.
 * Les patches auto-appliqués modifient directement le bundle ; les suggestions restent dans le diagnostic.
 */
export type NarrativePatch = {
  type:
    | "strengthen_cliffhanger"
    | "inject_micro_turn"
    | "add_payoff_hint"
    | "add_breathing_beat"
    | "mark_weak_scene"
    | "add_reveal_beat";
  targetSceneIndex?: number;
  targetBeatIndex?: number;
  description: string;
  /** Valeur appliquée (ex: texte du cliffhanger renforcé) */
  appliedValue?: string;
  /** true si le patch a été appliqué automatiquement au bundle */
  autoApplied: boolean;
};

export type StoryQualityReport = {
  passed: boolean;
  overallScore: number;
  issues: StoryQualityIssue[];
  causalityScore: number;
  beatVarietyScore: number;
  microTurnsScore: number;
  cliffhangerScore: number;
  payoffScore: number;
  breathingScore: number;
  sceneUtilityScore: number;
  characterFunctionScore: number;
  /** Patches suggérés mais non appliqués automatiquement */
  suggestedPatches: NarrativePatch[];
  /** Patches appliqués automatiquement au bundle */
  autoAppliedPatches: NarrativePatch[];
  /** Mode genre utilisé pour orienter les patches */
  genreMode: GenreDirectorMode;
};

function scoreCausality(bundle: GeneratedChapterBundle): { score: number; issues: StoryQualityIssue[] } {
  const issues: StoryQualityIssue[] = [];
  const scenes = bundle.script?.scenes ?? [];

  if (scenes.length < 2) {
    issues.push({
      code: "too_few_scenes",
      severity: "error",
      message: "Moins de 2 scènes : impossible d'évaluer la causalité.",
    });
    return { score: 0, issues };
  }

  let causalLinks = 0;
  for (let i = 1; i < scenes.length; i++) {
    const prev = scenes[i - 1].summary?.toLowerCase() ?? "";
    const curr = scenes[i].summary?.toLowerCase() ?? "";

    const causalWords = ["donc", "alors", "suite", "résultat", "conséquence", "après", "parce", "because", "so", "then", "result"];
    const hasLink = causalWords.some((w) => curr.includes(w)) || prev.length > 20;

    if (hasLink) causalLinks++;
  }

  const score = Math.round((causalLinks / (scenes.length - 1)) * 100);

  if (score < 40) {
    issues.push({
      code: "weak_causality",
      severity: "warning",
      message: `Causalité faible entre les scènes (score: ${score}/100). Les transitions semblent abruptes.`,
    });
  }

  return { score, issues };
}

function scoreBeatVariety(spine: ChapterDramaticSpine): { score: number; issues: StoryQualityIssue[] } {
  const issues: StoryQualityIssue[] = [];
  const uniqueTypes = new Set(spine.beats.map((b) => b.eventType)).size;
  const totalBeats = spine.beats.length;

  if (totalBeats === 0) {
    return { score: 0, issues: [{ code: "no_beats", severity: "error", message: "Aucun beat narratif identifié." }] };
  }

  const varietyRatio = uniqueTypes / Math.min(totalBeats, 8);
  const score = Math.round(varietyRatio * 100);

  if (uniqueTypes < 3) {
    issues.push({
      code: "low_beat_variety",
      severity: "warning",
      message: `Seulement ${uniqueTypes} type(s) de beat différent(s). Diversifier les turns narratifs.`,
    });
  }

  return { score, issues };
}

function scoreMicroTurns(bundle: GeneratedChapterBundle): { score: number; issues: StoryQualityIssue[] } {
  const issues: StoryQualityIssue[] = [];
  const scenes = bundle.script?.scenes ?? [];

  const microTurnWords = ["mais", "cependant", "pourtant", "soudain", "sauf que", "except", "but", "however", "suddenly", "twist"];
  let microTurnCount = 0;

  for (const scene of scenes) {
    const text = scene.summary?.toLowerCase() ?? "";
    if (microTurnWords.some((w) => text.includes(w))) {
      microTurnCount++;
    }
  }

  const ratio = scenes.length > 0 ? microTurnCount / scenes.length : 0;
  const score = Math.round(Math.min(1, ratio * 2) * 100);

  if (microTurnCount === 0) {
    issues.push({
      code: "no_micro_turns",
      severity: "warning",
      message: "Aucun micro-turn détecté. Ajouter des retournements de situation locaux.",
    });
  }

  return { score, issues };
}

function scoreCliffhanger(spine: ChapterDramaticSpine, bundle: GeneratedChapterBundle): { score: number; issues: StoryQualityIssue[] } {
  const issues: StoryQualityIssue[] = [];
  let score = 50;

  if (spine.cliffhangerPrep) {
    score += 30;
  } else {
    issues.push({
      code: "no_cliffhanger_prep",
      severity: "warning",
      message: "Aucun cliffhanger préparé détecté. Ajouter un beat cliff_pivot ou reveal en fin de chapitre.",
    });
  }

  const outline = bundle.outline;
  if (outline.cliffhanger && outline.cliffhanger.length > 20) {
    score += 20;
  } else {
    issues.push({
      code: "weak_cliffhanger_text",
      severity: "info",
      message: "Le texte du cliffhanger est absent ou trop court.",
    });
  }

  return { score: Math.min(100, score), issues };
}

function scorePayoff(spine: ChapterDramaticSpine): { score: number; issues: StoryQualityIssue[] } {
  const issues: StoryQualityIssue[] = [...spine.payoffWeaknesses.map((w) => ({
    code: "payoff_weakness",
    severity: "warning" as const,
    message: w,
  }))];

  const hasPayoffBeats = spine.beats.some((b) => ["reveal", "cliff_pivot", "silent_aftermath"].includes(b.eventType));
  const hasPayoffTargets = spine.payoffTargets.length > 0;

  let score = 40;
  if (hasPayoffBeats) score += 30;
  if (hasPayoffTargets) score += 30;

  return { score: Math.min(100, score), issues };
}

function scoreBreathing(spine: ChapterDramaticSpine): { score: number; issues: StoryQualityIssue[] } {
  const issues: StoryQualityIssue[] = [];
  const totalBeats = spine.beats.length;

  if (totalBeats === 0) return { score: 50, issues };

  const actionBeats = spine.beats.filter((b) => ["confrontation", "escalation", "counterattack", "fast_exchange"].includes(b.eventType)).length;
  const restBeats = spine.beats.filter((b) => ["silent_aftermath", "setup", "near_confession"].includes(b.eventType)).length;

  const actionRatio = actionBeats / totalBeats;
  const restRatio = restBeats / totalBeats;

  let score = 70;

  if (actionRatio > 0.7) {
    score -= 20;
    issues.push({
      code: "too_much_action",
      severity: "info",
      message: `${Math.round(actionRatio * 100)}% de beats d'action. Ajouter des moments de respiration.`,
    });
  }

  if (restRatio > 0.6) {
    score -= 15;
    issues.push({
      code: "too_much_rest",
      severity: "info",
      message: `${Math.round(restRatio * 100)}% de beats calmes. Ajouter de l'escalade ou du conflit.`,
    });
  }

  return { score: Math.max(0, Math.min(100, score)), issues };
}

function scoreSceneUtility(bundle: GeneratedChapterBundle): { score: number; issues: StoryQualityIssue[] } {
  const issues: StoryQualityIssue[] = [];
  const scenes = bundle.script?.scenes ?? [];

  let usefulScenes = 0;
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const hasCharacters = (scene.characters?.length ?? 0) > 0;
    const hasSummary = (scene.summary?.length ?? 0) > 15;

    if (hasCharacters && hasSummary) {
      usefulScenes++;
    } else {
      issues.push({
        code: "weak_scene",
        severity: "info",
        message: `Scène ${i + 1} semble vide ou sous-développée.`,
        sceneIndex: i,
      });
    }
  }

  const score = scenes.length > 0 ? Math.round((usefulScenes / scenes.length) * 100) : 50;
  return { score, issues };
}

function scoreCharacterFunction(bundle: GeneratedChapterBundle): { score: number; issues: StoryQualityIssue[] } {
  const issues: StoryQualityIssue[] = [];
  const scenes = bundle.script?.scenes ?? [];

  const charAppearances = new Map<string, number>();
  for (const scene of scenes) {
    for (const char of scene.characters ?? []) {
      charAppearances.set(char, (charAppearances.get(char) ?? 0) + 1);
    }
  }

  let functionalChars = 0;
  for (const [char, count] of charAppearances) {
    if (count >= 2) {
      functionalChars++;
    } else {
      issues.push({
        code: "single_appearance_character",
        severity: "info",
        message: `"${char}" n'apparaît qu'une fois. Vérifier sa fonction dramatique.`,
      });
    }
  }

  const totalChars = charAppearances.size;
  const score = totalChars > 0 ? Math.round((functionalChars / totalChars) * 100) : 70;

  return { score, issues };
}

/**
 * Génère des patches narratifs légers en fonction des issues et du mode genre.
 * Retourne { suggestedPatches, autoAppliedPatches, patchedBundle }.
 */
function generateNarrativePatches(
  bundle: GeneratedChapterBundle,
  spine: ChapterDramaticSpine,
  issues: StoryQualityIssue[],
  genreMode: GenreDirectorMode,
): { suggestedPatches: NarrativePatch[]; autoAppliedPatches: NarrativePatch[]; patchedBundle: GeneratedChapterBundle } {
  const suggested: NarrativePatch[] = [];
  const autoApplied: NarrativePatch[] = [];
  let patchedBundle = bundle;

  const issueCodes = new Set(issues.map((i) => i.code));

  // ── Cliffhanger trop faible ────────────────────────────────────────────────
  if (issueCodes.has("no_cliffhanger_prep") || issueCodes.has("weak_cliffhanger_text")) {
    const cliffhangerByGenre: Record<GenreDirectorMode, string> = {
      shonen_combat: "Au moment où la poussière retombe, une silhouette inconnue surgit — et tout le monde reconnaît ce pouvoir.",
      seinen_tension: "La vérité éclate en une phrase. Personne ne bouge. Le silence dit tout.",
      romance_shojo: "Leurs regards se croisent une dernière fois — et elle comprend qu'elle a tout mal interprété.",
      thriller_horror: "La porte se referme. Derrière, quelque chose respire.",
      quiet_aftermath: "Il reste seul dans la pièce vide. Sur la table, une lettre qu'il n'avait pas vue.",
      isekai_adventure: "Le ciel s'embrase. Une entité colossale pointe vers lui — il est l'Élu.",
      mecha_tactical: "Le cockpit s'illumine en rouge. Défaillance critique. L'ennemi avance.",
      sport_rivalry: "La balle est en l'air. Une technique inconnue. Le public retient son souffle.",
      medical_drama: "Les moniteurs s'affolent. Le patient n'est plus censé être en vie.",
      mystery_detective: "La clé était là depuis le début — dans la première scène.",
      slice_of_life: "Une seule phrase change tout. Elle sourit — mais ses yeux pleurent.",
      supernatural: "L'entité s'arrête. Elle regarde directement vers lui. Elle le voit.",
      historical_epic: "L'armée s'immobilise. Le messager tombe. La trahison est confirmée.",
      dark_fantasy_gore: "Le corps s'effondre — mais quelque chose continue de bouger à l'intérieur.",
      josei_adult: "Elle repose le téléphone. Le message non envoyé reste. Le choix est fait.",
      comedy_parody: "Le héros se retourne triomphant — et percute le vrai boss final. Fondu au noir.",
    };
    const suggestedCliffhanger = cliffhangerByGenre[genreMode];
    // Auto-appliquer si le cliffhanger actuel est vraiment trop court
    if (!bundle.outline.cliffhanger || bundle.outline.cliffhanger.length < 20) {
      patchedBundle = {
        ...patchedBundle,
        outline: { ...patchedBundle.outline, cliffhanger: suggestedCliffhanger },
      };
      autoApplied.push({
        type: "strengthen_cliffhanger",
        description: `Cliffhanger renforcé selon le mode ${genreMode}`,
        appliedValue: suggestedCliffhanger,
        autoApplied: true,
      });
    } else {
      suggested.push({
        type: "strengthen_cliffhanger",
        description: `Cliffhanger faible détecté. Suggestion (${genreMode}) : "${suggestedCliffhanger}"`,
        appliedValue: suggestedCliffhanger,
        autoApplied: false,
      });
    }
  }

  // ── Aucun micro-turn ───────────────────────────────────────────────────────
  if (issueCodes.has("no_micro_turns")) {
    const microTurnByGenre: Record<GenreDirectorMode, string> = {
      shonen_combat: "Mais soudain, l'adversaire sourit — il attendait ça.",
      seinen_tension: "Cependant, quelque chose cloche dans sa réponse.",
      romance_shojo: "Pourtant, au moment de partir, elle s'arrête.",
      thriller_horror: "Sauf que la porte était censée être verrouillée.",
      quiet_aftermath: "Mais il remarque quelque chose qu'il n'avait pas vu avant.",
      isekai_adventure: "Mais ses stats changent — une compétence cachée vient de s'activer.",
      mecha_tactical: "Sauf que le système d'arme cible l'un des leurs.",
      sport_rivalry: "Mais l'adversaire connaît sa technique — il l'a étudiée.",
      medical_drama: "Cependant, l'analyse révèle une seconde pathologie inattendue.",
      mystery_detective: "Pourtant, son alibi s'effondre en un détail.",
      slice_of_life: "Mais le message reçu change tout le sens de la journée.",
      supernatural: "Sauf que le rituel de protection n'a pas fonctionné.",
      historical_epic: "Mais les renforts promis ne viendront pas.",
      dark_fantasy_gore: "Sauf que la créature ne meurt pas — elle se transforme.",
      josei_adult: "Mais ce silence n'est pas de l'indifférence — c'est un choix.",
      comedy_parody: "Sauf que le plan parfait repose sur un malentendu absurde.",
    };
    const scenes = patchedBundle.script?.scenes ?? [];
    // Trouver la scène la plus plate (milieu du chapitre)
    const midIndex = Math.floor(scenes.length / 2);
    const targetScene = scenes[midIndex];
    if (targetScene) {
      suggested.push({
        type: "inject_micro_turn",
        targetSceneIndex: midIndex,
        description: `Micro-turn suggéré pour la scène ${midIndex + 1} (${genreMode}) : "${microTurnByGenre[genreMode]}"`,
        appliedValue: microTurnByGenre[genreMode],
        autoApplied: false,
      });
    }
  }

  // ── Payoff trop faible ─────────────────────────────────────────────────────
  if (issueCodes.has("payoff_weakness") || spine.payoffTargets.length === 0) {
    const payoffByGenre: Record<GenreDirectorMode, string> = {
      shonen_combat: "La promesse du début du chapitre est tenue : le héros prouve sa valeur.",
      seinen_tension: "La révélation partielle satisfait sans tout résoudre.",
      romance_shojo: "Un geste discret répond à la tension accumulée.",
      thriller_horror: "La menace se concrétise partiellement — assez pour valider la peur.",
      quiet_aftermath: "Un détail silencieux clôt l'arc émotionnel de la scène.",
      isekai_adventure: "La nouvelle capacité du héros est mise à l'épreuve et valide sa progression.",
      mecha_tactical: "La tactique se révèle payante — ou l'erreur de calcul aussi.",
      sport_rivalry: "Le technique risquée fonctionne — ou échoue avec panache.",
      medical_drama: "Le diagnostic sauve le patient — ou la décision difficile est assumée.",
      mystery_detective: "Un indice clé est enfin relié à l'ensemble du puzzle.",
      slice_of_life: "Le moment anodin révèle quelque chose de profond sur les personnages.",
      supernatural: "Le pouvoir se maîtrise — ou dérape avec conséquences.",
      historical_epic: "Le sacrifice militaire ou politique porte ses fruits — ou son deuil.",
      dark_fantasy_gore: "La malédiction prend son tribut — le héros survit, mais transformé.",
      josei_adult: "Le non-dit se résout enfin — pas en mots, en actes.",
      comedy_parody: "Le running gag atteint son apogée — et tout le monde comprend la blague.",
    };
    suggested.push({
      type: "add_payoff_hint",
      description: `Payoff faible. Suggestion (${genreMode}) : ${payoffByGenre[genreMode]}`,
      appliedValue: payoffByGenre[genreMode],
      autoApplied: false,
    });
  }

  // ── Trop d'action, pas de respiration ─────────────────────────────────────
  if (issueCodes.has("too_much_action")) {
    const breathingByGenre: Record<GenreDirectorMode, string> = {
      shonen_combat: "Un panel silencieux après le combat : les personnages reprennent leur souffle.",
      seinen_tension: "Une pause de dialogue sobre avant la prochaine escalade.",
      romance_shojo: "Un moment contemplatif — regard sur un objet symbolique.",
      thriller_horror: "Un instant de faux calme avant la prochaine menace.",
      quiet_aftermath: "Une scène entière de silence et de réflexion.",
      isekai_adventure: "Une pause d'exploration du nouveau monde, sans combat.",
      mecha_tactical: "Cockpit silencieux. Pilote seul face à ses doutes.",
      sport_rivalry: "Vestiaires. Un moment de cohésion d'équipe avant le prochain défi.",
      medical_drama: "Couloir d'hôpital. Café froid. La soignante reprend son souffle.",
      mystery_detective: "Réflexion solitaire : le détective rassemble les pièces mentalement.",
      slice_of_life: "Un repas partagé. Pas de dialogue important — juste la présence.",
      supernatural: "Moment de rituel calme avant l'affrontement.",
      historical_epic: "Bivouac nocturne. Les soldats dorment. Le général veille seul.",
      dark_fantasy_gore: "Le héros contemple ses mains ensanglantées. Le silence est assourdissant.",
      josei_adult: "Elle s'assoit dans un café vide. Le temps passe sans qu'elle le remarque.",
      comedy_parody: "Le héros essaie de dormir mais le running gag le poursuit même dans ses rêves.",
    };
    suggested.push({
      type: "add_breathing_beat",
      description: `Trop d'action. Beat de respiration suggéré (${genreMode}) : ${breathingByGenre[genreMode]}`,
      appliedValue: breathingByGenre[genreMode],
      autoApplied: false,
    });
  }

  // ── Scènes faibles marquées ────────────────────────────────────────────────
  for (const issue of issues.filter((i) => i.code === "weak_scene" && i.sceneIndex !== undefined)) {
    suggested.push({
      type: "mark_weak_scene",
      targetSceneIndex: issue.sceneIndex,
      description: `Scène ${(issue.sceneIndex ?? 0) + 1} marquée comme faible — à enrichir ou supprimer.`,
      autoApplied: false,
    });
  }

  // ── Variété de beats insuffisante ─────────────────────────────────────────
  if (issueCodes.has("low_beat_variety")) {
    const revealByGenre: Record<GenreDirectorMode, string> = {
      shonen_combat: "Un reveal de capacité cachée ou d'identité adversaire.",
      seinen_tension: "Une révélation d'information qui change la lecture des événements.",
      romance_shojo: "Un aveu indirect ou une découverte sur les sentiments de l'autre.",
      thriller_horror: "Une révélation sur la nature de la menace.",
      quiet_aftermath: "Une vérité émotionnelle qui émerge doucement.",
      isekai_adventure: "Une loi du nouveau monde révélée qui change les règles du jeu.",
      mecha_tactical: "Un prototype ou une faiblesse de l'ennemi dévoilé.",
      sport_rivalry: "L'origine de la technique secrète de l'adversaire révélée.",
      medical_drama: "Une cause cachée derrière le symptôme apparent.",
      mystery_detective: "Un témoin ignoré détient la pièce manquante.",
      slice_of_life: "Un secret du passé d'un personnage ordinaire refait surface.",
      supernatural: "La vraie nature de l'entité ou du phénomène enfin révélée.",
      historical_epic: "La trahison dans les rangs finalement identifiée.",
      dark_fantasy_gore: "La véritable origine de la malédiction — elle n'est pas ce qu'on croyait.",
      josei_adult: "Un choix passé revient sous une forme inattendue.",
      comedy_parody: "Le personnage le plus anodin se révèle être le vrai cerveau de l'opération.",
    };
    suggested.push({
      type: "add_reveal_beat",
      description: `Variété de beats insuffisante. Beat reveal suggéré (${genreMode}) : ${revealByGenre[genreMode]}`,
      appliedValue: revealByGenre[genreMode],
      autoApplied: false,
    });
  }

  return { suggestedPatches: suggested, autoAppliedPatches: autoApplied, patchedBundle };
}

export function runStoryQualityGate(
  bundle: GeneratedChapterBundle,
  spine: ChapterDramaticSpine,
  genreMode: GenreDirectorMode = "seinen_tension",
): { report: StoryQualityReport; patchedBundle: GeneratedChapterBundle } {
  const causality = scoreCausality(bundle);
  const beatVariety = scoreBeatVariety(spine);
  const microTurns = scoreMicroTurns(bundle);
  const cliffhanger = scoreCliffhanger(spine, bundle);
  const payoff = scorePayoff(spine);
  const breathing = scoreBreathing(spine);
  const sceneUtility = scoreSceneUtility(bundle);
  const characterFunction = scoreCharacterFunction(bundle);

  const allIssues: StoryQualityIssue[] = [
    ...causality.issues,
    ...beatVariety.issues,
    ...microTurns.issues,
    ...cliffhanger.issues,
    ...payoff.issues,
    ...breathing.issues,
    ...sceneUtility.issues,
    ...characterFunction.issues,
  ];

  const overallScore = Math.round(
    (causality.score * 0.15 +
      beatVariety.score * 0.15 +
      microTurns.score * 0.1 +
      cliffhanger.score * 0.15 +
      payoff.score * 0.15 +
      breathing.score * 0.1 +
      sceneUtility.score * 0.1 +
      characterFunction.score * 0.1),
  );

  const errorCount = allIssues.filter((i) => i.severity === "error").length;
  const passed = errorCount === 0 && overallScore >= 50;

  // Générer les patches genre-aware
  const { suggestedPatches, autoAppliedPatches, patchedBundle } = generateNarrativePatches(
    bundle,
    spine,
    allIssues,
    genreMode,
  );

  if (autoAppliedPatches.length > 0) {
    console.log(
      `[quality-gate] auto_applied_patches=${autoAppliedPatches.length} genre=${genreMode} score=${overallScore}`,
    );
  }

  const report: StoryQualityReport = {
    passed,
    overallScore,
    issues: allIssues,
    causalityScore: causality.score,
    beatVarietyScore: beatVariety.score,
    microTurnsScore: microTurns.score,
    cliffhangerScore: cliffhanger.score,
    payoffScore: payoff.score,
    breathingScore: breathing.score,
    sceneUtilityScore: sceneUtility.score,
    characterFunctionScore: characterFunction.score,
    suggestedPatches,
    autoAppliedPatches,
    genreMode,
  };

  return { report, patchedBundle };
}

// ============================================================
// PANEL QUALITY GATE
// ============================================================

export interface PanelQualityIssue {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  autoFixable: boolean;
}

export interface PanelQualityReport {
  passed: boolean;
  score: number;
  issues: PanelQualityIssue[];
  reviewFlags: string[];
  blockReasons: string[];
  sfxCoherenceOk: boolean;
  beatAlignmentOk: boolean;
  lookConsistencyOk: boolean;
}

/**
 * Quality gate au niveau panel.
 * Vérifie : look consistency, beat-image alignment, SFX coherence.
 */
export function runPanelQualityGate(input: {
  panelPrompt: string;
  beatEventType?: string | null;
  motionLevel?: number;
  sfx?: string[] | null;
  chapterLookProfileMode?: string | null;
  sfxForbiddenTypes?: string[] | null;
  mustShow?: string[] | null;
}): PanelQualityReport {
  const issues: PanelQualityIssue[] = [];
  const reviewFlags: string[] = [];
  const blockReasons: string[] = [];
  const promptLower = input.panelPrompt.toLowerCase();

  let score = 100;

  // SFX coherence gate
  let sfxCoherenceOk = true;
  const sfxList = input.sfx ?? [];
  const forbiddenSfxTypes = input.sfxForbiddenTypes ?? [];

  for (const sfx of sfxList) {
    const sfxLower = sfx.toLowerCase();
    for (const forbidden of forbiddenSfxTypes) {
      if (sfxLower.includes(forbidden.toLowerCase()) || forbidden.toLowerCase().includes(sfxLower)) {
        issues.push({
          code: "sfx_beat_mismatch",
          severity: "warning",
          message: `SFX "${sfx}" incohérent avec le beat "${input.beatEventType}" (type interdit: ${forbidden})`,
          autoFixable: true,
        });
        reviewFlags.push(`sfx_mismatch:${sfx}`);
        sfxCoherenceOk = false;
        score -= 15;
      }
    }
  }

  // SFX impact sur romance/silence
  const isRomanceBeat = input.beatEventType === "romance_tension" || input.beatEventType === "silent_beat";
  if (isRomanceBeat && sfxList.some((s) => /(smash|boom|crash|impact|bang)/i.test(s))) {
    issues.push({
      code: "impact_sfx_on_romance_beat",
      severity: "error",
      message: `SFX d'impact sur un beat romance/silence — incohérence majeure`,
      autoFixable: true,
    });
    reviewFlags.push("impact_sfx_on_romance");
    sfxCoherenceOk = false;
    score -= 25;
  }

  // Beat alignment gate
  let beatAlignmentOk = true;
  const motionLevel = input.motionLevel ?? 5;

  if (input.beatEventType === "combat_turning_point" && motionLevel < 7) {
    const hasMotion = /(speed lines|motion blur|dynamic|explosive|burst|impact)/.test(promptLower);
    if (!hasMotion) {
      issues.push({
        code: "combat_turning_point_no_motion",
        severity: "warning",
        message: "Panel combat_turning_point sans mouvement lisible dans le prompt",
        autoFixable: false,
      });
      reviewFlags.push("combat_no_motion");
      beatAlignmentOk = false;
      score -= 20;
    }
  }

  if (input.beatEventType === "silent_beat") {
    const hasSfx = sfxList.length > 0;
    if (hasSfx) {
      issues.push({
        code: "sfx_on_silent_beat",
        severity: "warning",
        message: "SFX présents sur un beat silencieux",
        autoFixable: true,
      });
      reviewFlags.push("sfx_on_silence");
      score -= 10;
    }
  }

  // Look consistency gate
  let lookConsistencyOk = true;
  if (input.chapterLookProfileMode) {
    const incompatiblePatterns: Record<string, string[]> = {
      premium_manga_bw: ["photorealistic", "semi-realistic", "cyberpunk neon", "anime tv"],
      premium_manga_color: ["photorealistic", "semi-realistic", "manga bw"],
      anime_cel_shaded_consistent: ["photorealistic", "semi-realistic", "manga bw"],
    };
    const forbidden = incompatiblePatterns[input.chapterLookProfileMode] ?? [];
    for (const pattern of forbidden) {
      if (promptLower.includes(pattern.toLowerCase())) {
        issues.push({
          code: "look_profile_mismatch",
          severity: "warning",
          message: `Style "${pattern}" incompatible avec le look profile "${input.chapterLookProfileMode}"`,
          autoFixable: false,
        });
        reviewFlags.push(`look_mismatch:${pattern}`);
        lookConsistencyOk = false;
        score -= 20;
      }
    }
  }

  score = Math.max(0, Math.min(100, score));
  const passed = score >= 60 && blockReasons.length === 0;

  return {
    passed,
    score,
    issues,
    reviewFlags,
    blockReasons,
    sfxCoherenceOk,
    beatAlignmentOk,
    lookConsistencyOk,
  };
}

// ============================================================
// SCENE QUALITY GATE
// ============================================================

export interface SceneQualityReport {
  passed: boolean;
  score: number;
  issues: PanelQualityIssue[];
  reviewFlags: string[];
  lookConsistencyScore: number;
  castConsistencyScore: number;
  sceneContinuityScore: number;
}

/**
 * Quality gate au niveau scène.
 * Vérifie : look consistency inter-panels, cast consistency, continuité spatiale.
 */
export function runSceneQualityGate(input: {
  sceneId: string;
  panelPrompts: string[];
  castLineup: string[];
  chapterLookProfileMode?: string | null;
  anchorLocation?: string | null;
}): SceneQualityReport {
  const issues: PanelQualityIssue[] = [];
  const reviewFlags: string[] = [];

  let lookConsistencyScore = 100;
  let castConsistencyScore = 100;
  let sceneContinuityScore = 100;

  // Vérifier la cohérence du look entre panels
  if (input.chapterLookProfileMode && input.panelPrompts.length > 1) {
    const incompatiblePatterns: Record<string, string[]> = {
      premium_manga_bw: ["photorealistic", "semi-realistic", "color"],
      premium_manga_color: ["photorealistic", "semi-realistic", "black and white only"],
      anime_cel_shaded_consistent: ["photorealistic", "semi-realistic"],
    };
    const forbidden = incompatiblePatterns[input.chapterLookProfileMode] ?? [];

    let mismatchCount = 0;
    for (const prompt of input.panelPrompts) {
      const lower = prompt.toLowerCase();
      if (forbidden.some((f) => lower.includes(f.toLowerCase()))) {
        mismatchCount++;
      }
    }

    if (mismatchCount > 0) {
      lookConsistencyScore = Math.max(0, 100 - mismatchCount * 25);
      issues.push({
        code: "scene_look_inconsistency",
        severity: "warning",
        message: `${mismatchCount} panel(s) avec un style incompatible dans la scène`,
        autoFixable: false,
      });
      reviewFlags.push("scene_look_inconsistency");
    }
  }

  // Vérifier la présence du cast dans les panels
  for (const character of input.castLineup.slice(0, 3)) {
    const charLower = character.toLowerCase();
    const presentInPanels = input.panelPrompts.filter((p) => p.toLowerCase().includes(charLower)).length;
    const presenceRatio = input.panelPrompts.length > 0 ? presentInPanels / input.panelPrompts.length : 1;

    if (presenceRatio < 0.5) {
      castConsistencyScore -= 20;
      issues.push({
        code: "character_missing_from_scene",
        severity: "info",
        message: `${character} absent de ${Math.round((1 - presenceRatio) * 100)}% des panels de la scène`,
        autoFixable: false,
      });
    }
  }

  castConsistencyScore = Math.max(0, castConsistencyScore);

  // Vérifier la continuité du lieu
  if (input.anchorLocation && input.panelPrompts.length > 1) {
    const locationLower = input.anchorLocation.toLowerCase();
    const presentInPanels = input.panelPrompts.filter((p) => p.toLowerCase().includes(locationLower)).length;
    const presenceRatio = presentInPanels / input.panelPrompts.length;

    if (presenceRatio < 0.6) {
      sceneContinuityScore = Math.max(0, Math.round(presenceRatio * 100));
      issues.push({
        code: "location_continuity_weak",
        severity: "info",
        message: `Lieu "${input.anchorLocation}" absent de certains panels`,
        autoFixable: false,
      });
      reviewFlags.push("location_continuity_weak");
    }
  }

  const overallScore = Math.round((lookConsistencyScore + castConsistencyScore + sceneContinuityScore) / 3);
  const passed = overallScore >= 60;

  return {
    passed,
    score: overallScore,
    issues,
    reviewFlags,
    lookConsistencyScore,
    castConsistencyScore,
    sceneContinuityScore,
  };
}
