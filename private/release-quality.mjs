import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PERFORMANCE_BUDGETS } from "../scripts/performance-budgets.mjs";
import { createShieldDelivery } from "./logo-delivery.mjs";
import { officialLogoIntegrity } from "../scripts/logo-integrity.mjs";

const root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
const requiredNames=["check","browser","protected-ui","auth-catalog-inventory","gated-preview"];
const safeText=v=>String(v??"").replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const statusCache=new Map();
const qualityLink="https://github.com/AstroTat808/TheGreenLocker/actions";
const bytes=v=>v<1024?v+" B":v<1048576?(v/1024).toFixed(1)+" KB":(v/1048576).toFixed(2)+" MB";

export function localQualitySnapshot({env=process.env,workingDir=root,uptimeSeconds=process.uptime()}={}){
  const manifest=JSON.parse(fs.readFileSync(path.join(workingDir,"tests/visual-baselines.json"),"utf8"));
  const visualKeys=Object.keys(manifest.baselines||{});
  const baselines=visualKeys.filter(key=>{
    const item=manifest.baselines[key];
    return Number.isSafeInteger(item?.width)&&Number.isSafeInteger(item?.height)&&
      Buffer.from(item?.colors||"","base64").length===288;
  });
  const assets=Object.entries(PERFORMANCE_BUDGETS).map(([name,limit])=>{
    const actual=fs.statSync(path.join(workingDir,name)).size;
    return {name,actual,limit,percent:Math.round(actual*100/limit),pass:actual<=limit};
  });
  const artwork=fs.readFileSync(path.join(workingDir,"assets/shield-logo-transparent.svg"));
  const delivery=createShieldDelivery(artwork);
  const commit=String(env.RAILWAY_GIT_COMMIT_SHA||env.TGL_RELEASE_SHA||"").toLowerCase();
  return {
    generatedAt:new Date().toISOString(),
    commit:/^[0-9a-f]{40}$/.test(commit)?commit:null,
    environment:String(env.RAILWAY_ENVIRONMENT_NAME||env.TGL_ENV||"preview").slice(0,64),
    visual:{mode:manifest.mode,approved:baselines.length,total:visualKeys.length,
      ready:manifest.mode==="enforce"&&visualKeys.length>0&&baselines.length===visualKeys.length},
    assets,
    budgets:{passed:assets.filter(item=>item.pass).length,total:assets.length},
    logo:{originalBytes:delivery.originalBytes,brotliBytes:delivery.compressedBytes,
      savedPercent:Math.max(0,Math.round(100*(1-delivery.compressedBytes/delivery.originalBytes))),
      sameArtwork:officialLogoIntegrity(workingDir).pass,etag:delivery.etag},
    runtime:{state:"serving",uptimeSeconds:Math.floor(uptimeSeconds),
      source:"This application process responded to the request",
      providerReplicaStatus:"Not reported by this application"}
  };
}

export async function fetchGitHubChecks(commit,{token=process.env.TGL_QUALITY_GITHUB_TOKEN,
  fetchImpl=globalThis.fetch,allowNetwork=true}={}){
  const reference=qualityLink;
  if(!/^[0-9a-f]{40}$/.test(commit||""))
    return {state:"unknown",description:"Exact deployed commit not exposed",url:reference,checks:[]};
  const url="https://api.github.com/repos/AstroTat808/TheGreenLocker/commits/"+commit+"/check-runs?per_page=100";
  if(!allowNetwork)return {state:"unknown",description:"GitHub verification not connected",url:reference,checks:[]};
  const entry=statusCache.get(commit);
  if(entry&&Date.now()-entry.at<45000)return entry.value;
  let value;
  try {
    const response=await fetchImpl(url,{
      headers:{"Accept":"application/vnd.github+json",
        "User-Agent":"GreenLocker-release-quality/1.0",
        ...(token?{"Authorization":"Bearer "+token}:{})},
      signal:AbortSignal.timeout(2200)
    });
    if(!response.ok)throw new Error("GitHub checks endpoint unavailable");
    const data=await response.json();
    if(!Array.isArray(data.check_runs))throw new Error("Invalid checks response");
    const records=requiredNames.map(name=>{
      const sorted=data.check_runs.filter(run=>run.name===name)
        .sort((a,b)=>String(b.completed_at||b.started_at||"").localeCompare(String(a.completed_at||a.started_at||"")));
      const item=sorted[0];
      return {name,status:item?.status||"missing",conclusion:item?.conclusion||null};
    });
    value={state:records.every(x=>x.conclusion==="success")?"passed":
      records.some(x=>x.conclusion&&x.conclusion!=="success")?"failed":"pending",
      description:"GitHub checks for the deployed commit",url:reference,checks:records};
  }catch{
    value={state:"unknown",description:"GitHub status unavailable; configure read-only GitHub token for a private repository",url:reference,checks:[]};
  }
  statusCache.set(commit,{at:Date.now(),value});
  return value;
}

