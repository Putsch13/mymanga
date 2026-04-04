"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
  className?: string;
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
  className,
}: CharacterPreviewCardProps) {
  const [imageReady, setImageReady] = useState(false);

  useEffect(() => {
    setImageReady(false);
  }, [imageUrl]);

  const bs = bodyState ?? {};
  const missingParts: string[] = [];
  if (bs.leftArmPresent === false) missingParts.push("Bras gauche manquant");
  if (bs.rightArmPresent === false) missingParts.push("Bras droit manquant");
  if (bs.leftEyePresent === false) missingParts.push("Œil gauche manquant");
  if (bs.rightEyePresent === false) missingParts.push("Œil droit manquant");
  const scars = (bs.scarsCurrent as string[] | undefined) ?? [];
  const prosthetics = (bs.prosthetics as string[] | undefined) ?? [];

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
            "bg-gradient-to-br from-muted/80 via-muted/40 to-background",
          )}
        >
          {imageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={name}
                className={cn(
                  "absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-500 ease-out",
                  imageReady ? "opacity-100" : "opacity-0",
                )}
                onLoad={() => setImageReady(true)}
              />
              {!imageReady ? (
                <div className="absolute inset-0 animate-pulse bg-gradient-to-t from-muted/60 to-transparent" aria-hidden />
              ) : null}
            </>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
              <span className="text-4xl opacity-30" aria-hidden>
                👤
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                Aperçu visuel
              </span>
              <span className="text-xs text-muted-foreground/60">Génère un visuel pour voir le portrait ici</span>
            </div>
          )}

          {(isGenerating || (imageUrl && !imageReady)) ? (
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
