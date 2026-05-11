#!/bin/bash
# download-fonts.sh
#
# Télécharge les polices gratuites depuis Google Fonts.
# À lancer une fois après le clone du repo.
#
# Usage: bash scripts/download-fonts.sh

set -euo pipefail

FONTS_DIR="packages/exports/fonts"
mkdir -p "$FONTS_DIR"

echo "📦 Téléchargement des polices Google Fonts..."

# Bangers (SFX)
if [ ! -f "$FONTS_DIR/Bangers-Regular.ttf" ]; then
  echo "   → Bangers (SFX)..."
  curl -sL "https://github.com/google/fonts/raw/main/ofl/bangers/Bangers-Regular.ttf" \
    -o "$FONTS_DIR/Bangers-Regular.ttf"
fi

# Noto Sans JP (fallback japonais)
if [ ! -f "$FONTS_DIR/NotoSansJP-Bold.ttf" ]; then
  echo "   → Noto Sans JP Bold..."
  curl -sL "https://github.com/google/fonts/raw/main/ofl/notosansjp/NotoSansJP-Bold.ttf" \
    -o "$FONTS_DIR/NotoSansJP-Bold.ttf"
fi

if [ ! -f "$FONTS_DIR/NotoSansJP-Black.ttf" ]; then
  echo "   → Noto Sans JP Black..."
  curl -sL "https://github.com/google/fonts/raw/main/ofl/notosansjp/NotoSansJP-Black.ttf" \
    -o "$FONTS_DIR/NotoSansJP-Black.ttf"
fi

# Comic Neue (fallback dialogue, similaire à Comic Sans mais meilleur)
if [ ! -f "$FONTS_DIR/ComicNeue-Bold.ttf" ]; then
  echo "   → Comic Neue Bold..."
  curl -sL "https://github.com/google/fonts/raw/main/ofl/comicneue/ComicNeue-Bold.ttf" \
    -o "$FONTS_DIR/ComicNeue-Bold.ttf"
fi

if [ ! -f "$FONTS_DIR/ComicNeue-BoldItalic.ttf" ]; then
  echo "   → Comic Neue Bold Italic..."
  curl -sL "https://github.com/google/fonts/raw/main/ofl/comicneue/ComicNeue-BoldItalic.ttf" \
    -o "$FONTS_DIR/ComicNeue-BoldItalic.ttf"
fi

echo ""
echo "✅ Polices Google Fonts téléchargées dans $FONTS_DIR"
echo ""
echo "📝 Pour un rendu manga professionnel, téléchargez manuellement :"
echo "   - Anime Ace 2.0 BB depuis https://www.blambot.com/fonts/anime-ace-2-0-bb/"
echo "   - Placez Anime-Ace-2.0-BB.ttf dans $FONTS_DIR"
echo ""

ls -la "$FONTS_DIR"/*.ttf "$FONTS_DIR"/*.otf 2>/dev/null || echo "(aucune police .ttf/.otf trouvée)"
