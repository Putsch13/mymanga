#!/bin/bash
# rename-todo-to-fix.sh
#
# Renomme tous les commentaires `TODO-N` (résolus) en `FIX-N` pour distinguer
# clairement "résolu, gardé en doc anti-régression" de "à faire".
#
# Cas spécial : `TODO-21` est dans un prompt OpenAI — on le SUPPRIME au lieu
# de le renommer (le LLM n'a pas besoin de cet identifiant).
#
# Usage : depuis la racine du monorepo, `bash scripts/rename-todo-to-fix.sh`

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || exit 1

echo "🔍 Scan initial..."
INITIAL_TODO_COUNT=$(grep -rn "TODO-[0-9]" packages apps/web \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "/node_modules/" \
  | grep -v ".test." \
  | wc -l | tr -d ' ')
echo "   $INITIAL_TODO_COUNT occurrences TODO-N à traiter."

if [ "$INITIAL_TODO_COUNT" -eq 0 ]; then
  echo "✅ Aucun TODO-N à renommer. Sortie."
  exit 0
fi

echo ""
echo "🔧 Étape 1 — Renommage TODO-N → FIX-N dans tout le code source..."

# macOS: sed -i '' / Linux: sed -i (sans suffixe)
SED_INPLACE=(-i)
if [[ "$OSTYPE" == "darwin"* ]]; then
  SED_INPLACE=(-i "")
fi

find packages apps/web -type f \( -name "*.ts" -o -name "*.tsx" \) \
  ! -path "*/node_modules/*" \
  ! -name "*.test.ts" \
  ! -name "*.test.tsx" \
  -print0 \
  | while IFS= read -r -d '' f; do
    if grep -q "TODO-[0-9]" "$f" 2>/dev/null; then
      sed "${SED_INPLACE[@]}" -E 's/\bTODO-([0-9]+)\b/FIX-\1/g' "$f"
    fi
  done

echo "   ✅ TODO-N → FIX-N appliqué."

echo ""
echo "🔧 Étape 2 — Cas spécial : suppression de FIX-21 du prompt LLM..."

PROMPT_FILE="packages/ai/src/_chapter-outline/prompt.ts"
if [ -f "$PROMPT_FILE" ]; then
  # Remplacer "- FIX-21 : " par "- " (rétablissement après le renommage Étape 1)
  sed "${SED_INPLACE[@]}" 's/- FIX-21 : /- /' "$PROMPT_FILE"
  echo "   ✅ Prompt outline nettoyé (token leak supprimé)."
else
  echo "   ⚠️  $PROMPT_FILE introuvable — skip."
fi

echo ""
echo "🔧 Étape 3 — Vérification post-cleanup..."

REMAINING_TODO=$(grep -rn "TODO-[0-9]" packages apps/web \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "/node_modules/" \
  | grep -v ".test." \
  | wc -l | tr -d ' ')

CREATED_FIX=$(grep -rn "FIX-[0-9]" packages apps/web \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "/node_modules/" \
  | grep -v ".test." \
  | wc -l | tr -d ' ')

PROMPT_LEAK=$(grep -c "FIX-[0-9]\|TODO-[0-9]" "$PROMPT_FILE" 2>/dev/null || echo 0)

echo ""
echo "📊 Résultats :"
echo "   TODO-N restants (devrait être ~0)        : $REMAINING_TODO"
echo "   FIX-N créés (anciens TODO résolus)        : $CREATED_FIX"
echo "   Marqueurs FIX/TODO dans le prompt LLM    : $PROMPT_LEAK (devrait être 0)"

if [ "$REMAINING_TODO" -gt 0 ]; then
  echo ""
  echo "⚠️  TODO-N restants détectés (à traiter manuellement si nouveaux items) :"
  grep -rn "TODO-[0-9]" packages apps/web \
    --include="*.ts" --include="*.tsx" 2>/dev/null \
    | grep -v "/node_modules/" \
    | grep -v ".test." \
    | head -10
fi

if [ "$PROMPT_LEAK" -gt 0 ]; then
  echo ""
  echo "❌ Le prompt LLM contient encore des marqueurs FIX/TODO !"
  grep -n "FIX-\|TODO-" "$PROMPT_FILE"
  exit 1
fi

echo ""
echo "✅ Cleanup terminé avec succès."
echo ""
echo "📝 Prochaines étapes recommandées :"
echo "   1. Vérifier visuellement : git diff --stat"
echo "   2. Lancer les tests :     pnpm test"
echo "   3. Commit dédié :          git add -p && git commit -m 'chore: rename resolved TODO-N to FIX-N anchors'"
echo ""
echo "💡 Pour annuler tous les changements :"
echo "   git checkout -- packages apps/web"
