import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'*.spec.mjs',workers:1,timeout:25000,
  outputDir:'artifacts/browser',reporter:'list',use:{baseURL:process.env.GTBO_BASE_URL||'http://127.0.0.1:4173',viewport:{width:1440,height:1000},headless:true,channel:'msedge',screenshot:'only-on-failure'}});
