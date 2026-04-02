# V4 Ready

Base préparée après la refonte V3 :

## Déjà prêt

- Parcours simplifié : `landing -> login -> dashboard -> lab -> generate -> read`
- Bibliothèque utilisateur : `mangas`
- Labo dédié : `lab`
- Reader manga-first : RTL, double page, repères de lecture, transitions légères
- Observabilité génération : status/provider/model/error/retry
- Multi-provider : `fal`, `runware`, `stability`, `bfl`
- Persistance Storage pour providers non durables

## À brancher / valider pour une vraie V4

1. E2E complet signup -> create -> generate -> read
2. Stripe live et vrais prix crédits
3. Funnel upsell in-app après lecture et après solde faible
4. Galerie de couvertures / miniatures projet
5. Jobs longue durée plus robustes (webhooks, retries, anti-doublons)
6. Stockage image propriétaire systématique, pas seulement BFL/Stability
7. Analytics produit sur les étapes de conversion
8. QA visuelle mobile/tablette du reader

