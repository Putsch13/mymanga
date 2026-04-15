# Glossaire des routes

## /projects/[id]/pipeline
Lance un pipeline de génération complet sur le dernier chapitre du projet.
Permet de contrôler les paramètres de créativité globaux (novelty, worldStrictness, etc.).
Anciennement : /projects/[id]/generate

## /projects/[id]/chapters/[chapterId]/generate
Page de suivi en temps réel de la génération d'un chapitre spécifique.
Affiche la progression beat par beat, les images générées, les rerolls disponibles.

## /projects/[id]/chapters/[chapterId]/edit
Studio principal (4 étapes) pour créer et éditer un chapitre.
Point d'entrée par défaut après création d'un projet.

## /projects/[id]/style
Configuration du style visuel : style-pack, famille de rendu, line weight, caméra.

## /projects/[id]/studio
Ancienne route — redirige automatiquement vers le dernier chapitre en cours d'édition.
