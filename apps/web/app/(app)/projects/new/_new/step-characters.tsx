/**
 * Étape 2 du wizard — Personnages principaux (héros + secondaire).
 */
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { WizardState } from "./use-wizard-state";

export function StepCharacters({ state }: { state: WizardState }) {
  return (
    <>
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
        Définis le héros (obligatoire) et un personnage secondaire pour ancrer le
        casting principal de ta série dès la création.
      </div>

      <div className="space-y-3 rounded-xl border border-border/60 bg-background/30 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Héros principal *</p>
          <span className="text-[10px] uppercase tracking-wider text-primary">obligatoire</span>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Nom</Label>
          <Input
            value={state.heroName}
            onChange={(e) => state.setHeroName(e.target.value)}
            placeholder="Ex : Akira Tanaka"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Rôle / archétype</Label>
          <Input
            value={state.heroRole}
            onChange={(e) => state.setHeroRole(e.target.value)}
            placeholder="Ex : étudiant rebelle, dernier gardien"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Brève description (3-4 lignes)</Label>
          <Textarea
            value={state.heroBrief}
            onChange={(e) => state.setHeroBrief(e.target.value)}
            rows={3}
            placeholder="Apparence, motivation, ce qui le rend unique…"
          />
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border/40 bg-background/20 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Personnage secondaire</p>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            optionnel
          </span>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Nom</Label>
          <Input
            value={state.secondaryName}
            onChange={(e) => state.setSecondaryName(e.target.value)}
            placeholder="Ex : Yuki Hoshino"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Rôle</Label>
          <Input
            value={state.secondaryRole}
            onChange={(e) => state.setSecondaryRole(e.target.value)}
            placeholder="Ex : mentor, allié, rival"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Brève description</Label>
          <Textarea
            value={state.secondaryBrief}
            onChange={(e) => state.setSecondaryBrief(e.target.value)}
            rows={3}
            placeholder="Lien avec le héros, dynamique, conflit…"
          />
        </div>
      </div>
    </>
  );
}
