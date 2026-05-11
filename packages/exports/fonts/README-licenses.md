# Polices manga — Licences

Ce dossier contient les polices utilisées pour le rendu des pages manga.

## Polices requises

| Police | Usage | Source | Licence |
|--------|-------|--------|---------|
| **Anime Ace 2.0 BB** | Dialogue principal | [Blambot](https://www.blambot.com/fonts/anime-ace-2-0-bb/) | Gratuit (commercial OK avec attribution) |
| **Bangers** | Onomatopées / SFX | [Google Fonts](https://fonts.google.com/specimen/Bangers) | OFL (Open Font License) |
| **Noto Sans JP** | Texte japonais / fallback | [Google Fonts](https://fonts.google.com/noto/specimen/Noto+Sans+JP) | OFL |

## Installation des polices

```bash
# Depuis la racine du monorepo
pnpm run fonts:download
```

Ce script télécharge automatiquement les polices gratuites depuis Google Fonts.

Pour **Anime Ace 2.0 BB**, téléchargez manuellement depuis Blambot et placez dans ce dossier :
- `Anime-Ace-2.0-BB.ttf`
- `Anime-Ace-2.0-BB-Italic.ttf` (optionnel, pour whisper)

## Polices premium (optionnel)

Pour un rendu encore plus professionnel, vous pouvez acheter :

| Police | Usage | Prix | Source |
|--------|-------|------|--------|
| CC Wild Words | Dialogue pro | ~$100 | [Comicraft](https://www.comicbookfonts.com/) |
| CC Wild Words Italic | Whisper/pensée | inclus | idem |

Si présentes, elles seront utilisées en priorité sur Anime Ace.

## Structure attendue

```
fonts/
├── Anime-Ace-2.0-BB.ttf          # Dialogue (obligatoire)
├── Anime-Ace-2.0-BB-Italic.ttf   # Whisper (optionnel)
├── Bangers-Regular.ttf           # SFX (auto-téléchargé)
├── NotoSansJP-Bold.ttf           # Japonais (auto-téléchargé)
├── CC-Wild-Words.otf             # Premium dialogue (optionnel)
├── CC-Wild-Words-Italic.otf      # Premium whisper (optionnel)
└── README-licenses.md            # Ce fichier
```

## Attribution

Si vous utilisez les polices Blambot gratuites dans un projet commercial publié,
incluez l'attribution suivante dans vos crédits :

> Fonts by Blambot Comic Fonts (www.blambot.com)
