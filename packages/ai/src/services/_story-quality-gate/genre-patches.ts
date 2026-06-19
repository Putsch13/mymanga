/**
 * Suggestions de patches narratifs paramétrées par `GenreDirectorMode`.
 *
 * Chaque dictionnaire mappe un mode genre → une suggestion concrète. Les
 * patches sont, par défaut, des suggestions ; seul le cliffhanger peut être
 * auto-appliqué quand l'existant est trop court (< 20 caractères).
 */
import type { GeneratedChapterBundle } from "../../chapter/shared-types";
import type { ChapterDramaticSpine } from "../story-spine";
import type { GenreDirectorMode } from "../genre-director";
import type { NarrativePatch, StoryQualityIssue } from "./types";

const CLIFFHANGER_BY_GENRE: Record<GenreDirectorMode, string> = {
  shonen_combat:
    "Au moment où la poussière retombe, une silhouette inconnue surgit — et tout le monde reconnaît ce pouvoir.",
  seinen_tension: "La vérité éclate en une phrase. Personne ne bouge. Le silence dit tout.",
  romance_shojo:
    "Leurs regards se croisent une dernière fois — et elle comprend qu'elle a tout mal interprété.",
  thriller_horror: "La porte se referme. Derrière, quelque chose respire.",
  quiet_aftermath:
    "Il reste seul dans la pièce vide. Sur la table, une lettre qu'il n'avait pas vue.",
  isekai_adventure: "Le ciel s'embrase. Une entité colossale pointe vers lui — il est l'Élu.",
  mecha_tactical: "Le cockpit s'illumine en rouge. Défaillance critique. L'ennemi avance.",
  sport_rivalry: "La balle est en l'air. Une technique inconnue. Le public retient son souffle.",
  medical_drama: "Les moniteurs s'affolent. Le patient n'est plus censé être en vie.",
  mystery_detective: "La clé était là depuis le début — dans la première scène.",
  slice_of_life: "Une seule phrase change tout. Elle sourit — mais ses yeux pleurent.",
  supernatural: "L'entité s'arrête. Elle regarde directement vers lui. Elle le voit.",
  historical_epic: "L'armée s'immobilise. Le messager tombe. La trahison est confirmée.",
  dark_fantasy_gore:
    "Le corps s'effondre — mais quelque chose continue de bouger à l'intérieur.",
  josei_adult: "Elle repose le téléphone. Le message non envoyé reste. Le choix est fait.",
  comedy_parody:
    "Le héros se retourne triomphant — et percute le vrai boss final. Fondu au noir.",
};

const MICRO_TURN_BY_GENRE: Record<GenreDirectorMode, string> = {
  shonen_combat: "Mais soudain, l'adversaire sourit — il attendait ça.",
  seinen_tension: "Cependant, quelque chose cloche dans sa réponse.",
  romance_shojo: "Pourtant, au moment de partir, elle s'arrête.",
  thriller_horror: "Sauf que la porte était censée être verrouillée.",
  quiet_aftermath: "Mais il remarque quelque chose qu'il n'avait pas vu avant.",
  isekai_adventure: "Mais ses stats changent — une compétence cachée vient de s'activer.",
  mecha_tactical: "Sauf que le système d'arme cible l'un des leurs.",
  sport_rivalry: "Mais l'adversaire connaît sa technique — il l'a étudiée.",
  medical_drama: "Cependant, l'analyse révèle une seconde pathologie inattendue.",
  mystery_detective: "Pourtant, son alibi s'effondre en un détail.",
  slice_of_life: "Mais le message reçu change tout le sens de la journée.",
  supernatural: "Sauf que le rituel de protection n'a pas fonctionné.",
  historical_epic: "Mais les renforts promis ne viendront pas.",
  dark_fantasy_gore: "Sauf que la créature ne meurt pas — elle se transforme.",
  josei_adult: "Mais ce silence n'est pas de l'indifférence — c'est un choix.",
  comedy_parody: "Sauf que le plan parfait repose sur un malentendu absurde.",
};

