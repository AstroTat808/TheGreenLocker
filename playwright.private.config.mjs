import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
const dbPath=path.join(process.cwd(),"data","browser-ci.sqlite");
export default defineConfig({
 testDir:"./tests",
 testMatch:"private-browser.spec.mjs",
 timeout:40000,
 reporter:[["list"],["html",{open:"never",outputFolder:"playwright-private-report"}]],
 retries:process.env.CI ? 1 : 0,
 workers:1,
 use:{baseURL:"http://127.0.0.1:4174",screenshot:"only-on-failure",trace:"retain-on-failure"},
 projects:[
  {name:"private-desktop-chromium",use:{...devices["Desktop Chrome"],viewport:{width:1440,height:900}}},
  {name:"private-mobile-webkit",use:{...devices["iPhone 13"]}}
 ],
 webServer:{
  command:"node private/server.mjs",
  url:"http://127.0.0.1:4174/healthz",
  reuseExistingServer:false,
  timeout:30000,
  env:{TGL_INVITE_CODE:"ci-playwright-invitation-12345",TGL_DB_PATH:dbPath,TGL_HOST:"127.0.0.1",PORT:"4174"}
 }
});
