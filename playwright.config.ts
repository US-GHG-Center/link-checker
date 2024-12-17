import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 80000000,
  globalTimeout: 90000000,
  reporter: 'list',
  testDir: './link_checker_test',
  testMatch: ["**/*.js"]
});