export async function releaseQualitySnapshot({env=process.env,workingDir=root,uptimeSeconds=process.uptime(),
  fetchImpl=globalThis.fetch,allowNetwork=true}={}){
  const snapshot=localQualitySnapshot({env,workingDir,uptimeSeconds});
  snapshot.ci=await fetchGitHubChecks(snapshot.commit,{token:env.TGL_QUALITY_GITHUB_TOKEN,fetchImpl,allowNetwork});
  snapshot.overall=!snapshot.visual.ready||snapshot.budgets.passed!==snapshot.budgets.total||!snapshot.logo.sameArtwork?"failed":
    snapshot.ci.state==="passed"?"verified":
    snapshot.ci.state==="failed"?"failed":"unverified";
  return snapshot;
}

function statusPill(state,label=state){
 const normalized=["passed","verified","serving"].includes(state)?"pass":
   state==="failed"?"fail":"unknown";
 return '<span class="quality-pill quality-'+normalized+'">'+safeText(label)+'</span>';
}
export function renderReleaseQualityDashboard(snapshot,{layout,user,csrf}){
 const status=(row)=>row.pass?statusPill("passed","Within budget"):statusPill("failed","Over budget");
 const assetRows=snapshot.assets.map(row=>'<tr><td><code>'+safeText(row.name)+'</code></td>'+
   '<td>'+bytes(row.actual)+'</td><td>'+bytes(row.limit)+'</td><td>'+status(row)+'</td></tr>').join("");
 const checks=snapshot.ci.checks.length?snapshot.ci.checks.map(c=>'<tr><td><code>'+safeText(c.name)+'</code></td>'+
   '<td>'+safeText(c.status)+'</td><td>'+statusPill(c.conclusion==="success"?"passed":c.conclusion?"failed":"unknown",
    c.conclusion||"Not complete")+'</td></tr>').join(""):
   '<tr><td colspan="3">Live GitHub check results are unavailable. '+safeText(snapshot.ci.description)+'.</td></tr>';
 const cards=[
  {label:"Visual references",value:snapshot.visual.approved+" / "+snapshot.visual.total,
    state:snapshot.visual.ready?"passed":"failed",note:snapshot.visual.ready?"Enforced baseline contract":"Missing or unapproved screenshots"},
  {label:"Asset budgets",value:snapshot.budgets.passed+" / "+snapshot.budgets.total,
    state:snapshot.budgets.passed===snapshot.budgets.total?"passed":"failed",note:"Uncompressed source-size checks"},
  {label:"Deployed CI",value:snapshot.ci.state==="passed"?"5 / 5":snapshot.ci.state==="unknown"?"Unavailable":snapshot.ci.state,
    state:snapshot.ci.state,note:"GitHub exact-commit check runs"},
  {label:"Runtime health",value:"Serving",state:"passed",note:"Current app process responding"}
 ];
 const summaries=cards.map(c=>'<article class="quality-metric"><span>'+safeText(c.label)+'</span><strong>'+safeText(c.value)+'</strong>'+
   statusPill(c.state,c.state==="passed"?"Verified":c.state==="failed"?"Needs attention":"Not verified")+
   '<small>'+safeText(c.note)+'</small></article>').join("");
 const head='<section class="private-title quality-hero"><span class="eyebrow">ADMINISTRATION / RELEASE OPERATIONS</span>'+
   '<h1>Release <em>Quality.</em></h1><p>Authenticated overview of visual stability, source budgets, logo delivery and live application health.</p>'+
   '<nav class="wallet-monitor-nav" aria-label="Release quality navigation">'+
   '<a class="wallet-monitor-nav-link" href="/admin">Operations dashboard</a>'+
   '<a class="wallet-monitor-nav-link" href="/admin/quality">Refresh metrics</a>'+
   '<a class="wallet-monitor-nav-link" href="'+qualityLink+'" rel="noreferrer">GitHub Actions</a></nav></section>';
 const summary='<section class="quality-summary" aria-label="Release-quality scorecard">'+summaries+'</section>';
 const release='<section class="private-panel quality-panel"><h2>Deployment integrity</h2>'+
   '<dl class="quality-details"><div><dt>Observed environment</dt><dd>'+safeText(snapshot.environment)+'</dd></div>'+
   '<div><dt>Exact commit</dt><dd><code>'+safeText(snapshot.commit||"Unavailable")+'</code></dd></div>'+
   '<div><dt>Runtime uptime</dt><dd>'+Math.floor(snapshot.runtime.uptimeSeconds/60)+' minutes</dd></div>'+
   '<div><dt>Provider replica telemetry</dt><dd>Not connected; serving health is confirmed only for this app process</dd></div>'+
   '<div><dt>Last refreshed</dt><dd>'+safeText(snapshot.generatedAt)+'</dd></div></dl></section>';
 const logo='<section class="private-panel quality-panel"><h2>Shield delivery</h2>'+
   '<p>The official shield and transparent alpha mask are byte-verified against approved artwork fingerprints. Brotli compresses the SVG transfer losslessly; the cache uses ETag revalidation.</p>'+
   '<div class="quality-logo-savings"><strong>'+snapshot.logo.savedPercent+'%</strong><span>Estimated transfer-size reduction versus uncompressed SVG</span></div>'+
   '<dl class="quality-details"><div><dt>Original source</dt><dd>'+bytes(snapshot.logo.originalBytes)+'</dd></div>'+
   '<div><dt>Brotli response</dt><dd>'+bytes(snapshot.logo.brotliBytes)+'</dd></div></dl></section>';
 const assets='<section class="private-panel quality-panel"><h2>Performance budgets</h2>'+
   '<p>Measured repository source sizes. Runtime LCP/CLS/INP must be verified separately by browser checks; these are not field Web Vitals.</p>'+
   '<div class="scroll-table"><table><thead><tr><th>Critical file</th><th>Current</th><th>Limit</th><th>Status</th></tr></thead>'+
   '<tbody>'+assetRows+'</tbody></table></div></section>';
 const visual='<section class="private-panel quality-panel"><h2>Visual regression coverage</h2><p>'+
   snapshot.visual.approved+' approved screenshot signatures across mobile, collection cards and authenticated surfaces. '+
   'Exact-run visual test results appear in the GitHub checks section when the GitHub API is connected.</p>'+
   '<p>Baseline enforcement: '+statusPill(snapshot.visual.ready?"passed":"failed",snapshot.visual.mode)+
   '</p></section>';
 const ci='<section class="private-panel quality-panel"><h2>GitHub release gates</h2>'+
   '<p>For private repositories, connect a read-only GitHub API token on the server to view exact-commit CI status. Unknown is never treated as passed.</p>'+
   '<div class="scroll-table"><table><thead><tr><th>Required check</th><th>Run status</th><th>Conclusion</th></tr></thead>'+
   '<tbody>'+checks+'</tbody></table></div></section>';
 return layout("Release Quality",head+summary+release+'<div class="quality-columns">'+logo+visual+'</div>'+assets+ci,user,csrf);
}
