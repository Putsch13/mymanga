/**
 * PR5 — Contrat texte « script » (forme CTO / lecteur) aligné sur la roadmap dialogue unique.
 *
 * La **source de vérité persistée** reste `PanelTextContract` dans `../generation/panel-text-contract.ts`
 * (hasText, placement, dialogues[], sfx typés…). Ce module expose une vue **structurée par lignes**
 * et les ponts via `panel-text-contract-adapters.ts`.
 */

/** Ligne de dialogue script (CTO PR5). */
export type ScriptDialogueLine = {
  id: string;
  characterId?: string;
  speakerName?: string;
  text: string;
  emotion?: string;
  balloonType?: "normal" | "shout" | "whisper" | "thought" | "caption";
};

export type ScriptNarrationLine = { id: string; text: string };

export type ScriptSfxLine = {
  id: string;
  text: string;
  intensity?: "low" | "medium" | "high";
};

export type ScriptCaptionLine = { id: string; text: string };

/**
 * Agrégat PR5 — équivalent conceptuel du `PanelTextContract` CTO (dialogueLines + narration[] + sfx[] + captions).
 * Ne remplace pas le type `generation/PanelTextContract` ; sert d’API stable pour adapters / futurs producteurs.
 */
export type ScriptPanelTextContract = {
  dialogueLines: ScriptDialogueLine[];
  narration: ScriptNarrationLine[];
  sfx: ScriptSfxLine[];
  captions: ScriptCaptionLine[];
};
