import {defineConfig} from '@playwright/test';
import path from 'node:path';
const directory=path.resolve('.runtime/e2e-data');
export default defineConfig({
 testDir:'scripts/e2e',timeout:60000,expect:{timeout:15000},fullyParallel:false,workers:2,
 reporter:[['list'],['html',{outputFolder:'.runtime/playwright-report',open:'never'}]],
 use:{headless:true,viewport:{width:1440,height:1000},trace:'retain-on-failure',video:'retain-on-failure',launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}},
 projects:[{name:'web',use:{baseURL:'http://127.0.0.1:3159'}},{name:'vite',use:{baseURL:'http://127.0.0.1:3160'}}],
 webServer:[
  {command:'npm run start -w @ziwei/web',url:'http://127.0.0.1:3159/api/health',reuseExistingServer:false,timeout:120000,env:{PORT:'3159',HOSTNAME:'127.0.0.1',H2_DATA_DIR:directory,AI_CONFIG_DIR:directory,OPENAI_API_KEY:'',OPENAI_BASE_URL:'',OPENAI_MODEL:'',NEXT_TELEMETRY_DISABLED:'1'}},
  {command:'npm run dev -w @ziwei/native -- --host 127.0.0.1 --port 3160 --strictPort',url:'http://127.0.0.1:3160',reuseExistingServer:false,timeout:60000,env:{VITE_SITE_URL:'https://ziwei.example'}},
 ],
});
