import type { GeneratedChapterBundle } from "../chapter-pipeline";
import type { GenreDirectorMode, GenreDirectorConfig } from "./genre-director";
import { getGenreDirectorConfig } from "./genre-director";

export type BeatEventType =
  | "setup"
  | "escalation"
  | "confrontation"
  | "reveal"
  | "interruption"
  | "near_confession"
  | "betrayal"
  | "counterattack"
  | "silent_aftermath"
  | "cliff_pivot"
  | "villain_introduction"
  | "villain_motivation_layer"
  | "villain_mirror_moment"
  | "villain_victory"
  | "flashback_trigger"
  | "flash_forward_hint"
  | "callback_payoff"
  | "body_horror_reveal"
  | "comic_reversal"
  | "absurd_reveal"
  | "emotional_ambiguity";

export type ReversalType =
  | "information"
  | "emotion"
  | "power"
  | "relationship"
  | "environment"
  | "timing";

export type SpineBeat = {
  eventType: BeatEventType;
  sceneIndex: number;
  description: string;
};

export type SpineReversal = {
  type: ReversalType;
  atBeat: number;
};

export type CliffhangerPrep = {
  preparedAtBeat: number;
  type: string;
};

export type ChapterDramaticSpine = {
  beats: SpineBeat[];
  reversals: SpineReversal[];
  payoffTargets: string[];
  cliffhangerPrep: CliffhangerPrep | null;
  premiumScore: number;
  pacingIssues: string[];
  weakScenes: number[];
  deadPanels: number[];
  payoffWeaknesses: string[];
  hookOpportunities: string[];
};

const BEAT_KEYWORDS: Record<BeatEventType, string[]> = {
  setup: ["introduce", "establish", "setup", "présente", "établit", "décor", "début"],
  escalation: ["escalate", "intensif", "monte", "pression", "escalade", "aggrave"],
  confrontation: ["confront", "affront", "face", "combat", "clash", "affrontement", "duel"],
  reveal: ["reveal", "révèle", "découvre", "vérité", "secret", "twist", "surprise"],
  interruption: ["interrupt", "interrompt", "coupe", "arrêt", "brise", "intrusion"],
  near_confession: ["confession", "aveu", "sentiment", "amour", "avoue", "presque", "hésit"],
  betrayal: ["trahison", "traître", "betray", "trahit", "retournement", "backstab"],
  counterattack: ["contre-attaque", "riposte", "counter", "retourne", "reprend"],
  silent_aftermath: ["silence", "aftermath", "calme", "après", "retombées", "respiration"],
  cliff_pivot: ["cliffhanger", "pivot", "fin", "suspense", "à suivre", "coupure"],
  villain_introduction: ["villain", "antagoniste", "ennemi", "menace", "apparition", "adversaire"],
  villain_motivation_layer: ["motivation", "raison", "pourquoi", "passé", "origine", "justification"],
  villain_mirror_moment: ["miroir", "semblable", "commun", "parallèle", "reflet"],
  villain_victory: ["victoire", "gagne", "triomphe", "domine", "écrase", "défaite"],
  flashback_trigger: ["flashback", "souvenir", "passé", "mémoire", "retour"],
  flash_forward_hint: ["futur", "vision", "prémonition", "flash-forward", "avenir"],
  callback_payoff: ["callback", "rappel", "payoff", "résolution", "boucle"],
  body_horror_reveal: ["horreur", "corps", "mutation", "transformation", "chair", "gore"],
  comic_reversal: ["comique", "absurde", "renversement", "gag", "blague"],
  absurd_reveal: ["absurde", "révélation", "inattendu", "n'importe quoi", "surréaliste"],
  emotional_ambiguity: ["ambigu", "incertain", "doute", "dilemme", "tiraillé"],
};

const REVERSAL_KEYWORDS: Record<ReversalType, string[]> = {
  information: ["apprend", "révèle", "découvre", "information", "secret", "vérité"],
  emotion: ["émotion", "sentiment", "ressent", "bouleverse", "choc émotionnel"],
  power: ["pouvoir", "force", "domination", "faiblesse", "puissance"],
  relationship: ["relation", "lien", "alliance", "rupture", "trahison", "amitié"],
  environment: ["environnement", "lieu", "décor", "terrain", "piège"],
  timing: ["timing", "moment", "trop tard", "juste à temps", "surprise"],
};

