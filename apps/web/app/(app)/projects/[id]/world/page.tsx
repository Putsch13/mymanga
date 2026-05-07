"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Globe2, Loader2, Package, Pencil, Save, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface NpcGroup {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  visualProfile: string | null;
  outfit: string | null;
  silhouette: string | null;
  source: string;
  userEdited: boolean;
  appearanceCount: number;
}

interface WorldProp {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  visualDescription: string | null;
  kind: string;
  narrativeWeight: string;
  source: string;
  userEdited: boolean;
  appearanceCount: number;
}

const PROP_KINDS: Array<{ value: WorldProp["kind"]; label: string }> = [
  { value: "weapon", label: "Arme" },
  { value: "artefact", label: "Artefact" },
  { value: "tool", label: "Outil" },
  { value: "accessory", label: "Accessoire" },
  { value: "vehicle", label: "Véhicule" },
  { value: "other", label: "Autre" },
];

const NARRATIVE_WEIGHTS: Array<{ value: WorldProp["narrativeWeight"]; label: string }> = [
  { value: "key", label: "Pivot" },
  { value: "recurring", label: "Récurrent" },
  { value: "one_shot", label: "Ponctuel" },
];

export default function WorldPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [npcGroups, setNpcGroups] = useState<NpcGroup[]>([]);
  const [worldProps, setWorldProps] = useState<WorldProp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [gRes, pRes] = await Promise.all([
          fetch(`/api/projects/${projectId}/world/npc-groups`),
          fetch(`/api/projects/${projectId}/world/props`),
        ]);
        if (!gRes.ok || !pRes.ok) throw new Error("Échec du chargement.");
        const gData = (await gRes.json()) as { npcGroups: NpcGroup[] };
        const pData = (await pRes.json()) as { worldProps: WorldProp[] };
        if (!cancelled) {
          setNpcGroups(gData.npcGroups);
          setWorldProps(pData.worldProps);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur de chargement");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-5xl space-y-8 py-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Globe2 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Monde vivant</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Tous les groupes de PNJ et accessoires détectés automatiquement par l&apos;IA
          depuis l&apos;intention de chaque chapitre. Édite-les pour les figer&nbsp;: une fois
          marqués <Badge variant="outline">édité</Badge>, le pipeline IA ne les écrasera
          jamais (USER-WINS).
        </p>
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : null}
      </header>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Groupes de PNJ</h2>
          <Badge variant="secondary">{npcGroups.length}</Badge>
        </div>
        {npcGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun groupe pour l&apos;instant. Lance une analyse d&apos;intention sur un chapitre
            pour qu&apos;ils apparaissent.
          </p>
        ) : (
          <div className="grid gap-4">
            {npcGroups.map((g) => (
              <NpcGroupCard
                key={g.id}
                group={g}
                projectId={projectId}
                onUpdated={(updated) =>
                  setNpcGroups((cur) => cur.map((x) => (x.id === updated.id ? updated : x)))
                }
                onDeleted={(id) => setNpcGroups((cur) => cur.filter((x) => x.id !== id))}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Accessoires &amp; artefacts</h2>
          <Badge variant="secondary">{worldProps.length}</Badge>
        </div>
        {worldProps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun accessoire pour l&apos;instant. L&apos;IA les extraira de tes intentions de
            chapitre.
          </p>
        ) : (
          <div className="grid gap-4">
            {worldProps.map((p) => (
              <WorldPropCard
                key={p.id}
                prop={p}
                projectId={projectId}
                onUpdated={(updated) =>
                  setWorldProps((cur) => cur.map((x) => (x.id === updated.id ? updated : x)))
                }
                onDeleted={(id) => setWorldProps((cur) => cur.filter((x) => x.id !== id))}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function NpcGroupCard({
  group,
  projectId,
  onUpdated,
  onDeleted,
}: {
  group: NpcGroup;
  projectId: string;
  onUpdated: (g: NpcGroup) => void;
  onDeleted: (id: string) => void;
}) {
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

function WorldPropCard({
  prop,
  projectId,
  onUpdated,
  onDeleted,
}: {
  prop: WorldProp;
  projectId: string;
  onUpdated: (p: WorldProp) => void;
  onDeleted: (id: string) => void;
}) {
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
