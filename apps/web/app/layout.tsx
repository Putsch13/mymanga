import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: "Manga AI Studio",
    template: "%s | Manga AI Studio",
  },
  description:
    "Plateforme SaaS de creation manga et webtoon avec bible d'univers, personnages, memoire narrative, pipeline chapitre, generation d'images et lecteur premium.",
  keywords: [
    "manga ai",
    "webtoon ai",
    "creation manga",
    "storyboard ai",
    "personnages manga",
    "studio ia manga",
  ],
  openGraph: {
    title: "Manga AI Studio",
    description:
      "Concois un univers manga complet, cree des personnages, genere des chapitres et illustre-les avec une vraie memoire de continuite.",
    url: "/",
    siteName: "Manga AI Studio",
    locale: "fr_FR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Manga AI Studio",
    description:
      "Le studio IA premium pour creer, illustrer et faire evoluer une serie manga coherente chapitre apres chapitre.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}>{children}</body>
    </html>
  );
}
