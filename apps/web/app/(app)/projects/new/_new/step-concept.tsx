/**
 * Étape 1 du wizard — Concept (titre, pitch, ambition, genre principal +
 * sous-genres).
 */
"use client";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldTooltip } from "@/components/ui/field-tooltip";
import { Textarea } from "@/components/ui/textarea";
import { GENRE_CARDS, GENRE_FAMILIES } from "./constants";
import type { WizardState } from "./use-wizard-state";

export interface StepConceptProps {
  state: WizardState;
  pitchWordCount: number;
}

export function StepConcept({ state, pitchWordCount }: StepConceptProps) {
  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <Label htmlFor="title">Titre *</Label>
          <FieldTooltip
            text="Le titre public de ton manga. Il apparaît sur le projet et peut évoluer."
            example="Les Cendres de Lyra"
          />
        </div>
        <Input
          id="title"
          value={state.title}
          onChange={(e) => state.setTitle(e.target.value)}
          placeholder="Ex : Les Cendres de Lyra"
          required
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <Label htmlFor="pitch">Pitch (1-2 phrases)</Label>
          <FieldTooltip
            text="En une ou deux phrases, résume l'accroche et le conflit central de l'histoire."
            example="Dans une cité flottante, une apprentie ingénieure découvre que les dieux sont une imposture."
          />
        </div>
        <Textarea
          id="pitch"
          value={state.pitch}
          onChange={(e) => state.setPitch(e.target.value)}
          rows={3}
          placeholder="Dans un monde où la magie est interdite, une jeune rebelle découvre qu'elle en est la dernière gardienne."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">
          Ambition de série{" "}
          <span className="text-muted-foreground text-xs">(optionnel)</span>
        </Label>
        <Textarea
          id="description"
          value={state.description}
          onChange={(e) => state.setDescription(e.target.value)}
          rows={3}
          placeholder="Arcs prévus, thèmes profonds, fin envisagée…"
        />
      </div>

      <div className="space-y-3">
        <Label>Genre principal</Label>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {GENRE_CARDS.map(({ emoji, label, value }) => {
            const isPrimary = state.primaryGenre === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => state.setPrimaryGenre(isPrimary ? "" : value)}
                className={`card-manga flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${
                  isPrimary
                    ? "border-primary bg-primary/20 text-primary"
                    : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                <span className="text-xl">{emoji}</span>
                <span className="text-xs font-medium leading-tight">{label}</span>
              </button>
            );
          })}
        </div>
        <Input
          value={state.primaryGenre}
          onChange={(e) => state.setPrimaryGenre(e.target.value)}
          placeholder="Autre genre… (saisie libre)"
          className="mt-1"
        />
        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium text-muted-foreground">Sous-genres (optionnel)</p>
          {GENRE_FAMILIES.map((family) => (
            <div key={family.label}>
              <p className="mb-1 text-[11px] text-muted-foreground/60">{family.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {family.genres.map((genre) => {
                  const isSub =
                    state.subGenres.includes(genre) && state.primaryGenre !== genre;
                  return (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => {
                        if (genre === state.primaryGenre) return;
                        state.toggleSubGenre(genre);
                      }}
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                        isSub
                          ? "border-primary/50 bg-primary/15 text-primary"
                          : "border-border/60 bg-background/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {genre}
                      {isSub ? " ✓" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {(state.primaryGenre || state.subGenres.length > 0) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {state.primaryGenre && (
              <Badge className="bg-primary/20 text-primary border-primary/30">
                ★ {state.primaryGenre}
              </Badge>
            )}
            {state.subGenres.map((g) => (
              <Badge key={g} variant="outline" className="text-xs">
                + {g}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border/40 bg-background/30 px-3 py-2 text-xs text-muted-foreground">
        Pitch : {pitchWordCount} mot{pitchWordCount > 1 ? "s" : ""}
        {pitchWordCount < 10 ? (
          <span className="ml-2 text-amber-300">
            — minimum 10 mots requis pour passer à l&apos;étape suivante
          </span>
        ) : (
          <span className="ml-2 text-emerald-300">— ✓ ok</span>
        )}
      </div>
    </>
  );
}
