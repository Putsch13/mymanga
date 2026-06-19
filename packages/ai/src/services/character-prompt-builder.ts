import type { BodyStateSnapshot } from "@manga-ai-studio/core";
import { buildCanonConstraintPrompt } from "./canon-physical-validator";

export interface CharacterPromptBuilderInput {
  name: string;
  roleType?: string | null;
  age?: number | null;
  adultVerified?: boolean;
  pronouns?: string | null;
  biography?: string | null;
  objective?: string | null;
  fear?: string | null;
  trauma?: string | null;
  appearance?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  outfitDefault?: string | null;
  visualProfile?: Record<string, unknown>;
  bodyState?: Record<string, unknown>;
  wardrobeProfile?: Record<string, unknown>;
  speechProfile?: Record<string, unknown>;
  continuityProfile?: Record<string, unknown>;
  adultContentProfile?: Record<string, unknown>;
  personality?: Record<string, unknown>;
  traits?: string[];
  flaws?: string[];
}

export interface CharacterPromptBundle {
  narrativePrompt: string;
  visualPrompt: string;
  speechPrompt: string;
  continuityPrompt: string;
  forbiddenDriftRules: string[];
  canonConstraintLine: string;
}

function safeStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

export function buildCharacterPromptBundle(
  character: CharacterPromptBuilderInput
): CharacterPromptBundle {
  const vp = (character.visualProfile ?? {}) as Record<string, unknown>;
  const bs = (character.bodyState ?? {}) as Record<string, unknown>;
  const wp = (character.wardrobeProfile ?? {}) as Record<string, unknown>;
  const sp = (character.speechProfile ?? {}) as Record<string, unknown>;
  const cp = (character.continuityProfile ?? {}) as Record<string, unknown>;
  const acp = (character.adultContentProfile ?? {}) as Record<string, unknown>;

  // ── Narrative prompt ──────────────────────────────────────────────────────
  const narrativeParts: string[] = [
    `Character: ${character.name}`,
    character.roleType ? `Role: ${character.roleType}` : "",
    character.age ? `Age: ${character.age}` : "",
    character.pronouns ? `Pronouns: ${character.pronouns}` : "",
    character.biography ? `Background: ${character.biography}` : "",
    character.objective ? `Goal: ${character.objective}` : "",
    character.fear ? `Fear: ${character.fear}` : "",
    character.trauma ? `Trauma: ${character.trauma}` : "",
    character.traits?.length ? `Traits: ${character.traits.join(", ")}` : "",
    character.flaws?.length ? `Flaws: ${character.flaws.join(", ")}` : "",
  ].filter(Boolean);

  // ── Pilosité faciale (sprint configurateur) ────────────────────────────────
  const beardPresent = vp.beardPresent === true;
  const mustachePresent = vp.mustachePresent === true;
  const beardSegment = beardPresent
    ? [
        safeStr(vp.beardStyle) || "beard",
        safeStr(vp.beardDensity) ? `${safeStr(vp.beardDensity).toLowerCase()} density` : "",
        safeStr(vp.beardColor) ? `${safeStr(vp.beardColor)} colored` : "",
      ]
        .filter(Boolean)
        .join(", ")
    : "";
  const mustacheSegment = mustachePresent
    ? `${safeStr(vp.mustacheStyle) || "moustache"}`
    : "";
  const sideburnsValue = safeStr(vp.sideburns);
  const sideburnsSegment = sideburnsValue && sideburnsValue !== "Aucun" ? `${sideburnsValue.toLowerCase()} sideburns` : "";

  // ── Personnalité visuelle (mimiques, posture spontanée) ───────────────────
  const personalityVisualParts = [
    safeStr(vp.restingFace) ? `resting face: ${safeStr(vp.restingFace)}` : "",
    safeStr(vp.typicalGaze) ? `typical gaze: ${safeStr(vp.typicalGaze)}` : "",
    safeStr(vp.typicalMimic) ? `typical micro-expression: ${safeStr(vp.typicalMimic)}` : "",
    safeStr(vp.habitualPosture) ? `habitual stance: ${safeStr(vp.habitualPosture)}` : "",
    safeStr(vp.signatureGesture) ? `signature gesture: ${safeStr(vp.signatureGesture)}` : "",
  ].filter(Boolean);

  // ── Visual prompt ─────────────────────────────────────────────────────────
  const visualParts: string[] = [
    character.appearance ?? "",
    character.hairColor ? `${character.hairColor} hair` : safeStr(vp.hairColor) ? `${safeStr(vp.hairColor)} hair` : "",
    character.eyeColor ? `${character.eyeColor} eyes` : safeStr(vp.eyeColor) ? `${safeStr(vp.eyeColor)} eyes` : "",
    safeStr(vp.faceShape) ? `${safeStr(vp.faceShape)} face` : "",
    safeStr(vp.skinTone) ? `${safeStr(vp.skinTone)} skin` : "",
    safeStr(vp.hairStyle) ? `${safeStr(vp.hairStyle)} hairstyle` : "",
    safeStr(vp.silhouetteType) ? `${safeStr(vp.silhouetteType)} silhouette` : "",
    beardSegment ? `facial hair: ${beardSegment}` : "",
    mustacheSegment ? `moustache style: ${mustacheSegment}` : "",
    sideburnsSegment,
    !beardPresent && !mustachePresent ? "clean-shaven face" : "",
    safeStr(vp.scars) ? `scars: ${safeStr(vp.scars)}` : "",
    safeStr(vp.tattoos) ? `tattoos: ${safeStr(vp.tattoos)}` : "",
    safeStr(vp.accessories) ? `accessories: ${safeStr(vp.accessories)}` : "",
    character.outfitDefault ?? safeStr(wp.defaultOutfit),
    safeStr(wp.colorPalette) ? `color palette: ${safeStr(wp.colorPalette)}` : "",
    // État physique
    bs.leftArmPresent === false ? "missing left arm" : "",
    bs.rightArmPresent === false ? "missing right arm" : "",
    bs.leftEyePresent === false ? "eye patch left eye" : "",
    bs.rightEyePresent === false ? "eye patch right eye" : "",
    ...personalityVisualParts,
  ].filter(Boolean);

  // ── Speech prompt ─────────────────────────────────────────────────────────
  const politeness = typeof sp.politenessLevel === "number" ? sp.politenessLevel : 5;
  const sarcasm = typeof sp.sarcasmLevel === "number" ? sp.sarcasmLevel : 0;
  const aggression = typeof sp.aggressionLevel === "number" ? sp.aggressionLevel : 0;
  const sentenceLen = safeStr(sp.sentenceLength) || "medium";

  const speechParts: string[] = [
    `Speech style for ${character.name}:`,
    `Sentence length: ${sentenceLen}`,
    politeness <= 3 ? "Rude, blunt, dismissive tone." : politeness >= 8 ? "Polite, formal, measured tone." : "Neutral politeness.",
    sarcasm >= 7 ? "Heavy sarcasm and dry wit." : sarcasm >= 4 ? "Occasional sarcasm." : "",
    aggression >= 7 ? "Aggressive, threatening undertone." : aggression >= 4 ? "Tense, guarded speech." : "",
    safeStr(sp.seductionStyle) ? `Seduction style: ${safeStr(sp.seductionStyle)}` : "",
    safeStr(sp.threatenStyle) ? `Threatening style: ${safeStr(sp.threatenStyle)}` : "",
    safeStr(sp.lieStyle) ? `Deception style: ${safeStr(sp.lieStyle)}` : "",
    safeStr(sp.innerMonologueStyle) ? `Inner monologue: ${safeStr(sp.innerMonologueStyle)}` : "",
    (sp.favoriteExpressions as string[] | undefined)?.length
      ? `Favorite expressions: ${(sp.favoriteExpressions as string[]).join(", ")}`
      : "",
    "Keep dialogue short, punchy, manga-style. One intent per bubble.",
  ].filter(Boolean);

  // ── Continuity prompt ─────────────────────────────────────────────────────
  const lockedVisual = (cp.lockedVisualTraits as string[] | undefined) ?? [];
  const lockedBody = (cp.lockedBodyTraits as string[] | undefined) ?? [];
  const lockedWardrobe = (cp.lockedWardrobeTraits as string[] | undefined) ?? [];
  const storyCritical = (cp.storyCriticalTraits as string[] | undefined) ?? [];

  const continuityParts: string[] = [
    `Continuity rules for ${character.name}:`,
    lockedVisual.length ? `Locked visual traits: ${lockedVisual.join(", ")}` : "",
    lockedBody.length ? `Locked body traits: ${lockedBody.join(", ")}` : "",
    lockedWardrobe.length ? `Locked wardrobe: ${lockedWardrobe.join(", ")}` : "",
    storyCritical.length ? `Story-critical traits: ${storyCritical.join(", ")}` : "",
    bs.leftArmPresent === false ? "PERMANENT: missing left arm — never restore without canonical event." : "",
    bs.rightArmPresent === false ? "PERMANENT: missing right arm — never restore without canonical event." : "",
    bs.leftEyePresent === false ? "PERMANENT: missing left eye — always show eye patch or scar." : "",
    bs.rightEyePresent === false ? "PERMANENT: missing right eye — always show eye patch or scar." : "",
  ].filter(Boolean);

  // ── Forbidden drift rules ─────────────────────────────────────────────────
  const forbiddenDrift: string[] = [
    ...((cp.forbiddenDrift as string[] | undefined) ?? []),
    bs.leftArmPresent === false
      ? `Never show ${character.name} with an intact left arm unless a regeneration event is canonized.`
      : "",
    bs.rightArmPresent === false
      ? `Never show ${character.name} with an intact right arm unless a regeneration event is canonized.`
      : "",
    bs.leftEyePresent === false
      ? `Never show ${character.name} with both eyes intact.`
      : "",
    ...((bs.scarsCurrent as string[] | undefined) ?? []).map(
      (s) => `Keep scar visible: ${s}`
    ),
    ...lockedVisual.map((t) => `Visual trait locked: ${t}`),
    ...lockedWardrobe.map((t) => `Wardrobe locked: ${t}`),
    beardPresent
      ? `Never show ${character.name} clean-shaven — facial hair is canonical${beardSegment ? ` (${beardSegment})` : ""}.`
      : "",
    !beardPresent && !mustachePresent
      ? `Never add a beard or moustache to ${character.name} — clean-shaven is canonical.`
      : "",
  ].filter(Boolean);

  // ── Adult content guard ───────────────────────────────────────────────────
  const isAdult = acp.isAdultCharacter === true && character.adultVerified === true && (character.age ?? 0) >= 18;
  if (!isAdult && acp.sensualPresentationAllowed) {
    forbiddenDrift.push(`${character.name} is not verified adult — no sensual presentation allowed.`);
  }

  // ── Canon constraint line (for image prompts) ─────────────────────────────
  const canonState: BodyStateSnapshot = {
    leftArmPresent: bs.leftArmPresent !== false,
    rightArmPresent: bs.rightArmPresent !== false,
    leftLegPresent: bs.leftLegPresent !== false,
    rightLegPresent: bs.rightLegPresent !== false,
    leftEyePresent: bs.leftEyePresent !== false,
    rightEyePresent: bs.rightEyePresent !== false,
    scarsCurrent: (bs.scarsCurrent as string[] | undefined) ?? [],
    burns: (bs.burns as string[] | undefined) ?? [],
    prosthetics: (bs.prosthetics as string[] | undefined) ?? [],
    bandages: (bs.bandages as string[] | undefined) ?? [],
    currentInjuries: (bs.currentInjuries as string[] | undefined) ?? [],
    permanentAlterations: (bs.permanentAlterations as string[] | undefined) ?? [],
    temporaryAlterations: (bs.temporaryAlterations as string[] | undefined) ?? [],
    hairColor: (character.hairColor ?? safeStr(vp.hairColor)) || undefined,
    currentOutfit: (character.outfitDefault ?? safeStr(wp.defaultOutfit)) || undefined,
  };

  const canonConstraintLine = buildCanonConstraintPrompt(character.name, canonState);

  return {
    narrativePrompt: narrativeParts.join("\n"),
    visualPrompt: visualParts.join(", "),
    speechPrompt: speechParts.join("\n"),
    continuityPrompt: continuityParts.join("\n"),
    forbiddenDriftRules: forbiddenDrift,
    canonConstraintLine,
  };
}