function classifyBeatEvent(text: string): BeatEventType {
  const lower = text.toLowerCase();
  let bestType: BeatEventType = "setup";
  let bestScore = 0;

  for (const [type, keywords] of Object.entries(BEAT_KEYWORDS) as [BeatEventType, string[]][]) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  return bestType;
}

function detectReversals(beats: SpineBeat[]): SpineReversal[] {
  const reversals: SpineReversal[] = [];

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    const lower = beat.description.toLowerCase();

    for (const [type, keywords] of Object.entries(REVERSAL_KEYWORDS) as [ReversalType, string[]][]) {
      const matches = keywords.filter((kw) => lower.includes(kw)).length;
      if (matches >= 2 || (matches >= 1 && (beat.eventType === "reveal" || beat.eventType === "betrayal"))) {
        reversals.push({ type, atBeat: i });
        break;
      }
    }
  }

  return reversals;
}

function extractPayoffTargets(bundle: GeneratedChapterBundle): string[] {
  const targets: string[] = [];
  const outline = bundle.outline;

  if (outline.cliffhanger) targets.push(outline.cliffhanger);

  for (const beat of outline.beats ?? []) {
    if (beat.pageRole === "revelation" || beat.pageRole === "cliffhanger") {
      targets.push(beat.summary);
    }
  if (beat.structuredBeat?.setupPayoffHooks?.length) {
        for (const hook of beat.structuredBeat.setupPayoffHooks) {
          if (hook.label) targets.push(hook.label);
        }
      }
  }

  return [...new Set(targets)].slice(0, 5);
}

function detectCliffhangerPrep(beats: SpineBeat[]): CliffhangerPrep | null {
  let cliffBeat: SpineBeat | undefined;
  let cliffIndex = -1;
  for (let i = beats.length - 1; i >= 0; i--) {
    if (beats[i].eventType === "cliff_pivot") {
      cliffBeat = beats[i];
      cliffIndex = i;
      break;
    }
  }
  if (cliffBeat) {
    return { preparedAtBeat: cliffIndex, type: "explicit_cliff_pivot" };
  }

  let revealBeat: SpineBeat | undefined;
  let revealIndex = -1;
  for (let i = beats.length - 1; i >= 0; i--) {
    if (beats[i].eventType === "reveal") {
      revealBeat = beats[i];
      revealIndex = i;
      break;
    }
  }
  if (revealBeat) {
    return { preparedAtBeat: revealIndex, type: "reveal_as_cliffhanger" };
  }

  return null;
}

function computePremiumScore(
  beats: SpineBeat[],
  reversals: SpineReversal[],
  cliffhangerPrep: CliffhangerPrep | null,
  config: GenreDirectorConfig,
): number {
  let score = 50;

  // Bonus pour diversité des beats
  const uniqueTypes = new Set(beats.map((b) => b.eventType)).size;
  score += Math.min(20, uniqueTypes * 3);

  // Bonus pour reversals
  score += Math.min(15, reversals.length * 5);

  // Bonus pour cliffhanger préparé
  if (cliffhangerPrep) score += 10;

  // Bonus si le rythme correspond au genre
  const hasActionBeats = beats.some((b) => ["confrontation", "counterattack", "escalation"].includes(b.eventType));
  const hasEmotionalBeats = beats.some((b) => ["near_confession", "silent_aftermath", "reveal"].includes(b.eventType));

  if (config.beatRhythm === "fast" && hasActionBeats) score += 5;
  if (config.beatRhythm === "slow" && hasEmotionalBeats) score += 5;

  // Pénalité si trop peu de beats
  if (beats.length < 4) score -= 15;
  if (beats.length < 2) score -= 20;

  return Math.min(100, Math.max(0, score));
}

function detectPacingIssues(beats: SpineBeat[], config: GenreDirectorConfig): string[] {
  const issues: string[] = [];

  if (beats.length < 3) {
    issues.push("Trop peu de beats narratifs identifiés (< 3).");
  }

  const setupCount = beats.filter((b) => b.eventType === "setup").length;
  if (setupCount > beats.length * 0.5) {
    issues.push("Trop de beats de setup, pas assez de progression.");
  }

  const hasConflict = beats.some((b) => ["confrontation", "escalation", "betrayal"].includes(b.eventType));
  if (!hasConflict) {
    issues.push("Aucun beat de conflit ou d'escalade détecté.");
  }

  if (config.beatRhythm === "fast") {
    const silenceCount = beats.filter((b) => b.eventType === "silent_aftermath").length;
    if (silenceCount > 2) {
      issues.push("Trop de beats silencieux pour un rythme rapide.");
    }
  }

  return issues;
}

