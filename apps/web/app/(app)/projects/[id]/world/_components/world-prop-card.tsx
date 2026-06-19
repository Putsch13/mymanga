"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Pencil, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { NARRATIVE_WEIGHTS, PROP_KINDS, type WorldProp } from "./world-types";

interface WorldPropCardProps {
  prop: WorldProp;
  projectId: string;
  onUpdated: (p: WorldProp) => void;
  onDeleted: (id: string) => void;
}

export function WorldPropCard({ prop, projectId, onUpdated, onDeleted }: WorldPropCardProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    label: prop.label,
    description: prop.description ?? "",
    visualDescription: prop.visualDescription ?? "",
    kind: prop.kind as WorldProp["kind"],
    narrativeWeight: prop.narrativeWeight as WorldProp["narrativeWeight"],
  });

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/world/props/${prop.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: draft.label,
          description: draft.description || null,
          visualDescription: draft.visualDescription || null,
          kind: draft.kind,
          narrativeWeight: draft.narrativeWeight,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { worldProp: WorldProp };
      onUpdated(data.worldProp);
      setEditing(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Supprimer "${prop.label}" ?`)) return;
    const res = await fetch(`/api/projects/${projectId}/world/props/${prop.id}`, {
      method: "DELETE",
    });
    if (res.ok) onDeleted(prop.id);
  };

  const kindLabel = PROP_KINDS.find((k) => k.value === prop.kind)?.label ?? prop.kind;
  const weightLabel =
    NARRATIVE_WEIGHTS.find((w) => w.value === prop.narrativeWeight)?.label ?? prop.narrativeWeight;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              {prop.label}
              {prop.userEdited ? (
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> édité
                </Badge>
              ) : null}
            </CardTitle>
            <CardDescription>
              {kindLabel} · {weightLabel} · vu {prop.appearanceCount}×
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            {!editing ? (
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={remove}>
              <Trash2 className="h-3.5 w-3.5 text-red-400" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!editing ? (
          <>
            {prop.description ? <p className="text-sm">{prop.description}</p> : null}
            {prop.visualDescription ? (
              <p className="text-xs text-muted-foreground">
                <strong>Visuel :</strong> {prop.visualDescription}
              </p>
            ) : null}
          </>
        ) : (
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Nom</Label>
              <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Description narrative</Label>
              <Textarea
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Description visuelle</Label>
              <Textarea
                rows={2}
                value={draft.visualDescription}
                onChange={(e) => setDraft({ ...draft, visualDescription: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Catégorie</Label>
                <select
                  className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                  value={draft.kind}
                  onChange={(e) => setDraft({ ...draft, kind: e.target.value as WorldProp["kind"] })}
                >
                  {PROP_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Importance</Label>
                <select
                  className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                  value={draft.narrativeWeight}
                  onChange={(e) =>
                    setDraft({ ...draft, narrativeWeight: e.target.value as WorldProp["narrativeWeight"] })
                  }
                >
                  {NARRATIVE_WEIGHTS.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
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
