/**
 * manga-prompt-dictionaries.ts
 *
 * Dictionnaires statiques (mood, camera, intensity, framing, beat fx,
 * negative prompts) utilisés par le composer manga legacy.
 *
 * Extrait de `manga-prompt-composer.ts` (audit-v9, < 500 lignes/fichier).
 */

import type { PanelMood } from "../chapter/shared-types";

export const MOOD_DESCRIPTORS: Record<PanelMood, string> = {
  action: "dynamic action scene, motion blur, speed lines, explosive energy",
  tension: "tense atmosphere, dramatic shadows, high contrast, ominous lighting",
  emotion: "emotional close-up, glistening eyes, soft warm lighting, delicate expression",
  revelation: "shocking reveal, dramatic spotlight, wide eyes, frozen moment",
  calm: "peaceful composition, soft diffused light, serene atmosphere",
  horror: "dark horror, deep oppressive shadows, unsettling angles, pale skin",
  romance: "soft romantic lighting, cherry blossom petals, warm golden tones, intimate framing",
  comedy: "comedic exaggeration, sweat drops, chibi-style reaction, bright colors",
  dramatic: "dramatic composition, strong diagonal shadows, cinematic framing",
};

export const CAMERA_DESCRIPTORS: Record<string, string> = {
  "wide establishing shot": "wide shot, full environment visible, characters small in frame",
  "medium shot": "medium shot, waist up, balanced composition",
  "close-up on face": "close-up portrait, face filling frame, emotional detail",
  "over-the-shoulder shot": "over-the-shoulder perspective, depth of field",
  "extreme close-up on eyes": "extreme close-up, eyes only, intense gaze, micro detail",
  "low angle shot": "low angle, looking up, powerful imposing figure",
  "bird's eye view": "bird's eye view, top-down perspective, full scene overview",
};

export const INTENSITY_CONSTRAINTS: Record<string, string> = {
  GENERAL_SAFE: "family friendly, no violence, no suggestive content",
  TEEN: "mild action, teen appropriate, light drama only",
  MATURE_DRAMA:
    "dark manga style, stylized violence allowed, blood splatter manga ink style, dark seinen aesthetic, visceral action, dramatic wounds, intense combat damage, horror manga composition, mature dark themes",
  MATURE_VISUAL:
    "mature visual content, artistic nudity allowed, explicit violence, dark themes",
  ADULT_EXPLICIT:
    "adult content, explicit artistic nudity, dark romance, explicit violence, extreme gore manga style, visceral wounds, blood splatter heavy, seinen extreme violence, visceral body horror manga, intense combat damage, no censorship manga style, extreme mature themes",
  RESTRICTED_BLOCKED_VISUAL: "BLOCKED",
};

export const BASE_NEGATIVE =
  "blurry, deformed hands, extra limbs, wrong hair color, inconsistent outfit, bad anatomy, " +
  "watermark, text overlay, low quality, duplicate character, poorly drawn face, " +
  "missing fingers, extra fingers, fused characters, inconsistent art style, empty background, vague background, plain backdrop, studio background, floating character, disconnected characters, no environment interaction, washed image, overblur";

// IMG-2 : Négatif prompt manga universel — interdit tout ce qui casse le style manga
export const MANGA_UNIVERSAL_NEGATIVE =
  "photorealistic, photography, 3d render, CGI, western comics style, american comics, " +
  "Marvel style, DC style, pixar style, anime 3d, portrait photo, selfie, " +
  "centered composition always, white background, studio background, signature, artist signature, " +
  "bad anatomy, deformed hands, extra fingers, fused fingers, missing limbs, floating limbs";

