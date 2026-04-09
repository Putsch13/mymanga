## Outline Structured Beats

- Added structured beat payloads at outline stage with `arcPromises`, `worldConsequences`, and `setupPayoffHooks`.
- Normalized OpenAI outline outputs so sparse payloads are auto-completed by a bounded heuristic fallback.
- Propagated structured beats into the chapter pipeline memory state and down to dialogue generation.
- Updated the dialogue writer prompt so dialogue and continuity deltas must align with the upstream beat structure.
- Added regression coverage for fallback outlines to guarantee structured beats remain available without OpenAI.