function detectWeakScenes(bundle: GeneratedChapterBundle): number[] {
  const weak: number[] = [];
  const scenes = bundle.script?.scenes ?? [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const summary = scene.summary ?? "";

    if (summary.length < 20) {
      weak.push(i);
      continue;
    }

    if (!scene.characters?.length) {
      weak.push(i);
    }
  }

  return weak;
}

function detectDeadPanels(bundle: GeneratedChapterBundle): number[] {
  const dead: number[] = [];
  const pages = bundle.storyboard?.pages ?? [];
  let panelIndex = 0;

  for (const page of pages) {
    for (const panel of page.panels ?? []) {
      const hasContent = panel.caption || panel.narration || panel.dialogue;
      if (!hasContent) {
        dead.push(panelIndex);
      }
      panelIndex++;
    }
  }

  return dead;
}

function detectPayoffWeaknesses(beats: SpineBeat[], payoffTargets: string[]): string[] {
  const weaknesses: string[] = [];

  if (payoffTargets.length === 0) {
    weaknesses.push("Aucun payoff cible identifié dans l'outline.");
  }

  const hasPayoffBeat = beats.some((b) => ["reveal", "cliff_pivot", "silent_aftermath"].includes(b.eventType));
  if (!hasPayoffBeat && payoffTargets.length > 0) {
    weaknesses.push("Des payoffs sont définis mais aucun beat de résolution n'est détecté.");
  }

  const setupCount = beats.filter((b) => b.eventType === "setup").length;
  const payoffCount = beats.filter((b) => ["reveal", "cliff_pivot"].includes(b.eventType)).length;
  if (setupCount > 0 && payoffCount === 0) {
    weaknesses.push(`${setupCount} setup(s) sans payoff correspondant détecté.`);
  }

  return weaknesses;
}

function detectHookOpportunities(beats: SpineBeat[], weakScenes: number[]): string[] {
  const opportunities: string[] = [];

  const lastBeat = beats[beats.length - 1];
  if (lastBeat && !["cliff_pivot", "reveal", "silent_aftermath"].includes(lastBeat.eventType)) {
    opportunities.push("Le dernier beat pourrait être renforcé en cliff_pivot ou reveal.");
  }

  if (weakScenes.length > 0) {
    opportunities.push(`${weakScenes.length} scène(s) faible(s) pourraient être enrichies avec un hook narratif.`);
  }

  const hasNearConfession = beats.some((b) => b.eventType === "near_confession");
  const hasInterruption = beats.some((b) => b.eventType === "interruption");
  if (hasNearConfession && !hasInterruption) {
    opportunities.push("Une interruption après near_confession renforcerait la tension romantique.");
  }

  return opportunities;
}

export function buildStorySpine(
  bundle: GeneratedChapterBundle,
  genreMode: GenreDirectorMode = "shonen_combat",
): ChapterDramaticSpine {
  const config = getGenreDirectorConfig(genreMode);
  const scenes = bundle.script?.scenes ?? [];

  const beats: SpineBeat[] = scenes.map((scene, index) => ({
    eventType: classifyBeatEvent(scene.summary ?? ""),
    sceneIndex: index,
    description: scene.summary ?? "",
  }));

  const reversals = detectReversals(beats);
  const payoffTargets = extractPayoffTargets(bundle);
  const cliffhangerPrep = detectCliffhangerPrep(beats);
  const premiumScore = computePremiumScore(beats, reversals, cliffhangerPrep, config);
  const pacingIssues = detectPacingIssues(beats, config);
  const weakScenes = detectWeakScenes(bundle);
  const deadPanels = detectDeadPanels(bundle);
  const payoffWeaknesses = detectPayoffWeaknesses(beats, payoffTargets);
  const hookOpportunities = detectHookOpportunities(beats, weakScenes);

  return {
    beats,
    reversals,
    payoffTargets,
    cliffhangerPrep,
    premiumScore,
    pacingIssues,
    weakScenes,
    deadPanels,
    payoffWeaknesses,
    hookOpportunities,
  };
}
