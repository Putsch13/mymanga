/**
 * ╔════════════════════════════════════════════════════════════════════╗
 * ║ LEGACY — PREMIUM-FORBIDDEN (P0.B quarantine)                       ║
 * ╠════════════════════════════════════════════════════════════════════╣
 * ║ Ce module ne DOIT PLUS être importé depuis le chemin premium.      ║
 * ║ Le test `premium-path-legacy-isolation.test.ts` échoue             ║
 * ║ automatiquement si un fichier premium importe ce fichier ou        ║
 * ║ appelle `composeMangaPanelPrompt` / `composeChapterCoverPrompt`.   ║
 * ║                                                                    ║
 * ║ Façade publique splittée (audit-v9, < 500 lignes/fichier) en :     ║
 * ║   - manga-prompt/manga-prompt-types          (interfaces)           ║
 * ║   - manga-prompt/manga-prompt-dictionaries  (mood/camera/framing…) ║
 * ║   - manga-prompt/manga-prompt-builders      (helpers purs)         ║
 * ║   - manga-prompt/manga-prompt-composer-core (composers legacy)     ║
 * ╚════════════════════════════════════════════════════════════════════╝
 *
 * @deprecated LEGACY prompt composer.
 */

export type {
  CharacterRef,
  StylePackRef,
  PanelPromptInput,
  ComposedPrompt,
} from "./manga-prompt/manga-prompt-types";

export { buildNpcMemoryBlock } from "./manga-prompt/manga-prompt-builders";

export {
  composeMangaPanelPrompt,
  composeChapterCoverPrompt,
} from "./manga-prompt/manga-prompt-composer-core";
