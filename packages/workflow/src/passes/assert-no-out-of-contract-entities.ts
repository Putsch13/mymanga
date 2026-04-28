/**
 * Vérifie qu'aucun terme « parasite » narratif n'apparaît dans le prompt
 * s'il n'est pas explicitement autorisé par le contrat / le cast visible.
 */

import type { PanelRenderSpec } from "@manga-ai-studio/ai";

const DEFAULT_PARASITE_TERMS = [
  "talisman",
  "grimoire",
  "smartphone",
  "cellphone",
  "iphone",
  "document/evidence",
  "evidence bag",
  "mana crystal",
] as const;

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function buildAllowedLexicon(spec: PanelRenderSpec): Set<string> {
  const out = new Set<string>();
  const add = (t: string | null | undefined) => {
    if (!t?.trim()) return;
    const n = normalize(t);
    out.add(n);
    for (const w of n.split(/[^a-z0-9]+/)) {
      if (w.length >= 3) out.add(w);
    }
  };

  add(spec.locationName);
  add(spec.actionLine);
  add(spec.emotionLine);
  for (const c of spec.visibleCharacters) {
    add(c.name);
    add(c.characterId);
    add(c.canonSignatureText ?? undefined);
  }
  for (const m of spec.constraints.mustShow) add(m);
  for (const m of spec.mandatoryVisibleEntities ?? []) add(m);
  return out;
}

function termAllowedInLexicon(term: string, lex: Set<string>): boolean {
  const nt = normalize(term);
  for (const a of lex) {
    if (a.includes(nt) || nt.includes(a)) return true;
  }
  return false;
}

export interface AssertNoOutOfContractEntitiesInput {
  panelId: string;
  positivePrompt: string;
  spec: PanelRenderSpec;
  /** Termes interdits si absents du lexique contractuel. */
  parasiteTerms?: readonly string[];
}

export function assertNoOutOfContractEntitiesInPrompt(input: AssertNoOutOfContractEntitiesInput): void {
  const lex = buildAllowedLexicon(input.spec);
  const prompt = normalize(input.positivePrompt);
  const blocklist = input.parasiteTerms ?? DEFAULT_PARASITE_TERMS;

  for (const term of blocklist) {
    const t = normalize(term);
    if (!t || !prompt.includes(t)) continue;
    if (termAllowedInLexicon(t, lex)) continue;
    throw new Error(`premium_out_of_contract_entity:${input.panelId}:${term}`);
  }
}
