"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@manga-ai-studio/ui";

interface CharacterPreviewCardProps {
  name: string;
  roleType?: string | null;
  age?: number | null;
  adultVerified?: boolean;
  appearance?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  outfitDefault?: string | null;
  bodyState?: Record<string, unknown>;
  imageUrl?: string | null;
  /** Affiche un voile de chargement (ex. génération visuel). */
  isGenerating?: boolean;
  /** Callback pour relancer la génération depuis la carte */
  onRegenerate?: () => void;
  className?: string;
}

/**
 * Génère 1 ou 2 initiales depuis un nom, à utiliser comme fallback
 * visuel quand l'image n'est pas disponible (URL expirée, jamais générée…).
 * Préférable à un emoji 👤 car immédiatement reconnaissable côté utilisateur.
 */
function initialsFromName(name: string): string {
  const cleaned = name.trim();
  if (cleaned.length === 0) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return cleaned.slice(0, 2).toUpperCase();
}

/**
 * Couleur d'arrière-plan déterministe à partir du nom — évite la grisaille
 * de l'ancien fallback emoji et donne déjà une "carte d'identité" reconnaissable.
 */
function colorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 22%)`;
}

export function CharacterPreviewCard({
  name,
  roleType,
  age,
  adultVerified,
  appearance,
  hairColor,
  eyeColor,
  outfitDefault,
  bodyState,
  imageUrl,
  isGenerating = false,
  onRegenerate,
  className,
}: CharacterPreviewCardProps) {
  // FIX vignette : on garde l'URL en state local pour pouvoir y ajouter
  // un cache-bust en cas d'erreur transitoire (URL signée expirée Supabase,
  // 503 CDN FAL…). Avant ce fix, l'image restait définitivement cassée
  // jusqu'au prochain rechargement complet de la page.
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(imageUrl ?? null);
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const retriedRef = useRef(false);

  useEffect(() => {
    setResolvedUrl(imageUrl ?? null);
    setImageReady(false);
    setImageFailed(false);
    retriedRef.current = false;
  }, [imageUrl]);

  const handleError = () => {
    if (!retriedRef.current && resolvedUrl) {
      retriedRef.current = true;
      const sep = resolvedUrl.includes("?") ? "&" : "?";
      setResolvedUrl(`${resolvedUrl}${sep}_t=${Date.now()}`);
      setImageReady(false);
      return;
    }
    setImageFailed(true);
    setImageReady(true);
  };

  const initials = useMemo(() => initialsFromName(name), [name]);
  const placeholderBg = useMemo(() => colorFromName(name), [name]);

  const bs = bodyState ?? {};
  const missingParts: string[] = [];
  if (bs.leftArmPresent === false) missingParts.push("Bras gauche manquant");
  if (bs.rightArmPresent === false) missingParts.push("Bras droit manquant");
  if (bs.leftEyePresent === false) missingParts.push("Œil gauche manquant");
  if (bs.rightEyePresent === false) missingParts.push("Œil droit manquant");
  const scars = (bs.scarsCurrent as string[] | undefined) ?? [];
  const prosthetics = (bs.prosthetics as string[] | undefined) ?? [];

  const showPlaceholder = !resolvedUrl || imageFailed;

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/50 bg-gradient-to-b from-card via-card/95 to-muted/20 p-4 shadow-lg shadow-black/20",
        className,
      )}
    >
      <div className="relative mx-auto w-full max-w-[220px]">
        <div
          className={cn(
            "relative aspect-[3/4] w-full overflow-hidden rounded-xl",
            "ring-2 ring-border/40 ring-offset-2 ring-offset-background",
          )}
          style={showPlaceholder ? { backgroundColor: placeholderBg } : undefined}
        >
          {resolvedUrl && !imageFailed ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolvedUrl}
                alt={name}
                className={cn(
                  "absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-500 ease-out",
                  imageReady ? "opacity-100" : "opacity-0",
                )}
                onLoad={() => {
                  setImageFailed(false);
                  setImageReady(true);
                }}
                onError={handleError}
              />
              {!imageReady ? (
                <div className="absolute inset-0 animate-pulse bg-gradient-to-t from-muted/60 to-transparent" aria-hidden />
              ) : null}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
              <span
                className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-2xl font-bold tracking-wide text-white shadow-inner"
                aria-hidden
              >
                {initials}
              </span>
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-white/80">
                  {imageFailed ? "Visuel indisponible" : "Aperçu visuel"}
                </p>
                {imageFailed ? (
                  <p className="text-[10px] text-white/60">
                    L&apos;URL temporaire a expiré ou le CDN a refusé l&apos;image.
                  </p>
                ) : (
                  <p className="text-[10px] text-white/60">
                    Génère un visuel pour voir le portrait.
                  </p>
                )}
              </div>
              {onRegenerate ? (
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-white/25 transition-colors"
                >
                  {imageFailed ? <RefreshCw className="h-3 w-3" /> : <ImageOff className="h-3 w-3" />}
                  {imageFailed ? "Regénérer" : "Générer le visuel"}
                </button>
              ) : null}
            </div>
          )}

          {(isGenerating || (resolvedUrl && !imageReady && !imageFailed)) ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/55 backdrop-blur-[2px]">
              <Loader2 className="h-8 w-8 animate-spin text-primary/90" aria-hidden />
              <span className="sr-only">Chargement du visuel</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <h3 className="text-center text-lg font-semibold leading-tight tracking-tight sm:text-left">{name}</h3>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
            {roleType && (
              <Badge variant="outline" className="text-xs">
                {roleType}
              </Badge>
            )}
            {age !== undefined && age !== null ? (
              <Badge variant="outline" className="text-xs">
                {age} ans
              </Badge>
            ) : null}
            {adultVerified ? (
              <Badge className="border-rose-700/40 bg-rose-900/40 text-xs text-rose-300">18+</Badge>
            ) : null}
          </div>
        </div>

        {(appearance || hairColor || eyeColor) && (
          <div className="space-y-1 border-t border-border/40 pt-3">
            {appearance ? <p className="line-clamp-3 text-sm text-muted-foreground">{appearance}</p> : null}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {hairColor ? <span>Cheveux : {hairColor}</span> : null}
              {eyeColor ? <span>Yeux : {eyeColor}</span> : null}
            </div>
          </div>
        )}

        {outfitDefault ? (
          <p className="line-clamp-2 border-t border-border/40 pt-3 text-xs text-muted-foreground/80">
            <span className="font-medium text-muted-foreground">Tenue · </span>
            {outfitDefault}
          </p>
        ) : null}

        {(missingParts.length > 0 || scars.length > 0 || prosthetics.length > 0) && (
          <div className="space-y-1 border-t border-border/40 pt-3">
            {missingParts.map((p) => (
              <Badge key={p} variant="outline" className="mr-1 border-red-700/40 text-xs text-red-400">
                {p}
              </Badge>
            ))}
            {scars.map((s) => (
              <Badge key={s} variant="outline" className="mr-1 border-amber-700/40 text-xs text-amber-400">
                Cicatrice: {s}
              </Badge>
            ))}
            {prosthetics.map((p) => (
              <Badge key={p} variant="outline" className="mr-1 border-cyan-700/40 text-xs text-cyan-400">
                Prothèse: {p}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
