/**
 * Helpers de matching sémantique partagés par l'inférence des faits narratifs.
 *
 * `matchesAny` est utilisé pour les listes de patterns ; les autres helpers
 * détectent des signaux composés (communication, hacking, médical, mystique)
 * sous formes passives, nominales ou idiomatiques.
 */

export function matchesAny(text: string, patterns: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

export function hasCommunicationSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\b(appel|appelle|téléphone|message|texto|sms|coup de fil|communication)\b/.test(
      lower,
    ) ||
    /\b(call|phone|text|message|contact|reach out)\b/.test(lower) ||
    /reçoit (un |une )?(appel|message|notification|signal)/.test(lower) ||
    /envoie (un |une )?(message|texto|signal)/.test(lower)
  );
}

export function hasHackingSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\b(hack|pirat|infiltr|intrusion|exploit|compromet|déchiffr|contourne)\b/.test(
      lower,
    ) ||
    /\b(terminal|serveur|système|réseau|firewall|accès non autorisé)\b/.test(lower) ||
    /\b(hacking|cracking|bypass|breach|infiltrate)\b/.test(lower)
  );
}

export function hasMedicalSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\b(soign|bless|opér|médic|chirurg|infirm|hôpital|clinique|urgence)\b/.test(
      lower,
    ) ||
    /\b(seringue|perfusion|bandage|pansement|bistouri|scalpel)\b/.test(lower) ||
    /\b(médecin|docteur|infirmier|chirurgien|patient)\b/.test(lower) ||
    /\b(heal|wound|treat|operate|medical|doctor|nurse|hospital)\b/.test(lower)
  );
}

export function hasMysticalSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\b(ritual|rituel|sceau|talisman|parchemin|grimoire|magie|sort|invocation)\b/.test(
      lower,
    ) ||
    /\b(autel|temple|sanctuaire|artefact|rune|symbole sacré)\b/.test(lower) ||
    /\b(spell|magic|ritual|seal|talisman|scroll|altar|sacred)\b/.test(lower)
  );
}

export function generateId(prefix: string, beatId: string, index: number): string {
  return `${prefix}_${beatId}_${index}`;
}
