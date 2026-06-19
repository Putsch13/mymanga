import { describe, expect, it } from "vitest";
import { mergeSpeechAndVoiceProfile, formatMergedSpeechProfileForPrompt } from "./merge-speech-profile";

describe("mergeSpeechAndVoiceProfile", () => {
  it("priorise voice* sur speechProfile quand les deux sont définis", () => {
    const merged = mergeSpeechAndVoiceProfile({
      speechProfile: { sentenceLength: "long", vocabularyStyle: "poetic" },
      voiceSentenceLength: "short",
      voiceVocabularyStyle: "rough",
    });
    expect(merged.sentenceLength).toBe("short");
    expect(merged.vocabularyStyle).toBe("rough");
  });

  it("retombe sur speechProfile quand voice* est vide", () => {
    const merged = mergeSpeechAndVoiceProfile({
      speechProfile: { sentenceLength: "long", vocabularyStyle: "poetic" },
    });
    expect(merged.sentenceLength).toBe("long");
    expect(merged.vocabularyStyle).toBe("poetic");
  });

  it("convertit les sliders speechProfile 0-10 en 0-1 quand voice* est absent", () => {
    const merged = mergeSpeechAndVoiceProfile({
      speechProfile: { sarcasmLevel: 7, aggressionLevel: 3, silenceFrequency: 5 },
    });
    expect(merged.sarcasmLevel).toBeCloseTo(0.7);
    expect(merged.aggressionLevel).toBeCloseTo(0.3);
    expect(merged.silenceFrequency).toBeCloseTo(0.5);
  });

  it("préserve voice* 0-1 sans conversion", () => {
    const merged = mergeSpeechAndVoiceProfile({
      voiceSarcasmLevel: 0.42,
      voiceAggressionLevel: 0.91,
    });
    expect(merged.sarcasmLevel).toBeCloseTo(0.42);
    expect(merged.aggressionLevel).toBeCloseTo(0.91);
  });

  it("fusionne les expressions favorites/interdites avec priorité voice*", () => {
    const merged = mergeSpeechAndVoiceProfile({
      speechProfile: { favoriteExpressions: ["bah", "tu vois"] },
      voiceFavoriteExpressions: ["Tch", "Hmph"],
    });
    expect(merged.favoriteExpressions).toEqual(["Tch", "Hmph"]);
  });

  it("retourne un profil vide quand aucune source n'est fournie", () => {
    const merged = mergeSpeechAndVoiceProfile({});
    expect(merged.register).toBeNull();
    expect(merged.sarcasmLevel).toBeNull();
    expect(merged.favoriteExpressions).toEqual([]);
  });

  it("formate un bloc compact pour prompt LLM avec quelques champs", () => {
    const formatted = formatMergedSpeechProfileForPrompt(
      "Maya",
      mergeSpeechAndVoiceProfile({
        voiceRegister: "casual",
        voiceSarcasmLevel: 0.6,
        voiceFavoriteExpressions: ["Tch"],
      }),
    );
    expect(formatted).toContain("Maya:");
    expect(formatted).toContain("register=casual");
    expect(formatted).toContain("sarcasm=0.6");
    expect(formatted).toContain("Tch");
  });

  it("retourne null quand aucun champ pertinent pour le prompt", () => {
    const formatted = formatMergedSpeechProfileForPrompt("Bob", mergeSpeechAndVoiceProfile({}));
    expect(formatted).toBeNull();
  });

  it("résout via stableSpeechDNA quand aucune autre source n'est présente", () => {
    const merged = mergeSpeechAndVoiceProfile({
      stableSpeechDNA: {
        register: "formal",
        sentenceLength: "long",
        vocabularyStyle: "literary",
        favoriteExpressions: ["En vérité", "Certes"],
        forbiddenExpressions: ["Ouais"],
      },
    });
    expect(merged.register).toBe("formal");
    expect(merged.sentenceLength).toBe("long");
    expect(merged.vocabularyStyle).toBe("literary");
    expect(merged.favoriteExpressions).toEqual(["En vérité", "Certes"]);
    expect(merged.forbiddenExpressions).toEqual(["Ouais"]);
  });

  it("stableSpeechDNA prime sur voice* quand les deux sont définis", () => {
    const merged = mergeSpeechAndVoiceProfile({
      stableSpeechDNA: { register: "rough", sentenceLength: "very_short" },
      voiceRegister: "casual",
      voiceSentenceLength: "medium",
      speechProfile: { register: "formal", sentenceLength: "long" },
    });
    expect(merged.register).toBe("rough");
    expect(merged.sentenceLength).toBe("very_short");
  });
});
