"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Pencil, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { ProjectLocation } from "./world-types";

interface LocationCardProps {
  location: ProjectLocation;
  projectId: string;
  onUpdated: (l: ProjectLocation) => void;
}

export function LocationCard({ location, projectId, onUpdated }: LocationCardProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    name: location.name,
    type: location.type ?? "",
    description: location.description ?? "",
    visualBrief: location.visualBrief ?? "",
    establishedVisualBrief: location.establishedVisualBrief ?? "",
    canonImageUrl: location.canonImageUrl ?? "",
    canonLocked: location.canonLocked,
  });

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/locations/${location.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          type: draft.type || null,
          description: draft.description || null,
          visualBrief: draft.visualBrief || null,
          establishedVisualBrief: draft.establishedVisualBrief || null,
          canonImageUrl: draft.canonImageUrl || null,
          canonLocked: draft.canonLocked,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { location: ProjectLocation };
      onUpdated(data.location);
      setEditing(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              {location.name}
              {location.canonLocked ? (
                <Badge variant="default" className="text-[10px]">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  canon
                </Badge>
              ) : null}
              {location.type ? (
                <Badge variant="outline" className="text-[10px]">
                  {location.type}
                </Badge>
              ) : null}
            </CardTitle>
            {location.canonImageUrl ? (
              <CardDescription>Image canon liée</CardDescription>
            ) : (
              <CardDescription className="text-amber-400/80">
                Image canon à générer pour figer le décor
              </CardDescription>
            )}
          </div>
          <div className="flex items-center gap-1">
            {!editing ? (
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!editing ? (
          <>
            {location.description ? <p className="text-sm">{location.description}</p> : null}
            {location.establishedVisualBrief ? (
              <p className="text-xs text-muted-foreground">
                <strong>Brief visuel établi :</strong> {location.establishedVisualBrief}
              </p>
            ) : location.visualBrief ? (
              <p className="text-xs text-muted-foreground">
                <strong>Brief visuel :</strong> {location.visualBrief}
              </p>
            ) : null}
          </>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Nom</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Catégorie</Label>
                <Input
                  placeholder="ville, forêt, vaisseau..."
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Brief visuel (généré IA)</Label>
              <Textarea
                rows={2}
                value={draft.visualBrief}
                onChange={(e) => setDraft({ ...draft, visualBrief: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Brief visuel établi (verrou cross-chapitres)</Label>
              <Textarea
                rows={2}
                placeholder="Décris le lieu tel qu'il doit toujours apparaître. Ce texte est injecté dans tous les prompts décor."
                value={draft.establishedVisualBrief}
                onChange={(e) => setDraft({ ...draft, establishedVisualBrief: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">URL image canon (optionnel)</Label>
              <Input
                placeholder="https://..."
                value={draft.canonImageUrl}
                onChange={(e) => setDraft({ ...draft, canonImageUrl: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={draft.canonLocked}
                onChange={(e) => setDraft({ ...draft, canonLocked: e.target.checked })}
                className="rounded"
              />
              <span>Verrouiller (canon lock)</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                Annuler
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Enregistrer
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
