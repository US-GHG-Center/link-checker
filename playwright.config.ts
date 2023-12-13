import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 800000,
  globalTimeout: 900000,
  reporter: 'list',
  testDir: './link_checker_test',
  testMatch: ["**/*.js"]
});