// IMG-1 : Framing directives selon shotType + subjectFocus
export const MANGA_FRAMING_MAP: Record<string, string> = {
  wide_environment:
    "wide establishing shot, full background detail, characters small in frame, manga environmental panel, environmental storytelling",
  medium_environment:
    "medium shot with environment dominant, manga environmental panel, architecture and setting readable, characters secondary in frame",
  closeup_environment:
    "close-up environmental detail, manga location texture, architectural or object detail, atmosphere-driven panel",
  extreme_closeup_environment:
    "macro close-up environmental detail, manga texture panel, material and atmosphere focus, no character centered",
  wide_action:
    "dynamic action shot, motion blur lines, speed lines, manga action panel, kinetic energy, explosive composition",
  wide_crowd:
    "crowd scene, multiple figures, manga public scene, depth of field, social dynamics visible",
  closeup_reaction:
    "extreme close-up face, manga reaction panel, expressive eyes, emotion lines, hatching screen tone background",
  closeup_emotion:
    "extreme close-up face, manga emotion panel, glistening eyes, micro expression detail, emotion lines",
  closeup_prop: "macro close-up insert panel, object detail shot, manga prop focus, sharp object detail",
  closeup_enemy: "villain reveal close-up, manga antagonist panel, intimidating gaze, dramatic lighting",
  closeup_npc:
    "secondary character close-up, manga NPC reveal panel, expressive reaction, detailed face, character personality visible",
  extreme_closeup_npc:
    "extreme close-up secondary character, manga NPC emotion panel, micro-expression detail, emotion lines",
  medium_npc:
    "medium shot NPC character, manga secondary character panel, clear body language, distinct silhouette, reaction to hero",
  wide_npc:
    "wide shot with secondary character prominent, manga NPC establishing panel, readable body language, environment clues visible",
  medium_interaction:
    "two-shot interaction panel, manga dialogue scene, both characters visible, spatial tension readable, face-to-face composition",
  wide_interaction:
    "wide two-shot interaction, manga confrontation panel, characters framed together, spatial geography clear",
  closeup_interaction:
    "tight two-shot interaction, manga dialogue close-up, both faces visible, emotional exchange readable",
  medium_enemy: "medium shot villain panel, manga antagonist confrontation, menacing body language, dramatic pose",
  wide_enemy:
    "wide shot villain reveal, manga antagonist establishing panel, environmental menace, full silhouette",
  medium_hero: "medium shot, manga hero panel, dynamic pose, detailed costume, clean crisp linework",
  extreme_closeup_hero: "extreme close-up hero, manga key emotion panel, intense gaze, micro-expression",
  wide_hero: "wide shot hero panel, manga heroic composition, full body visible, environment readable",
  wide_reaction:
    "wide shot reaction panel, manga group reaction, multiple responses visible, emotional spread",
  medium_reaction:
    "medium shot reaction panel, manga emotional response, clear body language, reaction lines",
  wide_prop: "wide shot with prominent prop, manga object-focused panel, object in context of environment",
  medium_prop: "medium shot prop panel, manga object reveal, tactile detail, held or displayed object",
  wide_aftermath: "wide aftermath shot, manga consequence panel, changed environment, silence and stillness",
  medium_aftermath: "medium shot aftermath, manga quiet moment, debris and breath, emotional weight",
  medium_dialogue:
    "over-shoulder dialogue shot, manga conversation panel, speech bubble space reserved top",
  medium_combat: "manga combat panel, dynamic fighting pose, impact lines, kinetic composition",
  over_shoulder: "over-the-shoulder perspective, manga POV panel, depth of field, subject in focus",
  splash_reveal:
    "splash page reveal, full page impact, manga revelation panel, dramatic composition, widescreen manga",
  wide_gore_aftermath:
    "wide shot aftermath, battle damage environment, debris field, dark atmosphere, empty battlefield, broken environment",
  closeup_wound:
    "extreme close-up injury, manga wound rendering, dark seinen style, dramatic impact mark, intense detail",
  medium_horror:
    "horror medium shot, unsettling framing, distorted space, horror manga composition, pale skin contrast",
  wide_horror:
    "horror establishing shot, oppressive environment, dark atmosphere, twisted space, no safe ground in frame",
  action_gore:
    "intense combat close-up, visceral action lines, impact moment, dark manga combat, kinetic violent energy",
};

// IMG-4 : Effets manga par type de beat
export const BEAT_TYPE_ADDONS: Record<string, string> = {
  combat: "speed lines, motion blur, impact burst, kinetic energy lines, manga action sfx styling",
  action_gore:
    "speed lines, impact burst, blood splatter ink style, visceral wound detail, heavy manga gore sfx, body damage visible, extreme combat impact",
  chase: "speed lines, blur trail, motion streak, horizontal momentum lines, kinetic manga panel",
  revelation: "manga reveal panel framing, emphasized subject clarity",
  emotional: "emotion screen tone, sparkle effects, soft diagonal screen tone, manga emotional moment",
  infiltration: "deep ink shadows, cross-hatching, noir manga style, stealth atmosphere, high contrast",
  confrontation: "dramatic impact lines, manga standoff panel, tension lines between figures",
  romance: "soft screen tone overlay, petal effects, warm hatching, manga romantic moment",
  comedy: "manga comedy panel, sweat drops, reaction lines, chibi exaggeration possible",
  body_horror_reveal:
    "visceral body horror manga, grotesque transformation, ink splatter heavy, extreme detail flesh, horror manga composition",
};
