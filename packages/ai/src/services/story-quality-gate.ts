import type { GeneratedChapterBundle } from "../chapter-pipeline";
import type { ChapterDramaticSpine } from "./story-spine";

export type StoryQualityIssue = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  sceneIndex?: number;
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

export function runStoryQualityGate(
  bundle: GeneratedChapterBundle,
  spine: ChapterDramaticSpine,
): StoryQualityReport {
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

  return {
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
  };
}
