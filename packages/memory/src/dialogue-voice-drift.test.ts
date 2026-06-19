import { describe, expect, it } from "vitest";
import { buildVoiceProfile, detectDialogueVoiceDrift } from "./dialogue-voice-drift";

describe("dialogue-voice-drift", () => {
  it("buildVoiceProfile calcule longueur moyenne, vocabulaire distinctif et émotions dominantes", () => {
    const profile = buildVoiceProfile({
      characterId: "kenji",
      verbalTics: ["franchement"],
      forbiddenRegisters: ["argot"],
      historicalLines: [
        { text: "Franchement, je préfère me taire.", emotion: "calme" },
        { text: "Ce silence me pèse, mais je résisterai.", emotion: "calme" },
        { text: "Franchement, partez sans moi.", emotion: "calme" },
        { text: "Tu n'as pas idée du poids de ce serment.", emotion: "calme" },
      ],
    });
    expect(profile.avgLength).toBeGreaterThan(20);
    expect(profile.verbalTics.has("franchement")).toBe(true);
    expect(profile.forbiddenRegisters.has("argot")).toBe(true);
    expect(profile.dominantEmotions[0]).toBe("calme");
    expect(profile.distinctiveVocab.has("franchement")).toBe(true);
  });

  it("détecte un dialogue_drift quand la longueur moyenne s'écarte fortement", () => {
    const profile = buildVoiceProfile({
      characterId: "kenji",
      historicalLines: [
        { text: "Oui." },
        { text: "Non." },
        { text: "Plus tard." },
        { text: "C'est ainsi." },
      ],
    });
    const result = detectDialogueVoiceDrift({
      profiles: [profile],
      currentLines: [
        {
          characterId: "kenji",
          text:
            "J'ai longuement réfléchi à cette situation, et il m'est apparu évident que nous devons absolument agir ensemble si nous voulons préserver le moindre espoir de victoire dans cette guerre dévastatrice.",
        },
      ],
    });
    expect(result.issues.some((i) => i.code === "dialogue_drift")).toBe(true);
  });

  it("détecte un repeated_dialogue_echo quand la réplique recopie un snippet historique", () => {
    const profile = buildVoiceProfile({
      characterId: "maya",
      historicalLines: [{ text: "Je n'abandonnerai jamais ma sœur." }],
    });
    const result = detectDialogueVoiceDrift({
      profiles: [profile],
      currentLines: [
        { characterId: "maya", text: "Je n'abandonnerai jamais ma sœur.", panelHint: "panel-12" },
      ],
    });
    const echo = result.issues.find((i) => i.code === "repeated_dialogue_echo");
    expect(echo).toBeDefined();
    expect(echo?.panelHint).toBe("panel-12");
  });

  it("détecte une voice_profile_violation pour registre interdit (argot)", () => {
    const profile = buildVoiceProfile({
      characterId: "lord-aldric",
      forbiddenRegisters: ["argot"],
      historicalLines: [
        { text: "Messire, votre sagesse honore notre maison." },
        { text: "Je m'incline devant votre décision." },
      ],
    });
    const result = detectDialogueVoiceDrift({
      profiles: [profile],
      currentLines: [{ characterId: "lord-aldric", text: "Ouais mec, on bouge." }],
    });
    expect(result.issues.find((i) => i.code === "voice_profile_violation")).toBeDefined();
  });

  it("détecte une emotional_inconsistency quand la majorité des répliques sont hors registre dominant", () => {
    const profile = buildVoiceProfile({
      characterId: "rin",
      historicalLines: [
        { text: "Je veille en silence.", emotion: "calme" },
        { text: "Ce moment passera.", emotion: "calme" },
        { text: "Reste à mes côtés.", emotion: "calme" },
        { text: "Le vent se lève.", emotion: "calme" },
      ],
    });
    const result = detectDialogueVoiceDrift({
      profiles: [profile],
      currentLines: [
        { characterId: "rin", text: "JE VAIS LE TUER !", emotion: "rage" },
        { characterId: "rin", text: "Sortez de ma vue !", emotion: "rage" },
        { characterId: "rin", text: "JAMAIS !", emotion: "rage" },
      ],
    });
    expect(result.issues.find((i) => i.code === "emotional_inconsistency")).toBeDefined();
  });

  it("ne lève rien quand le profil est vide (premier chapitre)", () => {
    const result = detectDialogueVoiceDrift({
      profiles: [],
      currentLines: [{ characterId: "new-hero", text: "Bonjour." }],
    });
    expect(result.issues).toHaveLength(0);
    expect(result.stats[0]?.sampleCount).toBe(0);
  });
});
