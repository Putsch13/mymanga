/**
 * Submission flow du wizard de création de projet.
 *
 * - construit `description` et `userIntent` enrichis (univers + héros + secondaire),
 * - crée le projet,
 * - crée héros + personnage secondaire en parallèle (best-effort),
 * - crée le chapitre 1 et redirige vers son éditeur.
 */
import type { WizardState } from "./use-wizard-state";

export function buildEnrichedDescription(state: WizardState): string {
  const parts: string[] = [];
  if (state.description.trim()) parts.push(state.description.trim());
  if (state.era.trim()) parts.push(`Époque : ${state.era.trim()}.`);
  if (state.theme.trim()) parts.push(`Thème central : ${state.theme.trim()}.`);
  if (state.keyLocations.trim()) parts.push(`Lieux clés : ${state.keyLocations.trim()}.`);
  return parts.join("\n");
}

export function buildEnrichedUserIntent(state: WizardState): string {
  const parts: string[] = [];
  if (state.pitch.trim()) parts.push(state.pitch.trim());
  if (state.heroName.trim()) {
    const heroDesc = [
      state.heroName.trim(),
      state.heroRole.trim() && `(${state.heroRole.trim()})`,
      state.heroBrief.trim(),
    ]
      .filter(Boolean)
      .join(" ");
    parts.push(`Héros : ${heroDesc}.`);
  }
  if (state.secondaryName.trim()) {
    const secDesc = [
      state.secondaryName.trim(),
      state.secondaryRole.trim() && `(${state.secondaryRole.trim()})`,
      state.secondaryBrief.trim(),
    ]
      .filter(Boolean)
      .join(" ");
    parts.push(`Personnage secondaire : ${secDesc}.`);
  }
  if (state.era.trim() || state.theme.trim()) {
    const ctx = [
      state.era.trim() && `dans ${state.era.trim()}`,
      state.theme.trim() && `autour du thème "${state.theme.trim()}"`,
    ]
      .filter(Boolean)
      .join(", ");
    if (ctx) parts.push(`Cadre : ${ctx}.`);
  }
  if (state.keyLocations.trim()) parts.push(`Lieux : ${state.keyLocations.trim()}.`);
  return parts.join(" ");
}

async function createCharacter(
  projectId: string,
  name: string,
  role: string,
  brief: string,
): Promise<void> {
  if (!name.trim()) return;
  try {
    await fetch(`/api/projects/${projectId}/characters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        roleType: role.trim() || null,
        biography: brief.trim() || null,
      }),
    });
  } catch (err) {
    console.warn("[wizard] character_create_failed", err);
  }
}

export interface SubmitResult {
  ok: boolean;
  redirectTo: string | null;
  error?: string;
}

export async function submitNewProject(state: WizardState): Promise<SubmitResult> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: state.title,
      pitch: state.pitch,
      description: buildEnrichedDescription(state),
      primaryGenre: state.primaryGenre || undefined,
      subGenres: state.subGenres,
      tone: state.tone,
      format: state.format,
      visualStyle: state.visualStyle,
      contentRating: state.contentRating,
      intensityLayer: state.intensityLayer,
      settings: {
        violenceLevel: state.violenceLevel,
        romanceLevel: state.romanceLevel,
        sensualityLevel: state.sensualityLevel,
        darknessLevel: state.darknessLevel,
        mysteryLevel: state.mysteryLevel,
        dialogueDensity: state.dialogueDensity,
        canonStrictness: state.canonStrictness,
      },
    }),
  });
  if (!res.ok) {
    return { ok: false, redirectTo: null, error: "Création impossible" };
  }
  const data = (await res.json()) as { project: { id: string } };
  const projectId = data.project.id;

  await Promise.all([
    createCharacter(projectId, state.heroName, state.heroRole || "héros", state.heroBrief),
    createCharacter(
      projectId,
      state.secondaryName,
      state.secondaryRole,
      state.secondaryBrief,
    ),
  ]);

  const enrichedIntent = buildEnrichedUserIntent(state);

  const chapterRes = await fetch(`/api/projects/${projectId}/chapters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Chapitre 1",
      userIntent: enrichedIntent || undefined,
      studioDraft: {
        intent: {
          chapterNumber: 1,
          workingTitle: "Chapitre 1",
          shortPitch: state.pitch || "",
          arcPosition: "",
          emotionalGoal: "",
          mainConflict: "",
          endingMode: null,
          arcImportance: null,
        },
      },
    }),
  });
  if (!chapterRes.ok) {
    return { ok: true, redirectTo: `/projects/${projectId}` };
  }
  const chapterData = (await chapterRes.json()) as { chapter: { id: string } };
  const chapterId = chapterData.chapter.id;
  return {
    ok: true,
    redirectTo: `/projects/${projectId}/chapters/${chapterId}/edit?onboarding=1&firstChapter=1`,
  };
}
