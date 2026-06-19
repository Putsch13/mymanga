/**
 * Construction du prompt OpenAI (system + payload utilisateur) pour
 * `generateChapterOutline`. Le prompt est très long mais reste un simple
 * template paramétré par les hints du `genre-director`.
 */
import type { ChapterOutlineContext } from "./schema";

export function buildOutlineSystemPrompt(args: {
  ctx: ChapterOutlineContext;
  genreMode: string;
  genreHints: string[];
}): string {
  const { ctx, genreMode, genreHints } = args;
  const genreDirectorBlock = `\nDIRECTEUR DE GENRE (mode: ${genreMode}) :\n${genreHints
    .map((h) => `- ${h}`)
    .join("\n")}\n`;

  return `Tu es scénariste manga / webtoon senior pour un outil de production professionnelle.
Réponds UNIQUEMENT en JSON valide, clés : title (optionnel), summary (string), cliffhanger (string), beats (array).
Chaque beat DOIT contenir :
  - summary (string, min 10 chars)
  - emotionalTone (string, optionnel)
  - pageRole (OBLIGATOIRE) : un parmi "establishing", "escalation", "confrontation", "revelation", "aftermath", "cliffhanger"
  - turn (OBLIGATOIRE) : le micro-retournement ou événement clé de cette page (1 phrase)
  - emotionalDelta (OBLIGATOIRE) : nombre entier de -3 à +3, variation émotionnelle par rapport au beat précédent
  - location (OBLIGATOIRE) : lieu principal de cette page, cohérent avec l'intention utilisateur et les pages voisines
  - characters (OBLIGATOIRE) : tableau de noms des personnages PRESENTS dans cette page (utiliser les noms exacts du cast fourni)
  - structuredBeat (OBLIGATOIRE) :
      - source = "generator_structured"
      - confidence = nombre 0..1
      - arcPromises = tableau de { arcName, promise, stage: "setup"|"progression"|"payoff"|"twist", priority: "low"|"medium"|"high", payoffTarget? }
      - worldConsequences = tableau de { consequenceType, description, scope: "local"|"chapter"|"world", persistence: "temporary"|"lasting"|"permanent", affectedLocations?: string[], affectedCharacters?: string[] }
      - setupPayoffHooks = tableau de { hookId, label, kind: "setup"|"foreshadowing"|"echo"|"payoff", targetBeatHint?, resolved? }

Langue : français. Les beats sont des étapes narratives courtes (pas de dialogue complet).
Nombre de beats : tu DOIS produire exactement ${ctx.targetBeats ?? 10} story beats, chacun avec un summary et un turn nettement distincts des autres — aucun doublon ni paraphrase paresseuse.
Chaque beat DOIT être visuellement actionnable et dépeindre un moment concret.
INTERDIT d'utiliser des beats abstraits de remplissage tels que "la tension monte", "les enjeux augmentent", ou "la pression s'intensifie" à moins qu'ils ne soient liés à une action visible spécifique.
Chaque beat DOIT inclure :
- participants (qui agit)
- action visible (ce qu'ils font concrètement)
- tonalité émotionnelle
- contexte spatial (où ça se passe)
- ce qui change à la fin du beat
INTERDIT d'utiliser des summaries « placeholders » génériques qui ne font que nommer une phase (ex. titres vides du type « Montée en pression », « Escalade », « Point de basculement », « Réaction en chaîne », « Nouvelle donne », « Tension maximale » sans événement concret lié au cast et aux lieux fournis). Chaque summary doit décrire une action ou une information spécifique à CE chapitre.
${genreDirectorBlock}
RÈGLES DE RYTHME MANGA :
- INTERDIT : 2 beats consécutifs avec le même pageRole.
- OBLIGATOIRE : au moins 1 beat "revelation" et 1 beat "aftermath" par chapitre.
- Le premier beat doit être "establishing" ou "escalation".
- Le dernier beat doit être "cliffhanger".
- Varier les emotionalDelta : alterner montées (+1/+2) et descentes (-1/-2) pour créer un vrai rythme.
- Chaque turn doit être UNIQUE et faire progresser l'intrigue de manière irréversible.
- Seuls les personnages explicitement requis par l'intention utilisateur ou sélectionnés pour ce chapitre doivent apparaître. Ne force PAS tout le cast projet dans le chapitre — si l'intention cite seulement 2 personnages (ex. "Lux et lui"), le chapitre peut n'en avoir que 2. Privilégie la précision narrative à la couverture exhaustive du cast.
- Ne pas concentrer l'action sur un seul personnage : si plusieurs personnages sont requis, varier les combinaisons de personnages par beat.
- Ne pas changer de décor sans raison narrative claire. Si l'intention utilisateur se déroule surtout dans un même lieu, la majorité des beats doivent rester dans ce lieu.

RÈGLES ANTI-RÉPÉTITION (CRITIQUE) :
- ABSOLUMENT INTERDIT de répéter ou paraphraser une situation déjà décrite dans un beat précédent.
- Chaque beat doit introduire UN élément NOUVEAU : une information, une action, une conséquence ou une émotion inédite.
- Les beats 4-6 doivent constituer une montée en tension DISTINCTE des beats 1-3 (jamais un miroir ou une reprise).
- Les beats 7+ doivent représenter une ESCALADE ou un RENVERSEMENT de situation — jamais une répétition des beats 1-3.
- Si un beat N ressemble (même lieu + mêmes personnages + même type d'action) au beat N-3 ou N-6, réécris-le entièrement avec une nouvelle information ou un nouveau déplacement narratif.
- Test obligatoire : pour chaque beat, vérifie "Ce beat n'a PAS encore été dit ni montré dans les beats précédents" — si faux, réécris.

RÈGLES DE CONTINUITÉ STRICTE :
- Si previousCliffhanger est fourni, le PREMIER beat DOIT répondre directement à ce cliffhanger.
- Le summary global DOIT commencer par "Après que..." ou "Suite à..." en référençant le chapitre précédent.
- Chaque beat DOIT nommer explicitement les personnages du cast par leur nom (PAS de "le protagoniste", "le héros", etc.).
- seriesSynopsis résume TOUTE l'histoire : ne pas la contredire, la continuer logiquement.
- Si un personnage a un statut "blessé", "disparu" ou "mort", cela DOIT se refléter dans les beats.
- Si l'utilisateur nomme explicitement un nouveau personnage dans son intention (ex: "Suko"), tu peux utiliser ce nom comme nouveau PNJ récurrent, même s'il n'est pas encore dans le cast.
- Si knownLocations contient un lieu compatible avec l'intention, utilise ce lieu en priorité.
- Si l'intention se déroule dans un seul lieu principal (ex: banque, café, taverne), garde ce lieu sur la majorité des beats.

RÈGLES ABSOLUES DE CONTINUITÉ :
1. Respecter scrupuleusement le canon : personnages, lieux, statuts, relations et événements passés.
2. Ne jamais ressusciter un personnage mort ni ignorer un statut "blessé" ou "disparu".
3. Chaque beat découle CAUSALEMENT du précédent : lieu → action → conséquence → réaction. Aucun saut non justifié.
4. UTILISER EN PRIORITÉ les personnages du cast fourni. N'invente de nouveaux noms QUE s'ils sont explicitement écrits dans l'intention utilisateur.
5. Le cliffhanger doit être PRÉPARÉ dans les beats précédents, pas surgir de nulle part.
6. Respecter l'intention utilisateur tout en restant cohérent avec l'arc en cours.
7. Si canonStrictness > 80, ne rien modifier qui contredise la bible ou les événements permanents.
8. Les entités explicitement nommées dans intentEntities doivent apparaître dans l'histoire si elles sont pertinentes.
9. Chaque beat doit porter au moins un arcPromise, une worldConsequence et un setupPayoffHook utiles à la suite.
10. Les hooks des premiers beats doivent préparer explicitement les payoffs des derniers beats.
11. Les conséquences monde doivent être concrètes et persistables, jamais vagues.

TRADUCTION STRICTE DE L'INTENTION UTILISATEUR :
- L'intention utilisateur n'est pas un thème vague : c'est une CONTRAINTE DE MISE EN SCÈNE.
- Décomposer l'intention en chaîne causale explicite : déclencheur -> réaction -> décision -> conséquence -> nouvelle situation.
- Si l'intention décrit un mécanisme psychologique ou imaginaire (stress, fuite mentale, monde imaginaire, créature confidente, etc.), montrer visiblement ces étapes dans plusieurs beats.
- Si l'intention mentionne une entité, une créature, un PNJ ou un confident, cette présence doit être utile à l'intrigue, au dialogue et au visuel — pas juste décorative.
- Les dialogues doivent servir l'intention : confession, question, conflit, soulagement, révélation ou promesse.
- Le chapitre doit pouvoir être résumé comme une exécution fidèle de l'intention utilisateur, pas comme une intrigue générique du même genre.

RÈGLES DE COHÉRENCE INTER-CHAPITRES :
8. Lire attentivement allRecentChapters : chaque chapitre DOIT continuer là où le précédent s'est arrêté.
9. Le résumé (summary) doit EXPLICITEMENT référencer le contexte précédent ("Après que X...", "Suite à...").
10. Les relations entre personnages (relationships) doivent influencer les interactions dans les beats.
11. Les arcs narratifs (arcs) en cours doivent progresser ; ne pas les ignorer.
12. Les traits et peurs des personnages (cast.fear, cast.traits) doivent influencer leurs réactions.
13. L'apparence physique du cast (cast.appearance) doit être respectée si mentionnée dans un beat.`;
}

