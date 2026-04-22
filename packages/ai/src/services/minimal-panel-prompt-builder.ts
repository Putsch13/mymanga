/**
 * minimal-panel-prompt-builder — construit un prompt image COURT,
 * structuré, non contradictoire à partir d'un PanelRenderSpec.
 *
 * Règles fortes :
 *   - le prompt final tient entre 700 et 1200 chars max
 *   - il est construit directement en anglais (pas de traduction FR->EN)
 *   - un `establishing_environment` ne contient PAS "tight face / hero closeup"
 *   - un `insert_object` ne contient PAS "full character portrait"
 *   - un `reaction_closeup` ne contient PAS "wide establishing"
 *   - pas de texte dans l'image si styleBible.noTextInsideImage
 *
 * Remplace le chemin critique de composeMangaPanelPrompt (manga-prompt-composer.ts).
 */

import type {
  PanelRenderSpec,
  PanelRenderVisibleCharacter,
} from "../contracts/panel-render-spec";

export interface BuiltPromptResult {
  positive: string;
  negative: string;
  blocks: {
    subject: string;
    environment: string;
    shot: string;
    action: string;
    style: string;
    negative: string;
  };
  length: number;
}

const MIN_LENGTH = 700;
const MAX_LENGTH = 1200;

export function buildMinimalPanelPrompt(spec: PanelRenderSpec): BuiltPromptResult {
  const subject = buildPromptSubjectBlock(spec);
  const environment = buildPromptEnvironmentBlock(spec);
  const shot = buildPromptShotBlock(spec);
  const action = buildPromptActionBlock(spec);
  const style = buildPromptStyleBlock(spec);
  const negative = buildPromptNegativeBlock(spec);

  const positiveSections = [subject, environment, shot, action, style].filter(Boolean);
  let positive = positiveSections.join("\n");
  positive = clampLength(positive, MAX_LENGTH);
  if (positive.length < MIN_LENGTH) {
    positive = padWithStyleHints(positive, spec);
  }
  return {
    positive,
    negative,
    blocks: { subject, environment, shot, action, style, negative },
    length: positive.length,
  };
}

export function buildPromptSubjectBlock(spec: PanelRenderSpec): string {
  if (
    spec.renderMode === "establishing_environment" ||
    spec.renderMode === "silent_transition"
  ) {
    return `SUBJECT: environment-first panel, no dominant face, no hero portrait.`;
  }
  if (spec.renderMode === "insert_object") {
    return `SUBJECT: isolated object insert, object fills frame, no character body or face in shot.`;
  }
  const chars = spec.visibleCharacters;
  if (chars.length === 0) {
    return `SUBJECT: environment only, no identifiable character.`;
  }
  const primary = chars[0]!;
  const others = chars.slice(1, 3);
  const parts: string[] = [];
  parts.push(
    `SUBJECT: ${describeCharacter(primary)} as primary subject${spec.subjectFocus === "reaction" ? ", facial reaction emphasized" : ""}.`,
  );
  if (others.length > 0) {
    parts.push(
      `Secondary: ${others.map(describeCharacter).join(", ")}.`,
    );
  }
  return parts.join(" ");
}

export function buildPromptEnvironmentBlock(spec: PanelRenderSpec): string {
  const loc = spec.locationName?.trim() || "neutral setting";
  const density = spec.styleBible.backgroundDensity;
  const densityHint =
    density === "minimal"
      ? "clean minimal background"
      : density === "detailed"
        ? "richly detailed background"
        : "medium-density background";
  if (spec.renderMode === "insert_object") {
    return `ENVIRONMENT: blurred / simplified ${loc}, focus entirely on object.`;
  }
  if (
    spec.renderMode === "reaction_closeup" ||
    spec.renderMode === "hero_closeup" ||
    spec.renderMode === "npc_closeup" ||
    spec.renderMode === "enemy_closeup"
  ) {
    return `ENVIRONMENT: ${loc}, shallow depth, ${densityHint} kept soft behind subject.`;
  }
  return `ENVIRONMENT: ${loc}, ${densityHint}, consistent with chapter continuity.`;
}

export function buildPromptShotBlock(spec: PanelRenderSpec): string {
  const angle = humanizeAngle(spec.cameraAngle);
  const shot = humanizeShot(spec.shotType);
  return `SHOT: ${shot}, ${angle}, renderMode=${spec.renderMode}.`;
}

export function buildPromptActionBlock(spec: PanelRenderSpec): string {
  const action = spec.actionLine?.trim() || "static beat";
  const emotion = spec.emotionLine?.trim();
  const emotionPart = emotion ? `Emotion: ${emotion}.` : "";
  return `ACTION: ${action}. ${emotionPart}`.trim();
}

export function buildPromptStyleBlock(spec: PanelRenderSpec): string {
  const s = spec.styleBible;
  const tones = s.toneKeywords.slice(0, 3).join(", ");
  return [
    `STYLE: ${s.artStyle}`,
    `palette ${s.palette}`,
    `inking ${s.inking}`,
    `linework ${s.lineWeightHint}`,
    `screentones ${s.screentoneIntensity}`,
    `panel border ${s.panelBorderStyle}`,
    tones ? `tone keywords: ${tones}` : "",
  ]
    .filter(Boolean)
    .join(", ") + ".";
}

export function buildPromptNegativeBlock(spec: PanelRenderSpec): string {
  const baseNegatives = [
    "3d render",
    "photorealistic",
    "chibi",
    "watermark",
    "signature",
    "text in image",
    "speech bubble",
    "caption",
    "logo",
    "blurry lineart",
    "deformed hands",
    "extra fingers",
    "duplicate face",
  ];
  const drift = spec.constraints.forbiddenDrift;
  const mustNot = spec.constraints.mustNotShow;
  const full = Array.from(new Set([...baseNegatives, ...drift, ...mustNot]));
  if (spec.renderMode === "establishing_environment") full.push("tight face", "hero portrait");
  if (spec.renderMode === "insert_object") full.push("full body character", "group shot");
  if (spec.renderMode === "reaction_closeup") full.push("wide establishing", "crowd composition");
  return full.join(", ");
}

function describeCharacter(c: PanelRenderVisibleCharacter): string {
  const role = c.role === "hero" ? "protagonist" : c.role;
  const pose = c.poseIntent ? `, pose: ${c.poseIntent}` : "";
  const expr = c.expressionIntent ? `, expression: ${c.expressionIntent}` : "";
  return `${c.name} (${role})${pose}${expr}`;
}

function humanizeShot(s: PanelRenderSpec["shotType"]): string {
  switch (s) {
    case "wide":
      return "wide shot";
    case "medium":
      return "medium shot";
    case "closeup":
      return "closeup";
    case "extreme_closeup":
      return "extreme closeup";
    case "over_shoulder":
      return "over-the-shoulder";
  }
}

function humanizeAngle(a: PanelRenderSpec["cameraAngle"]): string {
  switch (a) {
    case "eye_level":
      return "eye-level angle";
    case "low":
      return "low angle";
    case "high":
      return "high angle";
    case "dutch":
      return "dutch angle";
    case "birds_eye":
      return "bird's eye view";
    case "worm":
      return "worm's eye view";
  }
}

function clampLength(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function padWithStyleHints(s: string, spec: PanelRenderSpec): string {
  const hints = [
    "consistent character design",
    "coherent environment with previous panels",
    "clean manga panel composition",
    "professional storyboard framing",
    `location continuity: ${spec.locationName}`,
  ];
  let out = s;
  for (const h of hints) {
    if (out.length >= MIN_LENGTH) break;
    out += `\nHINT: ${h}.`;
  }
  return out;
}
