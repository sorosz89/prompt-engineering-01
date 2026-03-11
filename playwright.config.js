/** @type {import('@playwright/test').PlaywrightTestConfig} */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /\.(spec|test)\.(js|ts|mjs)$/,
  use: {
    baseURL: 'https://demo.playwright.dev/',
  },
});
