/** @type {import('@playwright/test').PlaywrightTestConfig} */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './data/results/tests',
  testMatch: /\.(spec|test)\.(js|ts|mjs)$/,
  use: {
    baseURL: 'http://127.0.0.1:7001',
    // https://demo.playwright.dev/todomvc
  },
});
