import { expect, test } from "@playwright/test";

const projectId = "e2e-project-studio";
const blockedChapterId = "e2e-chapter-blocked";
const readyChapterId = "e2e-chapter-ready";
const reviewChapterId = "e2e-chapter-review";

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
  await page.getByRole("button", { name: /9\. Génération/i }).click();
  await expect(page.getByTestId("chapter-launch-button")).toBeDisabled();
  await expect(page.getByText("Corrige d’abord les blocants du studio pour lancer la génération.")).toBeVisible();

  await page.goto(`/projects/${projectId}/chapters/${readyChapterId}/edit`);
  await page.getByRole("button", { name: /9\. Génération/i }).click();
  await expect(page.getByTestId("chapter-launch-button")).toBeEnabled();
});

test("review affiche les compteurs, bloque la cloture et propose la comparaison", async ({ page }) => {
  await page.goto(`/projects/${projectId}/chapters/${reviewChapterId}/edit`);
  await page.getByRole("button", { name: /10\. QA \/ Review/i }).click();

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
