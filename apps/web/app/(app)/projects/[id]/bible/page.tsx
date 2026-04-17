"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface GlossaryEntry {
  term: string;
  description: string;
  visualCore: string;
  entityKind: string;
}

const ENTITY_KINDS = [
  { value: "named_npc", label: "PNJ nommé" },
  { value: "creature", label: "Créature" },
  { value: "construct", label: "Golem / Construct" },
  { value: "spirit", label: "Esprit / Fantôme" },
  { value: "deity", label: "Divinité" },
  { value: "weapon", label: "Arme / Objet" },
  { value: "location", label: "Lieu" },
  { value: "faction", label: "Faction / Clan" },
  { value: "concept", label: "Concept / Sort" },
];

const EMPTY_ENTRY: GlossaryEntry = { term: "", description: "", visualCore: "", entityKind: "named_npc" };

export default function BiblePage() {
  const params = useParams();
  const id = params.id as string;
  const [summary, setSummary] = useState("");
  const [raw, setRaw] = useState("{}");
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [newEntry, setNewEntry] = useState<GlossaryEntry>({ ...EMPTY_ENTRY });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((j) => {
        const b = j.project?.storyBible;
        if (b) {
          setSummary(b.summary ?? "");
          setRaw(JSON.stringify({ worldRules: b.worldRules, lore: b.lore, themes: b.themes }, null, 2));
          const g = b.glossary;
          if (Array.isArray(g)) setGlossary(g as GlossaryEntry[]);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      setSaveMsg("JSON invalide dans le champ structuré.");
      setSaving(false);
      return;
    }
    const res = await fetch(`/api/projects/${id}/bible`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary,
        worldRules: (parsed.worldRules as object) ?? {},
        themes: (parsed.themes as unknown[]) ?? [],
        lore: (parsed.lore as object) ?? {},
        glossary,
      }),
    });
    setSaving(false);
    setSaveMsg(res.ok ? "Sauvegardé ✓" : "Erreur lors de la sauvegarde.");
    setTimeout(() => setSaveMsg(null), 3000);
  }

  function addEntry() {
    if (!newEntry.term.trim()) return;
    setGlossary((prev) => [...prev, { ...newEntry }]);
    setNewEntry({ ...EMPTY_ENTRY });
  }

  function removeEntry(idx: number) {
    setGlossary((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateEntry(idx: number, field: keyof GlossaryEntry, value: string) {
    setGlossary((prev) => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  }

  if (loading) return <p className="text-muted-foreground text-sm">Chargement…</p>;

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/projects/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Projet
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Bible d&apos;univers</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          La bible alimente la mémoire de continuité, la génération de chapitres et les futurs retrievers RAG. Pense-la comme le c&oelig;ur canonique de ta série.
        </p>
      </div>

      {/* Résumé & JSON structuré */}
      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle>Résumé & JSON structuré</CardTitle>
          <CardDescription>worldRules, lore, themes — aligné mémoire / RAG.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Résumé</Label>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} />
          </div>
          <div className="space-y-2">
            <Label>JSON (worldRules, lore, themes)</Label>
            <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} className="font-mono text-xs" rows={16} />
          </div>
        </CardContent>
      </Card>

      {/* Glossaire & entités spéciales */}
      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle>Glossaire & entités spéciales</CardTitle>
          <CardDescription>
            Définis les termes de ton univers (noms d&apos;armes, races, lieux, sorts). L&apos;EntityBrain les reconnaîtra sans appel LLM.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Entries list */}
          {glossary.length === 0 && (
            <p className="text-sm text-muted-foreground italic">Aucune entrée. Ajoute ton premier terme ci-dessous.</p>
          )}
          {glossary.map((entry, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_2fr_2fr_auto_auto] gap-2 items-start rounded-md border border-border/40 p-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Terme</Label>
                <Input
                  value={entry.term}
                  onChange={(e) => updateEntry(idx, "term", e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Description</Label>
                <Textarea
                  value={entry.description}
                  onChange={(e) => updateEntry(idx, "description", e.target.value)}
                  rows={2}
                  className="text-xs resize-none"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Ancre visuelle</Label>
                <Textarea
                  value={entry.visualCore}
                  onChange={(e) => updateEntry(idx, "visualCore", e.target.value)}
                  rows={2}
                  className="text-xs resize-none"
                  placeholder="ex: large silver serpent, obsidian scales..."
                />
              </div>
              <div className="space-y-1 min-w-[120px]">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select value={entry.entityKind} onValueChange={(v) => updateEntry(idx, "entityKind", v)}>
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTITY_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value} className="text-xs">{k.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="pt-5">
                <Button variant="ghost" size="sm" onClick={() => removeEntry(idx)} className="text-destructive hover:text-destructive">
                  ✕
                </Button>
              </div>
            </div>
          ))}

          {/* New entry form */}
          <div className="grid grid-cols-[1fr_2fr_2fr_auto_auto] gap-2 items-start rounded-md border border-dashed border-border/40 bg-muted/20 p-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Nouveau terme</Label>
              <Input
                value={newEntry.term}
                onChange={(e) => setNewEntry((p) => ({ ...p, term: e.target.value }))}
                placeholder="Kuro-Hebi"
                className="text-sm"
                onKeyDown={(e) => e.key === "Enter" && addEntry()}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea
                value={newEntry.description}
                onChange={(e) => setNewEntry((p) => ({ ...p, description: e.target.value }))}
                rows={2}
                className="text-xs resize-none"
                placeholder="Serpent mystique invoqué par..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Ancre visuelle</Label>
              <Textarea
                value={newEntry.visualCore}
                onChange={(e) => setNewEntry((p) => ({ ...p, visualCore: e.target.value }))}
                rows={2}
                className="text-xs resize-none"
                placeholder="ex: massive black serpent, glowing red eyes..."
              />
            </div>
            <div className="space-y-1 min-w-[120px]">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={newEntry.entityKind} onValueChange={(v) => setNewEntry((p) => ({ ...p, entityKind: v }))}>
                <SelectTrigger className="text-xs h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value} className="text-xs">{k.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="pt-5">
              <Button variant="outline" size="sm" onClick={addEntry} disabled={!newEntry.term.trim()}>
                +
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex items-center gap-4">
        <Button onClick={save} disabled={saving}>
          {saving ? "Sauvegarde…" : "Enregistrer tout"}
        </Button>
        {saveMsg && (
          <span className={`text-sm ${saveMsg.includes("✓") ? "text-green-500" : "text-destructive"}`}>
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  );
}
