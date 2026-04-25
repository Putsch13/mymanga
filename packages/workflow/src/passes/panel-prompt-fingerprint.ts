/**
 * Empreinte utilisée par la QA pré-rendu pour détecter les panels trop
 * similaires (même actionLine / purpose tronqués).
 */
export function getPanelPromptFingerprint(panel: Record<string, unknown>): string {
  const action = String(panel.actionLine ?? "").trim().substring(0, 100);
  const purpose = String(panel.scenePurpose ?? panel.purpose ?? "").trim().substring(0, 80);
  return `${action}||${purpose}`;
}
