"use client";

import type { ChapterIntentContract, ChapterStudioData, LocationCanon } from "@manga-ai-studio/core";
import { useCallback, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  buildEntitiesFromIntent,
  emptyEntities,
  intentHasRequirements,
} from "./_living-world/utils";

function intentMatches(a: ChapterIntentContract | null | undefined, b: ChapterIntentContract | null | undefined): boolean {
  if (!a || !b) return false;
  return a.understoodPitch === b.understoodPitch && a.confidenceScore === b.confidenceScore;
}

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `loc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function buildLocationCanonsFromIntent(
  existing: LocationCanon[] | undefined,
  intent: ChapterIntentContract,
): LocationCanon[] | undefined {
  const locs = intent.requiredLocations ?? [];
  if (locs.length === 0) return existing;
  if (existing && existing.length > 0) return existing;
  return locs.map((raw, i) => {
    const label = raw.trim();
    return {
      locationId: uid(),
      label,
      locationType: null,
      visualBrief: null,
      isPrimary: i === 0,
      visualMarkers: [],
      architecture: [],
      density: null,
      atmosphere: [],
      timeOfDayVariants: [],
      weatherVariants: [],
      mustKeep: [],
      forbiddenDrift: [],
      fixedElements: [],
      lightingRules: [],
      palette: [],
      referenceImages: [],
    };
  });
}

type Pacing = "slow" | "balanced" | "fast";
type DialogueLevel = "low" | "medium" | "high";

export function ChapterIntentCompilePanel({
  projectId,
  chapterId,
  draft,
  onUpdateDraft,
}: {
  projectId: string;
  chapterId: string;
  draft: ChapterStudioData;
  onUpdateDraft: (next: ChapterStudioData, step?: "intent") => void;
}) {
  const [mustHappen, setMustHappen] = useState("");
  const [mustNot, setMustNot] = useState("");
  const [wish, setWish] = useState("");
  const [pacing, setPacing] = useState<Pacing>("balanced");
  const [dialogueLevel, setDialogueLevel] = useState<DialogueLevel>("medium");
  const [endingType, setEndingType] = useState("");
  const [lastCompiled, setLastCompiled] = useState<ChapterIntentContract | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const shown = useMemo(
    () => lastCompiled ?? draft.chapterIntentContract ?? null,
    [draft.chapterIntentContract, lastCompiled],
  );

  const isSaved = useMemo(
    () => intentMatches(shown, draft.chapterIntentContract),
    [shown, draft.chapterIntentContract],
  );

  const runCompile = useCallback(async () => {
    setError(null);
    setSavedMessage(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/intent-compile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shortPitch: draft.intent?.shortPitch ?? "",
          mustHappen: mustHappen || undefined,
          mustNot: mustNot || undefined,
          wish: wish || undefined,
          pacing,
          dialogueLevel,
          endingType: endingType || undefined,
        }),
      });
      const json = (await res.json()) as { contract?: ChapterIntentContract; error?: string };
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Compilation impossible.");
        setLastCompiled(null);
        return;
      }
      if (!json.contract) {
        setError("Réponse serveur inattendue.");
        setLastCompiled(null);
        return;
      }
      setLastCompiled(json.contract);
    } catch {
      setError("Erreur réseau.");
      setLastCompiled(null);
    } finally {
      setLoading(false);
    }
  }, [chapterId, dialogueLevel, draft.intent?.shortPitch, endingType, mustHappen, mustNot, pacing, projectId, wish]);

  const saveValidated = useCallback(() => {
    if (!shown) return;
    let next: ChapterStudioData = { ...draft, chapterIntentContract: shown };
    if (intentHasRequirements(shown)) {
      const current = draft.chapterEntities ?? emptyEntities();
      next = { ...next, chapterEntities: buildEntitiesFromIntent(current, shown) };
    }
    const autoLocs = buildLocationCanonsFromIntent(draft.locationCanons, shown);
    if (autoLocs) {
      next = { ...next, locationCanons: autoLocs };
    }
    onUpdateDraft(next, "intent");
    setSavedMessage("Intention enregistrée dans le studio");
    setTimeout(() => setSavedMessage(null), 4000);
  }, [draft, onUpdateDraft, shown]);

  const confidencePct = shown ? Math.round(shown.confidenceScore * 100) : null;
  const lowConfidence = shown && shown.confidenceScore < 0.75;

  return (
    <Card className="border-primary/25 bg-card/50" data-testid="chapter-intent-compile-panel">
      <CardHeader>
        <CardTitle className="text-base">Intention — ce que l&apos;IA doit comprendre (chapitre 1)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Renseigne les contraintes puis compile : tu verras le résumé structuré. En premium, la génération exige une intention
          enregistrée avec une confiance ≥ 75 %.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Ce qui doit absolument arriver</Label>
          <Textarea
            rows={2}
            placeholder="Ex. : Il doit rencontrer une créature mécanique."
            value={mustHappen}
            onChange={(e) => setMustHappen(e.target.value)}
            data-studio-field="intent-must-happen"
          />
        </div>
        <div className="space-y-2">
          <Label>Ce qu&apos;il ne faut pas faire</Label>
          <Textarea
            rows={2}
            placeholder="Ex. : Ne change jamais son masque."
            value={mustNot}
            onChange={(e) => setMustNot(e.target.value)}
            data-studio-field="intent-must-not"
          />
        </div>
        <div className="space-y-2">
          <Label>Ton souhaité (émotion / ambiance)</Label>
          <Textarea rows={2} placeholder="Ex. : Mélancolie sous la pluie, espoir en fin de scène." value={wish} onChange={(e) => setWish(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Rythme</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={pacing}
              onChange={(e) => setPacing(e.target.value as Pacing)}
            >
              <option value="slow">Lent</option>
              <option value="balanced">Équilibré</option>
              <option value="fast">Rapide</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Niveau de dialogue</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={dialogueLevel}
              onChange={(e) => setDialogueLevel(e.target.value as DialogueLevel)}
            >
              <option value="low">Peu de dialogues</option>
              <option value="medium">Moyen</option>
              <option value="high">Beaucoup de dialogues</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Type de fin</Label>
          <Textarea rows={1} placeholder="Ex. : Cliffhanger / résolution partielle / twist…" value={endingType} onChange={(e) => setEndingType(e.target.value)} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" disabled={loading} onClick={() => void runCompile()} data-testid="intent-compile-run">
            {loading ? "Compilation…" : "Compiler l'intention"}
          </Button>
          {shown && isSaved ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400" data-testid="intent-saved-badge">
              <Check className="h-4 w-4" />
              Intention enregistrée
            </span>
          ) : (
            <Button type="button" disabled={!shown || Boolean(lowConfidence)} onClick={saveValidated} data-testid="intent-compile-save">
              Valider et enregistrer dans le studio
            </Button>
          )}
        </div>

        {savedMessage ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">{savedMessage}</p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {shown ? (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">Résultat de la compilation</span>
              {confidencePct !== null ? (
                <span className={lowConfidence ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>
                  Confiance : {confidencePct}%
                </span>
              ) : null}
            </div>
            {lowConfidence ? (
              <p className="text-amber-700 dark:text-amber-300 text-xs">
                La confiance est sous le seuil premium (75 %). Enrichis le pitch (carte Brief) ou les contraintes ci-dessus, puis recompile.
              </p>
            ) : null}
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">J&apos;ai compris : </span>
              {shown.understoodPitch}
            </p>
            {shown.mustInclude.length > 0 ? (
              <div>
                <p className="font-medium text-foreground">À inclure</p>
                <ul className="list-disc list-inside text-muted-foreground">
                  {shown.mustInclude.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {shown.mustAvoid.length > 0 ? (
              <div>
                <p className="font-medium text-foreground">À éviter</p>
                <ul className="list-disc list-inside text-muted-foreground">
                  {shown.mustAvoid.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {(shown.requiredCharacters.length > 0
              || shown.requiredLocations.length > 0
              || shown.requiredNpcs.length > 0
              || shown.requiredCreatures.length > 0
              || shown.requiredProps.length > 0) ? (
              <div className="grid gap-2 sm:grid-cols-2 text-xs">
                {shown.requiredCharacters.length > 0 ? (
                  <div>
                    <p className="font-medium">Personnages détectés</p>
                    <p className="text-muted-foreground">{shown.requiredCharacters.join(", ")}</p>
                  </div>
                ) : null}
                {shown.requiredLocations.length > 0 ? (
                  <div>
                    <p className="font-medium">Décors détectés</p>
                    <p className="text-muted-foreground">{shown.requiredLocations.join(", ")}</p>
                  </div>
                ) : null}
                {shown.requiredCreatures.length > 0 ? (
                  <div>
                    <p className="font-medium">Créatures</p>
                    <p className="text-muted-foreground">{shown.requiredCreatures.join(", ")}</p>
                  </div>
                ) : null}
                {shown.requiredProps.length > 0 ? (
                  <div>
                    <p className="font-medium">Objets importants</p>
                    <p className="text-muted-foreground">{shown.requiredProps.join(", ")}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
            {shown.ambiguityFlags.length > 0 ? (
              <div>
                <p className="font-medium text-foreground">Questions / ambiguïtés</p>
                <ul className="list-disc list-inside text-muted-foreground text-xs">
                  {shown.ambiguityFlags.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
