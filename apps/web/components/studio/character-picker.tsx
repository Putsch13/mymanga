"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@manga-ai-studio/ui";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

  const selectedIds = multiple
    ? Array.isArray(value) ? value : (value ? [value] : [])
    : (typeof value === "string" ? [value] : []);

  const selectedChars = characters.filter((c) => selectedIds.includes(c.id));

  function toggle(id: string) {
    if (multiple) {
      const current = Array.isArray(value) ? value : (value ? [value] : []);
      if (current.includes(id)) {
        onChange(current.filter((v) => v !== id));
      } else {
        onChange([...current, id]);
      }
    } else {
      onChange(value === id ? null : id);
      setOpen(false);
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

  const triggerLabel =
    selectedChars.length === 0
      ? placeholder
      : multiple
        ? `${selectedChars.length} personnage${selectedChars.length > 1 ? "s" : ""} sélectionné${selectedChars.length > 1 ? "s" : ""}`
        : selectedChars[0]?.name;

  return (
    <div className="space-y-1.5" data-studio-field={dataStudioField}>
      <p className="text-sm font-medium leading-none">{label}</p>

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
              {char.roleType ? (
                <span className="text-primary/60">{roleLabel(char.roleType)}</span>
              ) : null}
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

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal text-muted-foreground hover:text-foreground"
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0" align="start">
          <Command>
            <CommandInput placeholder="Rechercher…" />
            <CommandList>
              <CommandEmpty>Aucun personnage trouvé</CommandEmpty>
              <CommandGroup>
                {characters.map((char) => {
                  const isSelected = selectedIds.includes(char.id);
                  return (
                    <CommandItem
                      key={char.id}
                      value={`${char.name} ${char.roleType ?? ""}`}
                      onSelect={() => toggle(char.id)}
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
                        {char.roleType ? (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {roleLabel(char.roleType)}
                          </span>
                        ) : null}
                      </span>
                      <Check className={cn("h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {characters.length === 0 ? (
                <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                  Aucun personnage dans ce projet encore.
                </p>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