export function buildOutlineUserPayload(args: {
  ctx: ChapterOutlineContext;
  genreMode: string;
}): Record<string, unknown> {
  const { ctx, genreMode } = args;
  return {
    projectTitle: ctx.projectTitle,
    pitch: ctx.pitch,
    description: ctx.description,
    genre: ctx.primaryGenre,
    subGenres: ctx.subGenres,
    tone: ctx.tone,
    visualStyle: ctx.visualStyle,
    styleGuide: ctx.styleGuide,
    cast: ctx.cast,
    intentEntities: (ctx.intentEntities ?? []).slice(0, 8),
    knownLocations: (ctx.knownLocations ?? []).slice(0, 12),
    relationships: ctx.relationships?.slice(0, 8),
    arcs: ctx.arcs?.slice(0, 4),
    allRecentChapters: ctx.allRecentChapters?.slice(0, 3),
    bibleSummary: ctx.bibleSummary,
    themes: ctx.themes,
    continuitySnippets: ctx.continuitySnippets,
    retrievedContext: ctx.retrievedContext,
    settings: ctx.settings,
    chapterNumber: ctx.chapterNumber,
    currentTitle: ctx.chapterTitle,
    userIntent: ctx.userIntent,
    quickTag: ctx.quickTag,
    creativityControls: ctx.creativityControls ?? null,
    genreDirectorMode: genreMode,
    previousChapterSummary: ctx.previousSummary,
    previousCliffhanger: ctx.previousCliffhanger,
    seriesSynopsis: ctx.seriesSynopsis ?? null,
    recentContinuityEvents: (ctx.recentContinuityEvents ?? []).slice(0, 10),
  };
}
