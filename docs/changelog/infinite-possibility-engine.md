# Changelog — Infinite Possibility Engine

## Package `@manga-ai-studio/world`

- ajout de `SceneBlueprint`
- ajout des ontologies PNJ / lieux / créatures
- ajout du `constraint-graph`
- ajout des validateurs par propriété
- ajout des suites `fixed_regression_suite` et `procedural_stress_suite`
- ajout d’un test métamorphique seedé

## Intégration pipeline

- `run-full-chapter-pipeline.ts` construit maintenant un `SceneBlueprint` avant le prompt final panel
- le blueprint enrichit `mustShow`, `backgroundExtras`, contraintes et pont de prompt
- `composeMangaPanelPrompt` consomme le blueprint pour structurer davantage le prompt final
- la metadata panel embarque le blueprint pour debug et QA

## QA

- tests `world` : blueprint, propriétés, stress seedé, métamorphique
- test `ai` : injection effective du blueprint dans le prompt
- build web validée après intégration
