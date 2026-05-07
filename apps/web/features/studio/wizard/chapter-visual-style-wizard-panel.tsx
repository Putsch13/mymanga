"use client";

import { useEffect } from "react";
import type { ChapterStudioData, ChapterVisualStyleContract } from "@manga-ai-studio/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TagInput } from "@/components/studio/tag-input";
import { applyChapterVisualStyleToDraft } from "@/lib/chapter-studio/apply-chapter-visual-style-contract";

function defaultStyle(): ChapterVisualStyleContract {
  return {
    format: "manga",
    aspectRatio: "2:3",
    colorMode: "bw",
    styleGenre: "shonen",
    detailLevel: "medium",
    inkingStyle: null,
    contrastLevel: "medium",
    framingStyle: null,
    dialogueDensityVisual: "medium",
    actionDensityVisual: "medium",
    cutawayLevel: "medium",
    forbiddenVisualDrift: [],
  };
}

export function ChapterVisualStyleWizardPanel({
  draft,
  onUpdateDraft,
}: {
  draft: ChapterStudioData;
  onUpdateDraft: (next: ChapterStudioData, step?: "characters" | "canon") => void;
}) {
  useEffect(() => {
    if (draft.chapterVisualStyleContract !== undefined) return;
    onUpdateDraft(applyChapterVisualStyleToDraft({ ...draft, chapterVisualStyleContract: defaultStyle() }), "canon");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init unique à l’entrée de l’étape style
  }, []);

  const style = draft.chapterVisualStyleContract ?? defaultStyle();

  function patch(partial: Partial<ChapterVisualStyleContract>) {
    const nextStyle = { ...style, ...partial };
    const next = applyChapterVisualStyleToDraft({ ...draft, chapterVisualStyleContract: nextStyle });
    onUpdateDraft(next, "canon");
  }

  return (
    <Card
      className="border-amber-500/25 bg-card/50"
      data-testid="chapter-visual-style-wizard-panel"
      data-studio-field="studio-wizard-visual-style"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Style manga & direction artistique</CardTitle>
        <p className="text-xs text-muted-foreground">
          Ces réglages alimentent le profil look du chapitre et les contraintes négatives pour les prompts image.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Format</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={style.format}
              onChange={(e) => patch({ format: e.target.value as ChapterVisualStyleContract["format"] })}
            >
              <option value="manga">Manga</option>
              <option value="webtoon">Webtoon</option>
              <option value="comics">Comics</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ratio / cadrage</Label>
            <Input
              value={style.aspectRatio ?? ""}
              onChange={(e) => patch({ aspectRatio: e.target.value || null })}
              placeholder="2:3, 9:16…"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Noir &amp; blanc ou couleur</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={style.colorMode}
              onChange={(e) => patch({ colorMode: e.target.value as ChapterVisualStyleContract["colorMode"] })}
            >
              <option value="bw">Noir &amp; blanc</option>
              <option value="color">Couleur</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Style (shonen, seinen, cyberpunk…)</Label>
            <Input value={style.styleGenre} onChange={(e) => patch({ styleGenre: e.target.value })} placeholder="ex. seinen urbain" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Niveau de détail</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={style.detailLevel}
              onChange={(e) => patch({ detailLevel: e.target.value as ChapterVisualStyleContract["detailLevel"] })}
            >
              <option value="low">Faible</option>
              <option value="medium">Moyen</option>
              <option value="high">Élevé</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Contraste</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={style.contrastLevel}
              onChange={(e) => patch({ contrastLevel: e.target.value as ChapterVisualStyleContract["contrastLevel"] })}
            >
              <option value="low">Faible</option>
              <option value="medium">Moyen</option>
              <option value="high">Élevé</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Densité dialogues (visuel)</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={style.dialogueDensityVisual}
              onChange={(e) =>
                patch({ dialogueDensityVisual: e.target.value as ChapterVisualStyleContract["dialogueDensityVisual"] })
              }
            >
              <option value="low">Faible</option>
              <option value="medium">Moyen</option>
              <option value="high">Élevé</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Densité action</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={style.actionDensityVisual}
              onChange={(e) =>
                patch({ actionDensityVisual: e.target.value as ChapterVisualStyleContract["actionDensityVisual"] })
              }
            >
              <option value="low">Faible</option>
              <option value="medium">Moyen</option>
              <option value="high">Élevé</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cutaways</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={style.cutawayLevel}
              onChange={(e) => patch({ cutawayLevel: e.target.value as ChapterVisualStyleContract["cutawayLevel"] })}
            >
              <option value="low">Faible</option>
              <option value="medium">Moyen</option>
              <option value="high">Élevé</option>
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Encrage</Label>
            <Input
              value={style.inkingStyle ?? ""}
              onChange={(e) => patch({ inkingStyle: e.target.value || null })}
              placeholder="lignes nerveuses, hachures…"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cadrage / caméra</Label>
            <Input
              value={style.framingStyle ?? ""}
              onChange={(e) => patch({ framingStyle: e.target.value || null })}
              placeholder="plans serrés dynamiques…"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Interdits visuels (dérive)</Label>
          <TagInput
            values={style.forbiddenVisualDrift}
            onChange={(v) => patch({ forbiddenVisualDrift: v })}
            placeholder="pas de style 3D, pas de photoréalisme…"
          />
        </div>

      </CardContent>
    </Card>
  );
}
