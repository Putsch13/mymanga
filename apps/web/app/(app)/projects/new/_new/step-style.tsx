/**
 * Étape 4 du wizard — Style visuel & ton (+ réglages avancés repliables).
 */
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldTooltip } from "@/components/ui/field-tooltip";
import {
  FORMAT_LABELS,
  FORMAT_PRESETS,
  INTENSITY_PRESETS,
  RATING_PRESETS,
  TONE_PRESETS,
  VISUAL_PRESETS,
} from "./constants";
import { SliderField } from "./slider-field";
import type { WizardState } from "./use-wizard-state";

export function StepStyle({ state }: { state: WizardState }) {
  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <Label>Ton narratif</Label>
          <FieldTooltip
            text="L'ambiance générale des dialogues et de la narration (sérieux, léger, oppressant…)."
            example="Sombre et brutal / Mélancolique et poétique"
          />
        </div>
        <Input
          value={state.tone}
          onChange={(e) => state.setTone(e.target.value)}
          placeholder="Ex : sombre et brutal"
        />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {TONE_PRESETS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => state.setTone(t)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                state.tone === t
                  ? "border-primary bg-primary/20 text-primary"
                  : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Format</Label>
        <div className="flex flex-wrap gap-2">
          {FORMAT_PRESETS.map((f) => (
            <Button
              key={f}
              type="button"
              variant={state.format === f ? "default" : "outline"}
              size="sm"
              onClick={() => state.setFormat(f)}
            >
              {FORMAT_LABELS[f]}
            </Button>
          ))}
        </div>
        {state.format === "simple" ? (
          <p className="text-xs text-muted-foreground">
            Mode storyboard rapide : 1 case par page, style sketch à l&apos;aquarelle,
            sous-titres sous l&apos;image. Idéal pour brainstormer avant la version
            finale.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <Label>Style visuel</Label>
          <FieldTooltip
            text="Les références visuelles pour guider la génération d'images (trait, encrage, références d'artistes…)."
            example="Encre noire détaillée, style seinen / Aquarelle douce, shōjo"
          />
        </div>
        <Input
          value={state.visualStyle}
          onChange={(e) => state.setVisualStyle(e.target.value)}
          placeholder="Ex : encre noire détaillée, style seinen"
        />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {VISUAL_PRESETS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => state.setVisualStyle(v)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                state.visualStyle === v
                  ? "border-primary bg-primary/20 text-primary"
                  : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Niveau de contenu</Label>
        <div className="flex flex-wrap gap-2">
          {RATING_PRESETS.map((r) => (
            <Button
              key={r}
              type="button"
              variant={state.contentRating === r ? "default" : "outline"}
              size="sm"
              onClick={() => state.setContentRating(r)}
            >
              {r}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Intensité visuelle / narrative</Label>
        <div className="flex flex-wrap gap-2">
          {INTENSITY_PRESETS.map(({ key, label }) => (
            <Button
              key={key}
              type="button"
              variant={state.intensityLayer === key ? "default" : "outline"}
              size="sm"
              onClick={() => state.setIntensityLayer(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {(state.contentRating === "ADULT_RESTRICTED" ||
        state.intensityLayer === "ADULT_EXPLICIT") && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-4 text-sm text-amber-200">
          Contenu adulte : réservé aux utilisateurs vérifiés 18+. Reste cohérent avec les
          règles de modération.
        </div>
      )}

      <div className="rounded-xl border border-border/40 bg-background/30 p-3">
        <button
          type="button"
          onClick={() => state.setShowAdvancedSettings((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <span>Réglages avancés (curseurs de tonalité)</span>
          <span className="text-xs">{state.showAdvancedSettings ? "▼" : "▶"}</span>
        </button>
        {state.showAdvancedSettings ? (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Ajuste le ton de ton manga. Les valeurs par défaut conviennent dans la plupart
                des cas.
              </p>
              <button
                type="button"
                onClick={state.resetAdvancedSliders}
                className="ml-4 shrink-0 rounded-lg border border-border/50 bg-background/40 px-3 py-1 text-xs text-muted-foreground hover:border-border hover:text-foreground transition-colors"
              >
                Réinitialiser
              </button>
            </div>
            <SliderField
              label="Violence"
              value={state.violenceLevel}
              onChange={state.setViolenceLevel}
            />
            <SliderField
              label="Romance"
              value={state.romanceLevel}
              onChange={state.setRomanceLevel}
            />
            <SliderField
              label="Sensualité"
              value={state.sensualityLevel}
              onChange={state.setSensualityLevel}
            />
            <SliderField
              label="Noirceur"
              value={state.darknessLevel}
              onChange={state.setDarknessLevel}
            />
            <SliderField
              label="Mystère"
              value={state.mysteryLevel}
              onChange={state.setMysteryLevel}
            />
            <SliderField
              label="Densité dialogues"
              value={state.dialogueDensity}
              onChange={state.setDialogueDensity}
            />
            <SliderField
              label="Fidélité à l'histoire"
              value={state.canonStrictness}
              onChange={state.setCanonStrictness}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
