/**
 * P5.2 — End card du reader (fin de chapitre).
 *
 * Permet à l'utilisateur d'orienter la suite : intent libre, suggestions,
 * tags rapides. Délègue l'appel API à `useReaderActions.submitContinue`.
 */
"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { READER_QUICK_TAGS, READER_SUGGESTIONS } from "./reader-constants";

export interface ReaderEndCardProps {
  intent: string;
  setIntent: (value: string) => void;
  continuing: boolean;
  continueMsg: string | null;
  submitContinue: (quickTag?: string) => Promise<void> | void;
}

export function ReaderEndCard(props: ReaderEndCardProps) {
  const { intent, setIntent, continuing, continueMsg, submitContinue } = props;

  return (
    <Card className="border-accent/30 bg-gradient-to-br from-card/90 to-violet-950/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Sparkles className="h-5 w-5 text-accent" />
          Fin du chapitre &mdash; quelle suite ?
        </CardTitle>
        <CardDescription>Instruction libre, suggestions ou tags rapides.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Ton idée</Label>
          <Textarea
            rows={4}
            placeholder="Ex. : Le mentor révèle qu'il connaissait le père du héros…"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
          />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">Suggestions</p>
          <div className="flex flex-wrap gap-2">
            {READER_SUGGESTIONS.map((s) => (
              <Button
                key={s.label}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIntent(s.intent)}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">Tags rapides</p>
          <div className="flex flex-wrap gap-2">
            {READER_QUICK_TAGS.map((tag) => (
              <Button
                key={tag}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void submitContinue(tag)}
                disabled={continuing}
              >
                {tag}
              </Button>
            ))}
          </div>
        </div>
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={continuing || !intent.trim()}
          onClick={() => void submitContinue()}
        >
          {continuing ? "Création…" : "Valider et ouvrir la suite"}
        </Button>
        {continueMsg ? <p className="text-sm text-muted-foreground">{continueMsg}</p> : null}
      </CardContent>
    </Card>
  );
}
