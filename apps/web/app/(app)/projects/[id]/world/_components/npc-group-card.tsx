"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Pencil, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { NpcGroup } from "./world-types";

interface NpcGroupCardProps {
  group: NpcGroup;
  projectId: string;
  onUpdated: (g: NpcGroup) => void;
  onDeleted: (id: string) => void;
}

export function NpcGroupCard({ group, projectId, onUpdated, onDeleted }: NpcGroupCardProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    label: group.label,
    description: group.description ?? "",
    visualProfile: group.visualProfile ?? "",
    outfit: group.outfit ?? "",
    silhouette: group.silhouette ?? "",
  });

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/world/npc-groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: draft.label,
          description: draft.description || null,
          visualProfile: draft.visualProfile || null,
          outfit: draft.outfit || null,
          silhouette: draft.silhouette || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { npcGroup: NpcGroup };
      onUpdated(data.npcGroup);
      setEditing(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Supprimer "${group.label}" ?`)) return;
    const res = await fetch(`/api/projects/${projectId}/world/npc-groups/${group.id}`, {
      method: "DELETE",
    });
    if (res.ok) onDeleted(group.id);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              {group.label}
              {group.userEdited ? (
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> édité
                </Badge>
              ) : null}
            </CardTitle>
            <CardDescription>
              vu {group.appearanceCount}× · source {group.source}
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
            {group.description ? <p className="text-sm">{group.description}</p> : null}
            {group.visualProfile ? (
              <p className="text-xs text-muted-foreground">
                <strong>Visuel :</strong> {group.visualProfile}
              </p>
            ) : null}
            {group.outfit ? (
              <p className="text-xs text-muted-foreground">
                <strong>Tenue :</strong> {group.outfit}
              </p>
            ) : null}
            {group.silhouette ? (
              <p className="text-xs text-muted-foreground">
                <strong>Silhouette :</strong> {group.silhouette}
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
              <Label className="text-xs">Profil visuel</Label>
              <Textarea
                rows={2}
                value={draft.visualProfile}
                onChange={(e) => setDraft({ ...draft, visualProfile: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Tenue / uniforme</Label>
                <Input value={draft.outfit} onChange={(e) => setDraft({ ...draft, outfit: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Silhouette</Label>
                <Input
                  value={draft.silhouette}
                  onChange={(e) => setDraft({ ...draft, silhouette: e.target.value })}
                />
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
