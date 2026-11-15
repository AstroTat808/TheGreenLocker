import fs from "node:fs";
import { PNG } from "pngjs";

const settings = JSON.parse(fs.readFileSync(new URL("./visual-baselines.json", import.meta.url), "utf8"));

/**
 * Low-resolution, browser-specific pixel fingerprint of a Playwright screenshot.
 * Samples a 12x8 grid of center-averaged colors, detecting visual disruptions
 * without storing personal data or full-page authenticated screenshots in Git.
 * Full screenshots remain available privately in workflow evidence artifacts.
 */
export function visualFingerprint(buffer) {
  const img = PNG.sync.read(buffer);
  const columns=12, rows=8, rgb=[];
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const accum=[0,0,0];
    let samples=0;
    for(let dy=0;dy<3;dy++)for(let dx=0;dx<3;dx++){
      const sx=Math.min(img.width-1,Math.floor((col+(dx+1)/4)*img.width/columns));
      const sy=Math.min(img.height-1,Math.floor((row+(dy+1)/4)*img.height/rows));
      const offset=(sy*img.width+sx)*4;
      const alpha=img.data[offset+3]/255;
      for(let channel=0;channel<3;channel++)
        accum[channel]+=img.data[offset+channel]*alpha+10*(1-alpha);
      samples++;
    }
    for(let channel=0;channel<3;channel++)rgb.push(Math.round(accum[channel]/samples));
  }
  return {width:img.width,height:img.height,colors:Buffer.from(rgb).toString("base64")};
}

export function verifyVisual(key,buffer,{maxMeanDelta=10,maxDimensionDelta=9}={}) {
  const observed=visualFingerprint(buffer);
  if(settings.mode==="record"){
    // An initial capture is NOT a valid release baseline: switch to enforce,
    // commit reviewed signatures, and remove all capture-mode exceptions.
    console.log("TGL_VISUAL_BASELINE "+JSON.stringify({key,...observed}));
    return;
  }
  if(settings.mode!=="enforce")throw Error("Visual regression mode must be enforce");
  const expected=settings.baselines[key];
  if(!expected)throw Error("Unapproved visual baseline: "+key);
  if(Math.abs(observed.width-expected.width)>maxDimensionDelta||
     Math.abs(observed.height-expected.height)>maxDimensionDelta)
    throw Error("Visual dimensions changed for "+key+": "+observed.width+"x"+observed.height);
  const actual=Buffer.from(observed.colors,"base64");
  const reference=Buffer.from(expected.colors,"base64");
  if(actual.length!==reference.length || actual.length!==288)
    throw Error("Incompatible visual baseline for "+key);
  let delta=0;let severe=0;
  for(let i=0;i<actual.length;i++){
    const distance=Math.abs(actual[i]-reference[i]);
    delta+=distance;
    if(distance>55)severe++;
  }
  const mean=delta/actual.length;
  if(mean>maxMeanDelta||severe>Math.floor(actual.length*.16))
    throw Error("Visual regression "+key+": mean RGB delta "+mean.toFixed(1)+", severely changed channels "+severe);
}

/**
 * Bootstrap additional browser/viewport signatures while preserving enforcement
 * on existing signatures. Missing entries are emitted to CI logs for review.
 * The independent check-release-contract script MUST reject missing keys,
 * keeping every staging build blocked until the new entries are approved.
 */
export function verifyOrCaptureNewVisual(key,buffer){
  if(!settings.baselines?.[key]){
    console.log("TGL_VISUAL_BASELINE "+JSON.stringify({key,...visualFingerprint(buffer)}));
    return;
  }
  verifyVisual(key,buffer);
}
