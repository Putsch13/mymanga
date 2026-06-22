/**
 * Nettoyage du texte destiné au LECTEUR (narration + bulles de dialogue).
 *
 * Le pipeline utilise des "purposes" / action-lines internes (anglais, templates
 * de cadrage) comme échafaudage de génération. Ces fragments — `environment shift
 * / tension reset`, `[#beat_1_panel_8 · ...]`, `Story action panel: ...`,
 * `hostile soldiers dominates the frame`, etc. — ne doivent JAMAIS apparaître dans
 * le manga lu par l'utilisateur. On les retire ici, au dernier point de passage
 * commun (build du PanelTextContract), pour que toutes les vues (narration, bulle,
 * bundle) soient propres d'un coup.
 *
 * Générique : indépendant de l'histoire. On ne supprime que des marqueurs
 * techniques connus, jamais de la prose narrative.
 */

/** Labels / wrappers internes à retirer avec leur contenu jusqu'au séparateur. */
const INTERNAL_LABEL_PATTERNS: RegExp[] = [
  /\[#[^\]]*\]/g, // [#beat_1_panel_8 · close-up emotional reaction]
  /\bstory action panel:\s*/gi,
  /\blocation context:[^.]*\.?/gi,
  /\boriginal cue:\s*/gi,
  /\bsubtle background presence:[^.]*\.?/gi,
  /\bmandatory visible elements:[^.]*\.?/gi,
  /\bdialogue acting:.*$/gi,
  /\bconvey through gaze[^.]*\.?/gi,
  /\bshow a concrete action[^.]*\.?/gi,
  /\bkey props visible[^.]*\.?/gi,
  /\bspeaks with [a-z ]+, body language conveys the stakes\.?/gi,
];

/**
 * Phrases-cues de cadrage internes (templates `panel-templates.ts` + variantes
 * runtime). Anglais ou semi-anglais, ne sont jamais de la vraie narration FR.
 */
const INTERNAL_CUE_PHRASES: readonly string[] = [
  "environment shift / tension reset",
  "hero reaction / counter",
  "enemy focus / threat",
  "aftermath / terrain damage",
  "aftermath /",
  "establishing / environment context",
  "establishing battlefield — aucun héros",
  "establishing battlefield",
  "prop cutaway if key object",
  "payoff face-off",
  "weapon / prop insert",
  "crowd reaction — spectateurs / témoins",
  "crowd reaction / ambient",
  "wide action establishing",
  "wide establishing shot",
  "evidence / prop / detail insert",
  "detail / prop in public context",
  "focused reaction",
  "reaction / detail",
  "environment cutaway",
  "environment / architecture / route",
  "close object / badge / terminal / lock",
  "enemy / guard silhouette",
  "movement trace / approach",
  "crowd establishing",
  "npc reaction crowd / witness",
  "insert shot of hands or meaningful object",
  "medium character shot",
  "close-up emotional reaction",
  "over-the-shoulder composition",
  "side profile shot",
  "foreground-background depth composition",
  "speaker a medium",
  "reaction b",
  "reveal subject",
  "hostile soldiers",
  "dominates the frame with immediate threat",
  "prop / detail insert",
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CUE_PHRASE_REGEX = new RegExp(
  `(${INTERNAL_CUE_PHRASES.map(escapeRegExp).join("|")})`,
  "gi",
);

/**
 * Retire l'échafaudage interne d'un fragment texte lecteur.
 * Retourne `null` si, une fois nettoyé, il ne reste rien d'exploitable
 * (le fragment était purement technique).
 */
export function sanitizeReaderText(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let t = String(raw);
  for (const re of INTERNAL_LABEL_PATTERNS) t = t.replace(re, " ");
  t = t.replace(CUE_PHRASE_REGEX, " ");
  t = t
    .replace(/\s*[•·]\s*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*(?=\s|$)/g, " ")
    .replace(/^[\s./,;:–—-]+/, "")
    // Fin : on retire les séparateurs orphelins ( / , ; : - ) mais on PRÉSERVE
    // la ponctuation de fin de phrase légitime (. ! ? …).
    .replace(/[\s/,;:–—-]+$/, "")
    .trim();
  // On ne jette QUE le vide : le scaffolding pur devient "" après nettoyage,
  // alors qu'une vraie réplique courte ("Non !", "Hé !") doit être conservée.
  if (t.length === 0) return null;
  return t;
}
