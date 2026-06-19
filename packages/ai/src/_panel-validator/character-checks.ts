/**
 * Vérifications par personnage requis : présence du nom dans le prompt,
 * couleurs cheveux/yeux, genre, marqueurs permanents et `forbiddenDrift`.
 *
 * Renvoie la pénalité cumulée à appliquer sur le score brut, et accumule les
 * issues dans le tableau partagé.
 */
import type { GeneratedPanelData, PanelIssue } from "./types";

export function applyCharacterChecks(
  panel: GeneratedPanelData,
  prompt: string,
  issues: PanelIssue[],
): number {
  let penalty = 0;

  for (const char of panel.requiredCharacters) {
    const nameInPrompt = prompt.includes(char.characterName.toLowerCase());
    if (!nameInPrompt) {
      issues.push({
        severity: "critical",
        type: "missing_character",
        message: `Character ${char.characterName} not found in prompt`,
        autoFixable: false,
      });
      penalty += 0.3;
    }

    const fp = char.fingerprint;

    const hairColor = fp.hair.color.toLowerCase();
    if (!prompt.includes(hairColor)) {
      issues.push({
        severity: "major",
        type: "wrong_hair",
        message: `${char.characterName}: hair color "${hairColor}" not in prompt`,
        autoFixable: true,
      });
      penalty += 0.15;
    }

    const eyeColor = fp.face.eyeColor.toLowerCase();
    if (!prompt.includes(eyeColor)) {
      issues.push({
        severity: "major",
        type: "wrong_eyes",
        message: `${char.characterName}: eye color "${eyeColor}" not in prompt`,
        autoFixable: true,
      });
      penalty += 0.15;
    }

    // Genre — \b évite les faux positifs ("manga" contient "man", "woman" contient "man").
    const hasFemaleTerms = /\b(woman|female|girl)\b/i.test(prompt);
    const hasMaleTerms = /\b(man|male|boy)\b/i.test(prompt);
    if (fp.identity.gender === "male" && hasFemaleTerms) {
      issues.push({
        severity: "critical",
        type: "wrong_gender",
        message: `${char.characterName}: male character with female terms in prompt`,
        autoFixable: false,
      });
      penalty += 0.4;
    }
    if (fp.identity.gender === "female" && hasMaleTerms) {
      issues.push({
        severity: "critical",
        type: "wrong_gender",
        message: `${char.characterName}: female character with male terms in prompt`,
        autoFixable: false,
      });
      penalty += 0.4;
    }

    for (const marker of fp.permanentMarkers) {
      if (marker && !prompt.includes(marker.toLowerCase())) {
        issues.push({
          severity: "minor",
          type: "missing_element",
          message: `${char.characterName}: permanent marker "${marker}" not in prompt`,
          autoFixable: true,
        });
        penalty += 0.05;
      }
    }

    for (const forbidden of fp.forbiddenDrift) {
      const forbiddenLower = forbidden.toLowerCase();
      if (
        forbiddenLower.includes("never") &&
        prompt.includes(forbiddenLower.replace("never ", ""))
      ) {
        issues.push({
          severity: "critical",
          type: "forbidden_element",
          message: `${char.characterName}: forbidden drift detected "${forbidden}"`,
          autoFixable: false,
        });
        penalty += 0.3;
      }
    }
  }

  return penalty;
}
