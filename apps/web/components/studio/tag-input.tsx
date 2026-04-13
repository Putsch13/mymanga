"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";

type TagInputProps = {
  label?: string;
  placeholder?: string;
  values: string[];
  onChange: (values: string[]) => void;
  allowDuplicates?: boolean;
  normalize?: (value: string) => string;
  dataStudioField?: string;
};

export function TagInput({
  label,
  placeholder = "Appuie sur Entrée pour ajouter",
  values,
  onChange,
  allowDuplicates = false,
  normalize,
  dataStudioField,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag(raw: string) {
    const trimmed = normalize ? normalize(raw.trim()) : raw.trim();
    if (!trimmed) return;
    if (!allowDuplicates && values.includes(trimmed)) return;
    onChange([...values, trimmed]);
    setInputValue("");
  }

  function removeTag(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ";") {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Backspace" && !inputValue && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (text.includes("\n") || text.includes(";")) {
      e.preventDefault();
      const parts = text.split(/[\n;]/).map((s) => s.trim()).filter(Boolean);
      const newValues = [...values];
      for (const part of parts) {
        const normalized = normalize ? normalize(part) : part;
        if (normalized && (allowDuplicates || !newValues.includes(normalized))) {
          newValues.push(normalized);
        }
      }
      onChange(newValues);
    }
  }

  return (
    <div className="space-y-1.5" data-studio-field={dataStudioField}>
      {label && (
        <p className="text-sm font-medium leading-none">{label}</p>
      )}
      <div
        className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-ring cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(index); }}
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Supprimer ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => { if (inputValue.trim()) addTag(inputValue); }}
          placeholder={values.length === 0 ? placeholder : ""}
          className="flex-1 min-w-24 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Entrée ou <kbd className="rounded border px-1 py-0.5 text-xs">;</kbd> pour ajouter · Coller plusieurs lignes fonctionne aussi
      </p>
    </div>
  );
}
