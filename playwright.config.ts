import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  timeout: 30000,
  retries: 0,
  workers: 2,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3100",
    channel: process.env.PLAYWRIGHT_CHANNEL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 60000,
    env: { APP_URL: "http://localhost:3100" },
  },
});