const PAYOFF_BY_GENRE: Record<GenreDirectorMode, string> = {
  shonen_combat: "La promesse du début du chapitre est tenue : le héros prouve sa valeur.",
  seinen_tension: "La révélation partielle satisfait sans tout résoudre.",
  romance_shojo: "Un geste discret répond à la tension accumulée.",
  thriller_horror: "La menace se concrétise partiellement — assez pour valider la peur.",
  quiet_aftermath: "Un détail silencieux clôt l'arc émotionnel de la scène.",
  isekai_adventure:
    "La nouvelle capacité du héros est mise à l'épreuve et valide sa progression.",
  mecha_tactical: "La tactique se révèle payante — ou l'erreur de calcul aussi.",
  sport_rivalry: "Le technique risquée fonctionne — ou échoue avec panache.",
  medical_drama: "Le diagnostic sauve le patient — ou la décision difficile est assumée.",
  mystery_detective: "Un indice clé est enfin relié à l'ensemble du puzzle.",
  slice_of_life:
    "Le moment anodin révèle quelque chose de profond sur les personnages.",
  supernatural: "Le pouvoir se maîtrise — ou dérape avec conséquences.",
  historical_epic: "Le sacrifice militaire ou politique porte ses fruits — ou son deuil.",
  dark_fantasy_gore: "La malédiction prend son tribut — le héros survit, mais transformé.",
  josei_adult: "Le non-dit se résout enfin — pas en mots, en actes.",
  comedy_parody: "Le running gag atteint son apogée — et tout le monde comprend la blague.",
};

const BREATHING_BY_GENRE: Record<GenreDirectorMode, string> = {
  shonen_combat:
    "Un panel silencieux après le combat : les personnages reprennent leur souffle.",
  seinen_tension: "Une pause de dialogue sobre avant la prochaine escalade.",
  romance_shojo: "Un moment contemplatif — regard sur un objet symbolique.",
  thriller_horror: "Un instant de faux calme avant la prochaine menace.",
  quiet_aftermath: "Une scène entière de silence et de réflexion.",
  isekai_adventure: "Une pause d'exploration du nouveau monde, sans combat.",
  mecha_tactical: "Cockpit silencieux. Pilote seul face à ses doutes.",
  sport_rivalry: "Vestiaires. Un moment de cohésion d'équipe avant le prochain défi.",
  medical_drama: "Couloir d'hôpital. Café froid. La soignante reprend son souffle.",
  mystery_detective: "Réflexion solitaire : le détective rassemble les pièces mentalement.",
  slice_of_life: "Un repas partagé. Pas de dialogue important — juste la présence.",
  supernatural: "Moment de rituel calme avant l'affrontement.",
  historical_epic: "Bivouac nocturne. Les soldats dorment. Le général veille seul.",
  dark_fantasy_gore:
    "Le héros contemple ses mains ensanglantées. Le silence est assourdissant.",
  josei_adult:
    "Elle s'assoit dans un café vide. Le temps passe sans qu'elle le remarque.",
  comedy_parody:
    "Le héros essaie de dormir mais le running gag le poursuit même dans ses rêves.",
};

const REVEAL_BY_GENRE: Record<GenreDirectorMode, string> = {
  shonen_combat: "Un reveal de capacité cachée ou d'identité adversaire.",
  seinen_tension:
    "Une révélation d'information qui change la lecture des événements.",
  romance_shojo: "Un aveu indirect ou une découverte sur les sentiments de l'autre.",
  thriller_horror: "Une révélation sur la nature de la menace.",
  quiet_aftermath: "Une vérité émotionnelle qui émerge doucement.",
  isekai_adventure:
    "Une loi du nouveau monde révélée qui change les règles du jeu.",
  mecha_tactical: "Un prototype ou une faiblesse de l'ennemi dévoilé.",
  sport_rivalry: "L'origine de la technique secrète de l'adversaire révélée.",
  medical_drama: "Une cause cachée derrière le symptôme apparent.",
  mystery_detective: "Un témoin ignoré détient la pièce manquante.",
  slice_of_life:
    "Un secret du passé d'un personnage ordinaire refait surface.",
  supernatural: "La vraie nature de l'entité ou du phénomène enfin révélée.",
  historical_epic: "La trahison dans les rangs finalement identifiée.",
  dark_fantasy_gore:
    "La véritable origine de la malédiction — elle n'est pas ce qu'on croyait.",
  josei_adult: "Un choix passé revient sous une forme inattendue.",
  comedy_parody:
    "Le personnage le plus anodin se révèle être le vrai cerveau de l'opération.",
};

