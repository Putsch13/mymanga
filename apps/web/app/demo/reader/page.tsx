"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight, FileText, ImageIcon } from "lucide-react";
import { demoReaderPages } from "@/lib/demo-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DemoReaderPage() {
  const [index, setIndex] = useState(0);
  const [textOnly, setTextOnly] = useState(false);
  const page = demoReaderPages[index];

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <Link href="/demo/project" className="text-sm text-muted-foreground hover:text-foreground">
            ← Projet démo
          </Link>
          <h1 className="mt-2 text-3xl font-semibold">Lecteur manga de démo</h1>
          <p className="mt-2 text-sm text-muted-foreground">Version publique pour tester l&apos;intention UX pendant que la prod réelle est encore branchée.</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/60 bg-card/50 px-4 py-3">
          <div className="text-sm text-muted-foreground">
            Page {index + 1} / {demoReaderPages.length}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={textOnly ? "default" : "outline"} size="sm" onClick={() => setTextOnly((value) => !value)}>
              {textOnly ? <FileText className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
              {textOnly ? "Texte seul" : "Cases + texte"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0}>
              <ChevronLeft className="h-4 w-4" />
              Retour
            </Button>
            <Button type="button" size="sm" onClick={() => setIndex((value) => Math.min(demoReaderPages.length - 1, value + 1))} disabled={index === demoReaderPages.length - 1}>
              Tourner la page
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="relative mx-auto max-w-5xl">
          <div className="overflow-hidden rounded-lg border-2 border-stone-700/50 bg-gradient-to-br from-stone-900 via-stone-950 to-black p-3 shadow-2xl shadow-black/50 md:p-5">
            <div className="grid min-h-[min(70vh,560px)] grid-cols-1 gap-3 md:grid-cols-2 md:gap-0">
              {[page, demoReaderPages[Math.min(index + 1, demoReaderPages.length - 1)]].map((item, slotIndex) => (
                <div key={`${item.id}-${slotIndex}`} className="relative flex flex-col border border-stone-600/50 bg-[#f4efe4] text-stone-900">
                  <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
                    {!textOnly ? (
                      <div className="relative flex-1 overflow-hidden rounded-md border border-stone-300 bg-stone-200/50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.imageUrl} alt="" className="h-full max-h-[420px] w-full object-contain" />
                      </div>
                    ) : null}
                    <div className="rounded-lg border-2 border-stone-800 bg-white px-3 py-2 text-sm shadow-md">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{item.caption}</p>
                      <p className="whitespace-pre-wrap font-serif">{item.text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle>Pourquoi cette démo existe</CardTitle>
            <CardDescription>Tu peux valider l&apos;intention visuelle et la narration même si le runtime de prod n&apos;est pas encore stabilisé.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Quand la DB et les variables de prod seront bien branchées, cette expérience sera remplacée par les vraies données générées depuis ton studio.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
