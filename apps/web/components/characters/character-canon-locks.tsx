"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, Plus, X } from "lucide-react";

interface ContinuityProfile {
  lockedVisualTraits?: string[];
  lockedBodyTraits?: string[];
  lockedWardrobeTraits?: string[];
  storyCriticalTraits?: string[];
  forbiddenDrift?: string[];
}

interface Props {
  value: ContinuityProfile;
  onChange: (v: ContinuityProfile) => void;
}

function TagList({
  label,
  items,
  onAdd,
  onRemove,
  placeholder,
}: {
  label: string;
  items: string[];
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              onAdd(input.trim());
              setInput("");
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => {
            if (input.trim()) { onAdd(input.trim()); setInput(""); }
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <Badge key={i} variant="outline" className="gap-1 pr-1">
            <Lock className="h-2.5 w-2.5 text-amber-400" />
            {item}
            <button type="button" onClick={() => onRemove(i)} className="ml-0.5 opacity-60 hover:opacity-100">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function CharacterCanonLocks({ value, onChange }: Props) {
  const addTo = (key: keyof ContinuityProfile) => (v: string) =>
    onChange({ ...value, [key]: [...(value[key] ?? []), v] });
  const removeFrom = (key: keyof ContinuityProfile) => (i: number) =>
    onChange({ ...value, [key]: (value[key] ?? []).filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Verrous Canon & Continuité
        </h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Ces traits ne peuvent pas dériver d&apos;un chapitre à l&apos;autre sans événement canonique explicite.
      </p>

      <TagList
        label="Traits visuels verrouillés"
        items={value.lockedVisualTraits ?? []}
        onAdd={addTo("lockedVisualTraits")}
        onRemove={removeFrom("lockedVisualTraits")}
        placeholder="Cicatrice œil droit, cheveux blancs..."
      />
      <TagList
        label="Traits corporels verrouillés"
        items={value.lockedBodyTraits ?? []}
        onAdd={addTo("lockedBodyTraits")}
        onRemove={removeFrom("lockedBodyTraits")}
        placeholder="Bras gauche manquant, jambe prothétique..."
      />
      <TagList
        label="Tenues verrouillées"
        items={value.lockedWardrobeTraits ?? []}
        onAdd={addTo("lockedWardrobeTraits")}
        onRemove={removeFrom("lockedWardrobeTraits")}
        placeholder="Manteau noir signature, bandeau rouge..."
      />
      <TagList
        label="Traits critiques pour l&apos;histoire"
        items={value.storyCriticalTraits ?? []}
        onAdd={addTo("storyCriticalTraits")}
        onRemove={removeFrom("storyCriticalTraits")}
        placeholder="Marque du démon, tatouage de clan..."
      />
      <TagList
        label="Dérives interdites"
        items={value.forbiddenDrift ?? []}
        onAdd={addTo("forbiddenDrift")}
        onRemove={removeFrom("forbiddenDrift")}
        placeholder="Ne jamais sourire, ne jamais pleurer en public..."
      />
    </div>
  );
}
