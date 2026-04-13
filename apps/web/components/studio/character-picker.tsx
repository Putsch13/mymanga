"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, ChevronDown, X } from "lucide-react";

type Character = {
  id: string;
  name: string;
  roleType?: string | null;
  imageUrl?: string | null;
};

type CharacterPickerProps = {
  label: string;
  characters: Character[];
  value: string | string[] | null;
  onChange: (value: string | string[] | null) => void;
  multiple?: boolean;
  placeholder?: string;
  dataStudioField?: string;
};

function roleLabel(roleType: string | null | undefined): string {
  if (!roleType) return "";
  const map: Record<string, string> = {
    hero: "Héros",
    protagonist: "Protagoniste",
    antagonist: "Antagoniste",
    villain: "Villain",
    support: "Soutien",
    npc: "PNJ",
    minor: "Secondaire",
  };
  return map[roleType.toLowerCase()] ?? roleType;
}

export function CharacterPicker({
  label,
  characters,
  value,
  onChange,
  multiple = false,
  placeholder = "Sélectionner un personnage…",
  dataStudioField,
}: CharacterPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); setSearch(""); }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const selectedIds = multiple
    ? Array.isArray(value) ? value : (value ? [value] : [])
    : (typeof value === "string" ? [value] : []);

  const selectedChars = characters.filter((c) => selectedIds.includes(c.id));
  const filtered = characters.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.roleType ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  function toggle(id: string) {
    if (multiple) {
      const current = Array.isArray(value) ? value : (value ? [value] : []);
      if (current.includes(id)) {
        onChange(current.filter((v) => v !== id));
      } else {
        onChange([...current, id]);
      }
      // En mode multiple, ferme après chaque sélection pour libérer l'espace
      setOpen(false);
      setSearch("");
    } else {
      onChange(value === id ? null : id);
      setOpen(false);
      setSearch("");
    }
  }

  function removeSelected(id: string) {
    if (multiple) {
      const current = Array.isArray(value) ? value : [];
      onChange(current.filter((v) => v !== id));
    } else {
      onChange(null);
    }
  }

  return (
    <div ref={containerRef} className="space-y-1.5" data-studio-field={dataStudioField}>
      <p className="text-sm font-medium leading-none">{label}</p>

      {/* Badges des personnages sélectionnés */}
      {selectedChars.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedChars.map((char) => (
            <span
              key={char.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 pl-1.5 pr-2 py-0.5 text-xs font-medium text-primary"
            >
              {char.imageUrl ? (
                <Image
                  src={char.imageUrl}
                  alt={char.name}
                  width={16}
                  height={16}
                  className="h-4 w-4 rounded-full object-cover"
                  unoptimized
                />
              ) : (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                  {char.name[0]?.toUpperCase()}
                </span>
              )}
              <span>{char.name}</span>
              {char.roleType && (
                <span className="text-primary/60">{roleLabel(char.roleType)}</span>
              )}
              <button
                type="button"
                onClick={() => removeSelected(char.id)}
                className="text-primary/60 hover:text-primary"
                aria-label={`Retirer ${char.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown trigger */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <span>
            {selectedChars.length === 0
              ? placeholder
              : multiple
                ? `${selectedChars.length} personnage${selectedChars.length > 1 ? "s" : ""} sélectionné${selectedChars.length > 1 ? "s" : ""}`
                : selectedChars[0]?.name}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
            <div className="p-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">Aucun personnage trouvé</p>
              ) : (
                filtered.map((char) => {
                  const isSelected = selectedIds.includes(char.id);
                  return (
                    <button
                      key={char.id}
                      type="button"
                      onClick={() => toggle(char.id)}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-accent ${isSelected ? "bg-accent/50" : ""}`}
                    >
                      {char.imageUrl ? (
                        <Image
                          src={char.imageUrl}
                          alt={char.name}
                          width={24}
                          height={24}
                          className="h-6 w-6 rounded-full object-cover shrink-0"
                          unoptimized
                        />
                      ) : (
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                          {char.name[0]?.toUpperCase()}
                        </span>
                      )}
                      <span className="flex-1">
                        <span className="font-medium">{char.name}</span>
                        {char.roleType && (
                          <span className="ml-1.5 text-xs text-muted-foreground">{roleLabel(char.roleType)}</span>
                        )}
                      </span>
                      {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
            {characters.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground border-t">
                Aucun personnage dans ce projet encore.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
