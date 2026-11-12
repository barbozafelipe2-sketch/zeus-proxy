import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'tests/browser',fullyParallel:true,retries:0,reporter:'list',
  use:{launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{},baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure'},
  projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 7']}}],
  webServer:{command:'python3 -m http.server 4173 --bind 127.0.0.1 --directory public',url:'http://127.0.0.1:4173',reuseExistingServer:false}
});
