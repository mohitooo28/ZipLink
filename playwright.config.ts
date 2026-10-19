import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * End-to-end tests run two isolated browser contexts (sender and receiver)
 * against a production build. STUN is disabled so the test only relies on
 * local host candidates and never leaves the machine.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Use the locally installed Chrome; set PW_CHANNEL="" to use Playwright's bundled Chromium.
    channel: process.env.PW_CHANNEL ?? "chrome",
    launchOptions: {
      // Expose real host candidates instead of mDNS names so loopback peers can connect.
      args: ["--disable-features=WebRtcHideLocalIpsWithMdns"],
    },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/status`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { STUN_URLS: "", JOIN_FAILURE_LIMIT: "50" },
  },
});
