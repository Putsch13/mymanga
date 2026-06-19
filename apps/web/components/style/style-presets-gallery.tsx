"use client";

import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * SPRINT 4 — galerie de presets style.
 *
 * 8 presets calibrés couvrant les grands styles manga/webtoon. Chaque preset
 * pré-remplit l'ensemble des champs `renderFamily`, `lineWeight`,
 * `shadingMode`, `contrastProfile`, `anatomyBias`, `backgroundDensity`,
 * `cameraLanguage` + une liste `negativeConstraints` typique du style.
 *
 * Avant ce composant (audit v7), l'utilisateur tombait sur un mur de selects
 * abstraits sans savoir lequel choisir → il sortait, ne configurait jamais
 * le style, le pipeline tombait en defaults manga génériques.
 */

export interface StylePresetPatch {
  renderFamily: string;
  lineWeight: string;
  shadingMode: string;
  contrastProfile: string;
  anatomyBias: string;
  backgroundDensity: string;
  cameraLanguage: string;
  negativeConstraints: string[];
}

interface StylePreset {
  id: string;
  label: string;
  emoji: string;
  description: string;
  patch: StylePresetPatch;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "shonen-classic",
    label: "Shōnen classique",
    emoji: "🔥",
    description: "Lignes nettes, ombres dramatiques, action dynamique.",
    patch: {
      renderFamily: "manga",
      lineWeight: "medium",
      shadingMode: "ink_bw",
      contrastProfile: "dramatic",
      anatomyBias: "stylized",
      backgroundDensity: "medium",
      cameraLanguage: "manga_dynamic",
      negativeConstraints: ["3d render", "soft pastel", "blurry lineart", "western comic style"],
    },
  },
  {
    id: "seinen-noir",
    label: "Seinen noir",
    emoji: "🕯️",
    description: "Trait épais, hachures sombres, ambiance pesante adulte.",
    patch: {
      renderFamily: "manga",
      lineWeight: "heavy",
      shadingMode: "hatching",
      contrastProfile: "brutal",
      anatomyBias: "grounded",
      backgroundDensity: "high",
      cameraLanguage: "intimate",
      negativeConstraints: ["chibi", "moe style", "candy colors", "soft shading"],
    },
  },
  {
    id: "shojo-soft",
    label: "Shōjo doux",
    emoji: "🌸",
    description: "Trait fin, ombres douces, lumière diffuse romantique.",
    patch: {
      renderFamily: "manga",
      lineWeight: "fine",
      shadingMode: "cel_shading",
      contrastProfile: "soft",
      anatomyBias: "stylized",
      backgroundDensity: "low",
      cameraLanguage: "intimate",
      negativeConstraints: ["gore", "hyper realistic", "heavy hatching", "muscular bodies"],
    },
  },
  {
    id: "anime-modern",
    label: "Anime moderne",
    emoji: "🎬",
    description: "Style cel-shading colorisé, clean, propre comme un studio.",
    patch: {
      renderFamily: "anime",
      lineWeight: "medium",
      shadingMode: "cel_shading",
      contrastProfile: "dramatic",
      anatomyBias: "stylized",
      backgroundDensity: "medium",
      cameraLanguage: "cinematic",
      negativeConstraints: ["text inside image", "watermark", "blurry", "noisy artifacts"],
    },
  },
  {
    id: "webtoon-color",
    label: "Webtoon coloré",
    emoji: "📱",
    description: "Couleurs saturées, lignes fines, lecture verticale fluide.",
    patch: {
      renderFamily: "anime",
      lineWeight: "fine",
      shadingMode: "painterly",
      contrastProfile: "dramatic",
      anatomyBias: "stylized",
      backgroundDensity: "medium",
      cameraLanguage: "cinematic",
      negativeConstraints: ["heavy hatching", "ink bleed", "monochrome", "rough sketch"],
    },
  },
  {
    id: "horror-gothic",
    label: "Horror gothique",
    emoji: "🕷️",
    description: "Ambiance sombre, hachures profondes, claustrophobie visuelle.",
    patch: {
      renderFamily: "horror",
      lineWeight: "heavy",
      shadingMode: "hatching",
      contrastProfile: "brutal",
      anatomyBias: "grounded",
      backgroundDensity: "high",
      cameraLanguage: "horror_claustrophobic",
      negativeConstraints: ["bright cheerful colors", "chibi", "cartoonish", "soft pastel"],
    },
  },
  {
    id: "western-grit",
    label: "Western grit",
    emoji: "🤠",
    description: "Trait âpre, ombres marquées, palette terre brûlée.",
    patch: {
      renderFamily: "western",
      lineWeight: "heavy",
      shadingMode: "ink_bw",
      contrastProfile: "brutal",
      anatomyBias: "realistic",
      backgroundDensity: "high",
      cameraLanguage: "cinematic",
      negativeConstraints: ["anime style", "kawaii", "soft pastel", "futuristic clothing"],
    },
  },
  {
    id: "semi-realistic",
    label: "Semi-réaliste",
    emoji: "🖋️",
    description: "Anatomie crédible, ombres détaillées, pour drame contemporain.",
    patch: {
      renderFamily: "semi_realistic",
      lineWeight: "medium",
      shadingMode: "painterly",
      contrastProfile: "dramatic",
      anatomyBias: "realistic",
      backgroundDensity: "medium",
      cameraLanguage: "cinematic",
      negativeConstraints: ["chibi", "heavy stylization", "exaggerated features", "noise artifacts"],
    },
  },
];

interface Props {
  onApply: (patch: StylePresetPatch) => void;
  currentRenderFamily?: string | null;
}

export function StylePresetsGallery({ onApply, currentRenderFamily }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Choisir un preset (1 clic)
        </h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STYLE_PRESETS.map((preset) => {
          const active = currentRenderFamily === preset.patch.renderFamily;
          return (
            <Card
              key={preset.id}
              role="button"
              tabIndex={0}
              onClick={() => onApply(preset.patch)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onApply(preset.patch);
                }
              }}
              className={`cursor-pointer border-border/50 bg-card/40 transition hover:border-accent/40 hover:bg-card/60 ${active ? "ring-2 ring-violet-500/40" : ""}`}
            >
              <CardContent className="space-y-1 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span aria-hidden>{preset.emoji}</span>
                  {preset.label}
                </div>
                <p className="text-[11px] text-muted-foreground">{preset.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Cliquer sur un preset remplit tous les champs ci-dessous. Tu peux ensuite affiner.
      </p>
    </div>
  );
}
