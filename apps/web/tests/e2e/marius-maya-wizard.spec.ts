/**
 * TEST-2 (Audit CTO v5) — Smoke E2E « Marius et Maya partent en mer ».
 *
 * Objectif : figer le chemin wizard → projet → personnages → chapitre 1
 * tel qu'il est réellement appelé par `/projects/new` (ARCH-5). Si une
 * régression casse l'une de ces routes, ce test crashe.
 *
 * Ce test n'inclut **pas** la génération d'images réelle (trop coûteuse en
 * CI : 72 panels × FAL × OpenAI ≈ 6 min + crédits). Le launch + dispatch
 * sont couverts par `chapter-studio.spec.ts` sur le fixture `e2e-chapter-ready`.
 *
 * Cas couvert ici (Sprint Marius/Maya) :
 *   • Création du projet manga (titre + pitch + genre)
 *   • Création des deux personnages (héros + secondaire)
 *   • Création du chapitre 1 avec un userIntent enrichi
 *   • Vérification que le chapitre est bien rattaché et lisible
 */
import { expect, test } from "@playwright/test";

const TIMESTAMP = Date.now();
const PROJECT_TITLE = `Marius & Maya en mer · e2e ${TIMESTAMP}`;
const PROJECT_PITCH =
  "Marius, marin solitaire, embarque malgré lui sa sœur Maya pour défier la tempête qui a englouti leur père.";

const HERO_NAME = "Marius";
const HERO_ROLE = "héros";
const HERO_BIO =
  "Marin taciturne hanté par la mer. Maîtrise le gouvernail comme personne mais redoute le large depuis la disparition de son père.";

const SECONDARY_NAME = "Maya";
const SECONDARY_ROLE = "co-protagoniste";
const SECONDARY_BIO =
  "Petite sœur de Marius, vive et impulsive, elle refuse de rester à terre et grimpe à bord en pleine nuit.";

const CHAPTER_USER_INTENT = [
  PROJECT_PITCH,
  `Héros : ${HERO_NAME} (${HERO_ROLE}) ${HERO_BIO}`,
  `Personnage secondaire : ${SECONDARY_NAME} (${SECONDARY_ROLE}) ${SECONDARY_BIO}`,
  "Cadre : époque moderne, dans un port breton sous tempête.",
  "Lieux : pont du chalutier 'L'Albatros', cabine du capitaine, jetée du port.",
].join(" ");

test("wizard Marius/Maya — création projet, personnages et chapitre 1", async ({ request }) => {
  // 1) Création du projet — exactement ce que fait `apps/web/app/(app)/projects/new/page.tsx`
  const projectRes = await request.post("/api/projects", {
    data: {
      title: PROJECT_TITLE,
      pitch: PROJECT_PITCH,
      description:
        "Une fratrie face à la mer, à l'ombre d'un père disparu et d'une légende locale.\nÉpoque : contemporaine.\nThème central : deuil et reconquête.\nLieux clés : port, bateau, falaise.",
      primaryGenre: "drame",
      subGenres: ["aventure", "drame", "slice of life"],
      tone: "mélancolique",
      format: "manga",
      visualStyle: "encre noire détaillée, style seinen",
      contentRating: "TEEN",
      intensityLayer: "TEEN",
      settings: {
        violenceLevel: 35,
        romanceLevel: 15,
        sensualityLevel: 5,
        darknessLevel: 60,
        mysteryLevel: 55,
        dialogueDensity: 50,
        canonStrictness: 85,
      },
    },
  });
  expect(projectRes.status(), `POST /api/projects status: ${await projectRes.text().catch(() => "?")}`).toBe(200);
  const projectPayload = (await projectRes.json()) as { project?: { id?: string } };
  const projectId = projectPayload.project?.id;
  expect(projectId, "projet doit avoir un id").toBeTruthy();

  // 2) Création des personnages (héros + secondaire) — POST en parallèle, comme le wizard.
  const [heroRes, sideRes] = await Promise.all([
    request.post(`/api/projects/${projectId}/characters`, {
      data: {
        name: HERO_NAME,
        roleType: HERO_ROLE,
        biography: HERO_BIO,
      },
    }),
    request.post(`/api/projects/${projectId}/characters`, {
      data: {
        name: SECONDARY_NAME,
        roleType: SECONDARY_ROLE,
        biography: SECONDARY_BIO,
      },
    }),
  ]);
  expect(heroRes.status(), `POST héros status: ${await heroRes.text().catch(() => "?")}`).toBe(200);
  expect(sideRes.status(), `POST secondaire status: ${await sideRes.text().catch(() => "?")}`).toBe(200);

  // 3) Création du chapitre 1 avec userIntent enrichi (pitch + persos + cadre).
  const chapterRes = await request.post(`/api/projects/${projectId}/chapters`, {
    data: {
      title: "Chapitre 1 — La nuit de la tempête",
      userIntent: CHAPTER_USER_INTENT,
      studioDraft: {
        intent: {
          chapterNumber: 1,
          workingTitle: "Chapitre 1 — La nuit de la tempête",
          shortPitch: PROJECT_PITCH,
          arcPosition: "incident déclencheur",
          emotionalGoal: "passer du déni à l'action",
          mainConflict: "Marius doit accepter la présence de Maya à bord pour survivre.",
          endingMode: "cliffhanger",
          arcImportance: "high",
        },
      },
    },
  });
  expect(chapterRes.status(), `POST chapter status: ${await chapterRes.text().catch(() => "?")}`).toBe(200);
  const chapterPayload = (await chapterRes.json()) as { chapter?: { id?: string; chapterNumber?: number } };
  const chapterId = chapterPayload.chapter?.id;
  expect(chapterId, "chapitre doit avoir un id").toBeTruthy();
  expect(chapterPayload.chapter?.chapterNumber).toBe(1);

  // 4) Le chapitre doit être lisible et porter le userIntent enrichi.
  const fetchRes = await request.get(`/api/projects/${projectId}/chapters/${chapterId}`);
  expect(fetchRes.status()).toBe(200);
  const fetched = (await fetchRes.json()) as {
    chapter?: { id?: string; userIntent?: string | null; status?: string };
  };
  expect(fetched.chapter?.id).toBe(chapterId);
  expect(fetched.chapter?.userIntent ?? "").toContain("Marius");
  expect(fetched.chapter?.userIntent ?? "").toContain("Maya");
});