export interface GenerateNarrativePatchesResult {
  suggestedPatches: NarrativePatch[];
  autoAppliedPatches: NarrativePatch[];
  patchedBundle: GeneratedChapterBundle;
}

export function generateNarrativePatches(
  bundle: GeneratedChapterBundle,
  spine: ChapterDramaticSpine,
  issues: StoryQualityIssue[],
  genreMode: GenreDirectorMode,
): GenerateNarrativePatchesResult {
  const suggested: NarrativePatch[] = [];
  const autoApplied: NarrativePatch[] = [];
  let patchedBundle = bundle;

  const issueCodes = new Set(issues.map((i) => i.code));

  if (
    issueCodes.has("no_cliffhanger_prep") ||
    issueCodes.has("weak_cliffhanger_text")
  ) {
    const suggestedCliffhanger = CLIFFHANGER_BY_GENRE[genreMode];
    if (!bundle.outline.cliffhanger || bundle.outline.cliffhanger.length < 20) {
      patchedBundle = {
        ...patchedBundle,
        outline: { ...patchedBundle.outline, cliffhanger: suggestedCliffhanger },
      };
      autoApplied.push({
        type: "strengthen_cliffhanger",
        description: `Cliffhanger renforcé selon le mode ${genreMode}`,
        appliedValue: suggestedCliffhanger,
        autoApplied: true,
      });
    } else {
      suggested.push({
        type: "strengthen_cliffhanger",
        description: `Cliffhanger faible détecté. Suggestion (${genreMode}) : "${suggestedCliffhanger}"`,
        appliedValue: suggestedCliffhanger,
        autoApplied: false,
      });
    }
  }

  if (issueCodes.has("no_micro_turns")) {
    const scenes = patchedBundle.script?.scenes ?? [];
    const midIndex = Math.floor(scenes.length / 2);
    const targetScene = scenes[midIndex];
    if (targetScene) {
      suggested.push({
        type: "inject_micro_turn",
        targetSceneIndex: midIndex,
        description: `Micro-turn suggéré pour la scène ${midIndex + 1} (${genreMode}) : "${MICRO_TURN_BY_GENRE[genreMode]}"`,
        appliedValue: MICRO_TURN_BY_GENRE[genreMode],
        autoApplied: false,
      });
    }
  }

  if (issueCodes.has("payoff_weakness") || spine.payoffTargets.length === 0) {
    suggested.push({
      type: "add_payoff_hint",
      description: `Payoff faible. Suggestion (${genreMode}) : ${PAYOFF_BY_GENRE[genreMode]}`,
      appliedValue: PAYOFF_BY_GENRE[genreMode],
      autoApplied: false,
    });
  }

  if (issueCodes.has("too_much_action")) {
    suggested.push({
      type: "add_breathing_beat",
      description: `Trop d'action. Beat de respiration suggéré (${genreMode}) : ${BREATHING_BY_GENRE[genreMode]}`,
      appliedValue: BREATHING_BY_GENRE[genreMode],
      autoApplied: false,
    });
  }

  for (const issue of issues.filter(
    (i) => i.code === "weak_scene" && i.sceneIndex !== undefined,
  )) {
    suggested.push({
      type: "mark_weak_scene",
      targetSceneIndex: issue.sceneIndex,
      description: `Scène ${(issue.sceneIndex ?? 0) + 1} marquée comme faible — à enrichir ou supprimer.`,
      autoApplied: false,
    });
  }

  if (issueCodes.has("low_beat_variety")) {
    suggested.push({
      type: "add_reveal_beat",
      description: `Variété de beats insuffisante. Beat reveal suggéré (${genreMode}) : ${REVEAL_BY_GENRE[genreMode]}`,
      appliedValue: REVEAL_BY_GENRE[genreMode],
      autoApplied: false,
    });
  }

  return { suggestedPatches: suggested, autoAppliedPatches: autoApplied, patchedBundle };
}
