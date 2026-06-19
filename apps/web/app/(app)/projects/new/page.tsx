"use client";

/**
 * ARCH-5 — Wizard 5 étapes (UX premium).
 * 1. Concept     : titre + pitch + genre
 * 2. Personnages : héros (obligatoire) + secondaire (optionnel)
 * 3. Univers     : époque + thème + lieux clés
 * 4. Style       : tone + format + style visuel + rating + intensity (+ réglages fins)
 * 5. Confirmation : récapitulatif visuel + lancement chapitre 1
 *
 * Chaque étape vit dans `_new/` (composant + état partagé via `useWizardState`).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TOTAL_STEPS } from "./_new/constants";
import { StepCharacters } from "./_new/step-characters";
import { StepConcept } from "./_new/step-concept";
import { StepConfirmation } from "./_new/step-confirmation";
import { StepStyle } from "./_new/step-style";
import { StepUniverse } from "./_new/step-universe";
import { submitNewProject } from "./_new/submit";
import { useWizardState } from "./_new/use-wizard-state";

const STEP_TITLES: Record<number, string> = {
  1: `Étape 1/${TOTAL_STEPS} — Concept (titre, pitch, genre)`,
  2: `Étape 2/${TOTAL_STEPS} — Personnages principaux`,
  3: `Étape 3/${TOTAL_STEPS} — Univers (époque, thème, lieux)`,
  4: `Étape 4/${TOTAL_STEPS} — Style visuel & ton`,
  5: `Étape 5/${TOTAL_STEPS} — Confirmation`,
};

export default function NewProjectPage() {
  const router = useRouter();
  const state = useWizardState();

  const pitchWordCount = state.pitch.trim() ? state.pitch.trim().split(/\s+/).length : 0;
  const canContinueStep1 = state.title.trim().length > 0 && pitchWordCount >= 10;
  const canContinueStep2 = state.heroName.trim().length > 0;
  const canContinue =
    state.step === 1
      ? canContinueStep1
      : state.step === 2
        ? canContinueStep2
        : true;
  const canSubmit =
    state.title.trim().length > 0 && state.heroName.trim().length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    state.setLoading(true);
    state.setError(null);
    const result = await submitNewProject(state);
    state.setLoading(false);
    if (!result.ok) {
      state.setError(result.error ?? "Création impossible");
      return;
    }
    if (result.redirectTo) {
      router.push(result.redirectTo);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Link
        href="/dashboard"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Dashboard
      </Link>

      <div className="rounded-[2rem] border border-border/60 bg-black/20 px-6 py-6">
        <p className="text-sm font-medium text-accent">Créer un manga</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Concept → Personnages → Univers → Style → Lancement
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Cinq étapes courtes. Pose les fondations narratives et visuelles, on
          enchaîne directement sur la génération du chapitre 1.
        </p>
      </div>

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle className="text-xl">Nouveau manga</CardTitle>
          <CardDescription>{STEP_TITLES[state.step]}</CardDescription>
          <div className="flex gap-2 pt-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <div
                key={n}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  n <= state.step ? "bg-primary" : "bg-border/40"
                }`}
              />
            ))}
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5">
            {state.step === 1 && (
              <StepConcept state={state} pitchWordCount={pitchWordCount} />
            )}
            {state.step === 2 && <StepCharacters state={state} />}
            {state.step === 3 && <StepUniverse state={state} />}
            {state.step === 4 && <StepStyle state={state} />}
            {state.step === 5 && <StepConfirmation state={state} />}

            {state.error && <p className="text-sm text-red-400">{state.error}</p>}

            <div className="flex gap-2 pt-2">
              {state.step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={state.loading}
                  onClick={() => state.setStep((s) => Math.max(1, s - 1))}
                >
                  Retour
                </Button>
              )}
              {state.step < TOTAL_STEPS ? (
                <Button
                  type="button"
                  className="w-full"
                  disabled={!canContinue || state.loading}
                  onClick={() => state.setStep((s) => Math.min(TOTAL_STEPS, s + 1))}
                >
                  Continuer
                </Button>
              ) : (
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!canSubmit || state.loading}
                >
                  {state.loading ? "Création…" : "Créer et lancer le chapitre 1"}
                </Button>
              )}
            </div>

            {state.step === 4 && (
              <button
                type="button"
                onClick={() => state.setStep(5)}
                disabled={!canSubmit || state.loading}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1 disabled:opacity-40"
              >
                Aller directement à la confirmation →
              </button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
