import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_WEB_PORT ?? "3101");
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL,
    trace: "retain-on-failure",
    headless: true,
  },
  globalSetup: "./tests/e2e/global.setup.ts",
  webServer: {
    command: `AUTH_DISABLED=true OPENAI_API_KEY=e2e FAL_KEY=e2e pnpm exec next dev --port ${PORT}`,
    cwd: __dirname,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
