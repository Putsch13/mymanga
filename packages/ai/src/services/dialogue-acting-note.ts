/**
 * dialogue-acting-note.ts — FIX-23 (MAJEUR)
 *
 * Convertit une liste `{speaker, text}` en *acting notes* destinées au prompt
 * image. Le texte exact n'est JAMAIS exposé au moteur de rendu : seul le
 * sous-texte dramatique (gravité, urgence, tendresse…) est conservé. Cela
 * empêche Flux/SDXL d'écrire littéralement les dialogues sur le panel.
 */

export interface DialogueLineLike {
  speaker: string;
  text: string;
}

const TONE_PATTERNS: ReadonlyArray<{ regex: RegExp; tone: string }> = [
  { regex: /\b(non|jamais|stop|arrête|n'avance|recule|attention|danger|attention !)/i, tone: "urgent warning" },
  { regex: /\b(je t'aime|tendre|doux|caress|murmur|mon amour|chéri)/i, tone: "tenderness" },
  { regex: /\?/, tone: "questioning concern" },
  { regex: /\!{1,}/, tone: "rising urgency" },
  { regex: /\b(meurs|mort|tué|sang|fin)/i, tone: "grim weight" },
  { regex: /\b(je sais|secret|vérité|caché|cach[ée])/i, tone: "concealed truth" },
  { regex: /\b(jure|promet|serment|alliance)/i, tone: "binding promise" },
  { regex: /\b(rire|haha|hihi|amus[ée])/i, tone: "lighthearted" },
  { regex: /\b(triste|pleure|larme|sanglot)/i, tone: "subdued sorrow" },
  { regex: /\b(colère|rage|fâch[ée]|furieu[xs])/i, tone: "barely contained anger" },
];

const DEFAULT_TONE = "measured intent";

function inferTone(text: string): string {
  for (const { regex, tone } of TONE_PATTERNS) {
    if (regex.test(text)) return tone;
  }
  return DEFAULT_TONE;
}

/**
 * Convertit une ligne en directive d'acting (pas de texte littéral).
 *
 * Exemples :
 *   { speaker: "Lux", text: "Attention, recule !" }
 *      → "Lux speaks with urgent warning, body language conveys the stakes"
 *   { speaker: "Tess", text: "Je sais ce que tu caches." }
 *      → "Tess speaks with concealed truth, body language conveys the stakes"
 */
export function dialogueLineToActingNote(line: DialogueLineLike): string {
  const speaker = line.speaker?.trim() || "the speaker";
  const tone = inferTone(line.text ?? "");
  return `${speaker} speaks with ${tone}, body language conveys the stakes`;
}

/**
 * Concatène plusieurs lignes en une note d'acting unique. Le texte exact
 * des dialogues n'est jamais conservé.
 */
export function dialogueLinesToActingNote(
  lines: ReadonlyArray<DialogueLineLike>,
): string {
  if (!lines || lines.length === 0) return "";
  const notes: string[] = [];
  for (const line of lines.slice(0, 3)) {
    notes.push(dialogueLineToActingNote(line));
  }
  return notes.join("; ");
}
