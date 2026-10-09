import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const databaseUrl = process.env.E2E_DATABASE_URL;

/**
 * Browser tests drive a real production build: one host browser and several
 * independent phone-sized browser contexts (separate cookies) playing together.
 *
 *   npm run build && npm run test:e2e                       → in-memory demo store
 *   E2E_DATABASE_URL=postgres://… npm run test:e2e          → real PostgreSQL store (migrate first)
 *   PW_CHROMIUM_PATH=/path/to/chrome                        → use an existing Chromium binary
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      ...(databaseUrl ? { DATABASE_URL: databaseUrl, DATABASE_SSL: "disable" } : { ALLOW_MEMORY_STORE: "true" }),
      NICKNAME_BLOCKLIST: "",
    },
  },
});
