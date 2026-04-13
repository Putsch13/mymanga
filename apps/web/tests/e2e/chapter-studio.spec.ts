import { expect, test } from "@playwright/test";

const projectId = "e2e-project-studio";
const blockedChapterId = "e2e-chapter-blocked";
const readyChapterId = "e2e-chapter-ready";
const reviewChapterId = "e2e-chapter-review";
const premiumChapterId = "e2e-chapter-premium";

test("autosave studio puis gate de lancement bloque/pret", async ({ page }) => {
  await page.goto(`/projects/${projectId}/chapters/${blockedChapterId}/edit`);

  const saveResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/api/projects/${projectId}/chapters/${blockedChapterId}/studio`) &&
    response.request().method() === "PATCH" &&
    response.status() === 200,
  );
  await page.getByTestId("studio-working-title").fill("Chapitre bloque e2e modifie");
  await page.getByTestId("studio-save-button").click();
  await saveResponsePromise;

  await page.reload();
  await expect(page.getByTestId("studio-working-title")).toHaveValue("Chapitre bloque e2e modifie");
  await page.getByTestId("blocker-action-missing_narrative_contract").click();
  await expect(page.getByTestId("studio-emotional-goal")).toBeFocused();
  await page.getByRole("button", { name: /4\. Génération & Review/i }).click();
  await expect(page.getByTestId("chapter-launch-button")).toBeDisabled();
  await expect(page.getByText("Corrige d’abord les blocants du studio pour lancer la génération.")).toBeVisible();

  await page.goto(`/projects/${projectId}/chapters/${readyChapterId}/edit`);
  await page.getByRole("button", { name: /4\. Génération & Review/i }).click();
  await expect(page.getByTestId("chapter-launch-button")).toBeEnabled();
});

test("flux premium : valider plan, sauvegarder contrat, lancer via /pipeline, reroll prop et cutaway", async ({ page }) => {
  // 1. Aller sur le chapitre premium (doit avoir un contrat premium pré-chargé)
  await page.goto(`/projects/${projectId}/chapters/${premiumChapterId}/edit`);

  // 2. Vérifier que la carte Production Plan affiche le score premium
  await page.getByRole("button", { name: /2\. Plan éditorial/i }).click();
  await expect(page.getByText(/Premium readiness/i)).toBeVisible();

  // 3. Sauvegarder le plan (autosave ou bouton explicite)
  const saveResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/api/projects/${projectId}/chapters/${premiumChapterId}/studio`) &&
    response.request().method() === "PATCH" &&
    response.status() === 200,
  );
  await page.getByTestId("studio-save-button").click();
  await saveResponsePromise;

  // 4. Naviguer vers l'étape Génération & Review
  await page.getByRole("button", { name: /4\. Génération & Review/i }).click();
  await expect(page.getByTestId("chapter-launch-button")).toBeEnabled();

  // 5. Lancer la génération — doit appeler /pipeline (pas /launch)
  const pipelineResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/api/projects/${projectId}/pipeline`) &&
    response.request().method() === "POST" &&
    response.status() === 200,
  );
  await page.getByTestId("chapter-launch-button").click();
  const pipelineResponse = await pipelineResponsePromise;
  const pipelinePayload = await pipelineResponse.json();
  expect(pipelinePayload.ok).toBe(true);

  // 6. Simuler un reroll prop sur un panel existant
  const propRerollPromise = page.waitForResponse((response) =>
    response.url().includes("/api/scene-images/") &&
    response.url().includes("/retry") &&
    response.url().includes("mode=prop") &&
    response.request().method() === "POST",
  );
  const propRerollButton = page.getByTestId("reroll-prop-button").first();
  if (await propRerollButton.isVisible()) {
    await propRerollButton.click();
    const propRerollResponse = await propRerollPromise;
    expect(propRerollResponse.status()).toBe(200);
  }

  // 7. Simuler un reroll cutaway sur un panel existant
  const cutawayRerollPromise = page.waitForResponse((response) =>
    response.url().includes("/api/scene-images/") &&
    response.url().includes("/retry") &&
    response.url().includes("mode=cutaway") &&
    response.request().method() === "POST",
  );
  const cutawayRerollButton = page.getByTestId("reroll-cutaway-button").first();
  if (await cutawayRerollButton.isVisible()) {
    await cutawayRerollButton.click();
    const cutawayRerollResponse = await cutawayRerollPromise;
    expect(cutawayRerollResponse.status()).toBe(200);
  }
});

test("review affiche les compteurs, bloque la cloture et propose la comparaison", async ({ page }) => {
  await page.goto(`/projects/${projectId}/chapters/${reviewChapterId}/edit`);
  await page.getByRole("button", { name: /4\. Génération & Review/i }).click();

  await expect(page.getByTestId("review-minimum-images")).toContainText("55");
  await expect(page.getByTestId("review-accepted-images")).toContainText("1");
  await expect(page.getByTestId("review-missing-images")).toContainText("54");

  await page.getByTestId("compare-panel-e2e-panel-current").click();
  await expect(page.getByText("Version précédente")).toBeVisible();

  const reviewResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/api/projects/${projectId}/chapters/${reviewChapterId}/review/complete`) &&
    response.request().method() === "POST",
  );
  await page.getByTestId("review-complete-button").click();
  const reviewResponse = await reviewResponsePromise;
  expect(reviewResponse.status()).toBe(422);
  const reviewPayload = await reviewResponse.json();
  expect(reviewPayload.message).toContain("Impossible de clôturer");
});
