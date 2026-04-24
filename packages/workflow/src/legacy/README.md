# Legacy workflow (quarantaine)

Ce dossier regroupe les **points d’entrée du pipeline narratif + génération d’images legacy**
(`narrative-pass` + `image-generation-pass`).

## Règles produit

- **Ne pas importer** depuis le flux **premium V3** (plan canonique, render-pass v3, storyboard v3).
- Le legacy n’est exécutable que si `ENABLE_LEGACY_PIPELINE=true` (voir `pipeline-feature-flags.ts`).

## Fichiers

- `run-legacy-compatible-chapter-pipeline.ts` — orchestration legacy appelée par `run-full-chapter-pipeline.ts`.

Les passes elles-mêmes restent sous `../passes/` (volume / imports relatifs).
