/**
 * `generateFallbackPanels` — produit des panels avec dialogues simples quand
 * l'appel LLM échoue ou que `OPENAI_API_KEY` est absente.
 *
 * Les panels alternent action (sans bulle, narration + SFX) et dialogue
 * minimal piochant dans `objective`/`fear`/`traits`/`flaws` pour rester en
 * cohérence avec la fiche personnage.
 */
import type { MangaBubble, MangaPanelText } from "@manga-ai-studio/core";
import type { DialogueWriterInput } from "./types";

export function generateFallbackPanels(input: DialogueWriterInput): MangaPanelText[] {
  const panels: MangaPanelText[] = [];
  const firstCharacter = input.characters[0];
  const secondCharacter = input.characters[1];
  const locationHint = input.location ? `dans ${input.location}` : "sur place";
  const visibleByPanel = new Map(
    (input.panelBlueprints ?? []).map((panel, index) => [
      `panel_${index + 1}`,
      (panel.characters ?? []).filter(Boolean),
    ]),
  );
  const fallbackLines = [
    `${firstCharacter?.objective ?? "On tient"} ${locationHint}.`,
    secondCharacter?.fear
      ? `Je sens ${secondCharacter.fear.toLowerCase()} ici.`
      : "Le décor annonce un problème.",
    `${input.emotionalObjective.slice(0, 32)}${input.emotionalObjective.length > 32 ? "…" : ""}`,
    firstCharacter?.traits?.[0]
      ? `Reste ${firstCharacter.traits[0]} maintenant.`
      : "Reste lucide maintenant.",
    secondCharacter?.flaws?.[0]
      ? `Ton ${secondCharacter.flaws[0]} nous expose.`
      : "Le moindre faux pas nous expose.",
    "Ce lieu réagit à nos choix.",
  ];

  for (let i = 0; i < input.panelCount; i++) {
    const isActionPanel = i % 4 === 1;
    const panelId = `panel_${i + 1}`;
    const visibleCharacters = visibleByPanel.get(panelId) ?? [];
    const speakerName =
      visibleCharacters[0] ??
      input.characters[i % Math.max(input.characters.length, 1)]?.name ??
      firstCharacter?.name ??
      "Narrateur";
    const actionHint =
      input.panelBlueprints?.[i]?.action?.slice(0, 70) ??
      input.sceneSummary.slice(0, 70) ??
      input.emotionalObjective.slice(0, 70);
    panels.push({
      panelId,
      bubbles: isActionPanel
        ? []
        : [
            {
              id: `b_${i}_1`,
              speaker: speakerName,
              text:
                i === 0
                  ? `${actionHint}${actionHint.length >= 70 ? "…" : ""}`
                  : fallbackLines[i % fallbackLines.length] ?? "On continue.",
              bubbleType: "speech" as const,
              emotion:
                input.characters.find((c) => c.name === speakerName)?.emotionalState ??
                "neutre",
              priority: 1,
              readingOrder: 1,
            } as MangaBubble,
          ],
      narration: isActionPanel
        ? [`Le lieu impose sa pression : ${locationHint}.`]
        : undefined,
      sfx: isActionPanel ? [i % 2 === 0 ? "WHOOSH" : "KRAK"] : [],
      pauseWeight: isActionPanel ? 0.8 : 0.3,
    });
  }
  return panels;
}
