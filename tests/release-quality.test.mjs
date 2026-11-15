import test from "node:test";
import assert from "node:assert/strict";
import { localQualitySnapshot,fetchGitHubChecks,releaseQualitySnapshot,renderReleaseQualityDashboard } from "../private/release-quality.mjs";

test("quality dashboard counts only approved references and actual source budgets",()=>{
  const snap=localQualitySnapshot({env:{TGL_ENV:"preview"},uptimeSeconds:130});
  assert.equal(snap.visual.mode,"enforce");
  assert.equal(snap.visual.ready,true);
  assert.ok(snap.visual.total>=19);
  assert.equal(snap.visual.approved,snap.visual.total);
  assert.equal(snap.budgets.passed,snap.budgets.total);
  assert.ok(snap.logo.savedPercent>10);
  assert.equal(snap.runtime.uptimeSeconds,130);
  assert.equal(snap.commit,null);
});
test("live deployment CI distinguishes passing exact SHA from failure or unavailable",async()=>{
  const sha="a".repeat(40), names=["check","browser","protected-ui","auth-catalog-inventory","gated-preview"];
  let urlSeen="",authSeen="";
  const passed=await fetchGitHubChecks(sha,{token:"sample-read-token",fetchImpl:async(url,init)=>{
    urlSeen=url;authSeen=init.headers.Authorization;
    return {ok:true,json:async()=>({check_runs:names.map(name=>({name,status:"completed",conclusion:"success"}))})};
  }});
  assert.equal(passed.state,"passed");
  assert.ok(urlSeen.endsWith(sha+"/check-runs?per_page=100"));
  assert.equal(authSeen,"Bearer sample-read-token");
  assert.equal(passed.checks.length,5);
  const unavailable=await fetchGitHubChecks("b".repeat(40),{fetchImpl:async()=>({ok:false})});
  assert.equal(unavailable.state,"unknown");
  const offline=await fetchGitHubChecks(null,{allowNetwork:false});
  assert.equal(offline.state,"unknown");
});
test("dashboard is an accessible static admin view and never leaks server credentials",async()=>{
  const snap=await releaseQualitySnapshot({env:{TGL_ENV:"preview",TGL_QUALITY_GITHUB_TOKEN:"secret-should-not-render"},allowNetwork:false});
  const html=renderReleaseQualityDashboard(snap,{
    layout:(_title,body)=>body,user:{id:1,role:"admin"},csrf:"not-exposed"
  });
  assert.match(html,/Release <em>Quality/);
  assert.match(html,/Visual references/);
  assert.match(html,/Performance budgets/);
  assert.match(html,/Shield delivery/);
  assert.match(html,/GitHub release gates/);
  assert.match(html,/Not connected|unavailable|not connected/i);
  assert.doesNotMatch(html,/secret-should-not-render/);
  assert.doesNotMatch(html,/not-exposed/);
});
