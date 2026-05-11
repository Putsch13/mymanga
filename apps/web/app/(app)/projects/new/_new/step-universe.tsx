/**
 * Étape 3 du wizard — Univers (époque, thème, lieux clés).
 */
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ERA_PRESETS, THEME_PRESETS } from "./constants";
import type { WizardState } from "./use-wizard-state";

export function StepUniverse({ state }: { state: WizardState }) {
  return (
    <>
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
        Cadre dans lequel se déroule l&apos;histoire. Ces infos alimentent
        l&apos;univers généré par l&apos;IA et les premiers lieux.
      </div>

      <div className="space-y-2">
        <Label>Époque / setting</Label>
        <Input
          value={state.era}
          onChange={(e) => state.setEra(e.target.value)}
          placeholder="Ex : Japon Edo · cyberpunk 2099 · monde médiéval-fantastique"
        />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {ERA_PRESETS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => state.setEra(t)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                state.era === t
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
        <Label>Thème central</Label>
        <Input
          value={state.theme}
          onChange={(e) => state.setTheme(e.target.value)}
          placeholder="Ex : la liberté, la rédemption, le sacrifice"
        />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {THEME_PRESETS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => state.setTheme(t.toLowerCase())}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                state.theme === t.toLowerCase()
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
        <Label>Lieux clés (1 par ligne)</Label>
        <Textarea
          value={state.keyLocations}
          onChange={(e) => state.setKeyLocations(e.target.value)}
          rows={4}
          placeholder={"Ex :\nPort de Kaze\nDojo abandonné\nCité flottante de Lyra"}
        />
        <p className="text-xs text-muted-foreground">
          Ces noms seront proposés à l&apos;IA pour ancrer les premiers panneaux.
        </p>
      </div>
    </>
  );
}
