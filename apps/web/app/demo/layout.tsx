import Link from "next/link";
import { BookMarked, BookOpenText, Sparkles, Wand2 } from "lucide-react";

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b10] via-[#0e0e16] to-[#0b0b10]">
      <header className="sticky top-0 z-50 border-b border-border/80 bg-[#0b0b10]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
          <Link href="/demo" className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-rose-700 shadow-lg shadow-violet-900/40">
              <Sparkles className="h-4 w-4 text-white" />
            </span>
            <span className="hidden sm:inline">Manga AI Studio</span>
            <span className="ml-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">DEMO</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link href="/demo/mangas" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-card/50 hover:text-foreground">
              <BookMarked className="h-4 w-4 opacity-70" />
              Mes mangas
            </Link>
            <Link href="/demo/lab" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-card/50 hover:text-foreground">
              <Wand2 className="h-4 w-4 opacity-70" />
              Labo
            </Link>
            <Link href="/demo/project" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-card/50 hover:text-foreground">
              <BookOpenText className="h-4 w-4 opacity-70" />
              Projet
            </Link>
            <Link href="/demo/reader" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-card/50 hover:text-foreground">
              <BookOpenText className="h-4 w-4 opacity-70" />
              Lecteur
            </Link>
            <Link href="/login" className="ml-2 rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground hover:bg-card/50 hover:text-foreground">
              Connexion
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}
