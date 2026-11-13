/**
 * The Green Locker's private vault entrance & original synthesized feedback.
 * No audio assets, third-party requests, sales calls, or user-identifying storage.
 * Sound and vibration are strictly opt-in, only attempted on user gestures.
 */
(() => {
  "use strict";
  const portal = document.getElementById("locker-entry-portal");
  if (!portal) return;

  const replay = document.getElementById("locker-entry-replay");
  const enter = document.getElementById("member-enter-vault");
  const browse = document.querySelector(".member-secondary[href='/catalog']");
  const skip = portal.querySelector(".locker-entry-skip");
  const heading = document.querySelector(".private-title h1, .member-hero h1");
  const background = [...document.querySelectorAll(
    ".private-header,.private-notice,.private-title,.catalog-grid,.member-dashboard,.private-footer"
  )];
  const profileInputs = [...document.querySelectorAll("[data-vault-profile]")];
  const audition = document.querySelector("[data-vault-audition]");
  const hapticSwitch = document.querySelector("[data-vault-haptics]");
  const hint = document.querySelector("[data-vault-feedback-hint]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const seenKey = "tgl:vault-entry:v3";
  const preferenceKey = "tgl:vault-feedback:v2";
  const legacyPreferenceKey = "tgl:vault-feedback:v1";
  const durationMs = 2250;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  const vibrationSupported = typeof navigator.vibrate === "function";
  let prefs = { profile: "silent", haptics: false };
  let active = false;
  let timeout = null;
  let audioContext = null;
  let activeMaster = null;
  let returnFocus = heading;
  let destination = "";
  const inertStates = new Map();

  function hasSeen() {
    try { return sessionStorage.getItem(seenKey) === "1"; } catch { return false; }
  }
  function remember() {
    try { sessionStorage.setItem(seenKey, "1"); } catch { /* Optional storage. */ }
  }
  try {
    let stored = JSON.parse(localStorage.getItem(preferenceKey) || "null");
    if (!stored || typeof stored !== "object") {
      // Preserve explicitly enabled audio from the previous on/off setting.
      const old = JSON.parse(localStorage.getItem(legacyPreferenceKey) || "{}");
      stored = {
        profile: old?.sound === true ? "classic" : "silent",
        haptics: old?.haptics === true
      };
    }
    prefs.profile = AudioCtor && ["classic","cinematic"].includes(stored.profile)
      ? stored.profile : "silent";
    prefs.haptics = stored.haptics === true && vibrationSupported;
  } catch { /* Private browsing or disabled storage is fine. */ }
  function save() {
    try { localStorage.setItem(preferenceKey, JSON.stringify(prefs)); }
    catch { /* Preferences remain active only for this page. */ }
  }
  function describeSupport() {
    if (!hint) return;
    const unavailable = [];
    if (!AudioCtor) unavailable.push("Sound is unavailable in this browser.");
    if (!vibrationSupported) unavailable.push("Haptics are not supported by this browser (including most iPhone browsers).");
    hint.textContent = unavailable.length ? unavailable.join(" ") :
      "Select a soundscape to preview it. No sound plays automatically.";
  }
  for (const option of profileInputs) {
    option.checked = option.value === prefs.profile;
    option.disabled = option.value !== "silent" && !AudioCtor;
    option.addEventListener("change",() => {
      if (!option.checked) return;
      prefs.profile = ["classic","cinematic"].includes(option.value) && AudioCtor
        ? option.value : "silent";
      quiet();
      save();
      describeSupport();
    });
  }
  audition?.addEventListener("click",() => {
    if (prefs.profile === "silent") {
      if (hint) hint.textContent = "Silent mode: audio remains off.";
      return;
    }
    playSound();
    if (hint) hint.textContent = prefs.profile === "cinematic"
      ? "Previewing Cinematic: layered machinery and a gold release."
      : "Previewing Classic: soft tumblers and a warm chime.";
  });
  describeSupport();
  
  if (hapticSwitch) {
    hapticSwitch.checked = prefs.haptics;
    hapticSwitch.disabled = !vibrationSupported;
    hapticSwitch.addEventListener("change", () => {
      prefs.haptics = hapticSwitch.checked && vibrationSupported;
      save();
      if (!prefs.haptics && vibrationSupported) { try { navigator.vibrate(0); } catch {} }
    });
  }
  describeSupport();

  function quiet() {
    if (activeMaster && audioContext) {
      try {
        const t = audioContext.currentTime;
        activeMaster.gain.cancelScheduledValues(t);
        activeMaster.gain.setTargetAtTime(0, t, 0.015);
      } catch { /* Audio context may have closed. */ }
    }
    activeMaster = null;
    if (vibrationSupported) { try { navigator.vibrate(0); } catch {} }
  }

  // Short bespoke, deliberately quiet mechanical effects. Never called on automatic playback.
  function playSound() {
    if (prefs.profile === "silent" || !AudioCtor) return;
    try {
      if (!audioContext) audioContext = new AudioCtor();
      if (audioContext.state === "suspended") void audioContext.resume().catch(() => {});
      quiet();
      const ctx = audioContext;
      const start = ctx.currentTime + 0.02;
      const master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
      activeMaster = master;

      const voice = ({type="sine",from,to=from,at=0,duration=0.18,level=0.035}) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(Math.max(20,from), start+at);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(20,to), start+at+duration);
        gain.gain.setValueAtTime(0.0001,start+at);
        gain.gain.exponentialRampToValueAtTime(level,start+at+Math.min(0.05,duration*0.3));
        gain.gain.exponentialRampToValueAtTime(0.0001,start+at+duration);
        oscillator.connect(gain).connect(master);
        oscillator.start(start+at);
        oscillator.stop(start+at+duration+0.025);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      };

      if (prefs.profile === "classic") {
        // Original close-up tumblers, restrained low mechanism, warm chime.
        voice({type:"triangle",from:240,to:95,at:0.02,duration:0.11,level:0.022});
        voice({type:"triangle",from:210,to:110,at:0.21,duration:0.11,level:0.022});
        voice({type:"sawtooth",from:74,to:45,at:0.30,duration:0.85,level:0.009});
        voice({type:"sine",from:150,to:90,at:0.55,duration:0.58,level:0.031});
        voice({type:"sine",from:440,to:550,at:1.23,duration:0.54,level:0.023});
        voice({type:"sine",from:659,to:880,at:1.42,duration:0.58,level:0.018});
        voice({type:"sine",from:990,to:880,at:1.58,duration:0.34,level:0.009});
      } else if (prefs.profile === "cinematic") {
        // Broader, film-style layered metallic mechanism with capped output.
        voice({type:"triangle",from:330,to:125,at:0.02,duration:0.17,level:0.018});
        voice({type:"triangle",from:240,to:82,at:0.18,duration:0.19,level:0.021});
        voice({type:"sawtooth",from:69,to:36,at:0.24,duration:1.18,level:0.008});
        voice({type:"sine",from:92,to:51,at:0.30,duration:1.14,level:0.036});
        voice({type:"triangle",from:140,to:65,at:0.64,duration:0.66,level:0.017});
        voice({type:"sine",from:329.6,to:440,at:1.15,duration:0.72,level:0.020});
        voice({type:"sine",from:554.4,to:740,at:1.30,duration:0.78,level:0.020});
        voice({type:"sine",from:830,to:1108,at:1.42,duration:0.67,level:0.013});
        voice({type:"triangle",from:1245,to:880,at:1.58,duration:0.57,level:0.009});
      }
    } catch {
      // Supported browsers may reject Web Audio in restricted playback contexts.
      quiet();
      if (hint) hint.textContent = "Sound playback was blocked by the browser; the vault still opens normally.";
    }
  }
  function playHaptics() {
    if (!prefs.haptics || !vibrationSupported) return;
    try { navigator.vibrate([12,65,10]); } catch { /* Unsupported vibration quietly degrades. */ }
  }

  function finish({continueToDestination=true}={}) {
    if (!active) return;
    active = false;
    if (timeout !== null) window.clearTimeout(timeout);
    timeout = null;
    quiet();
    portal.classList.remove("is-opening");
    for (const [element, previous] of inertStates) element.inert = previous;
    inertStates.clear();
    document.body.classList.remove("locker-entry-active");
    const restoreFocus = portal.contains(document.activeElement) || document.activeElement === document.body;
    portal.hidden = true;
    const to = destination;
    destination = "";
    if (to && continueToDestination) {
      window.location.assign(to);
      return;
    }
    if (restoreFocus && returnFocus) {
      if (returnFocus === heading) heading?.setAttribute("tabindex","-1");
      returnFocus.focus({preventScroll:true});
    }
  }

  function begin({opener=heading,to="",withFeedback=false}={}) {
    remember();
    if (reducedMotion.matches || document.visibilityState === "hidden") {
      if (to) window.location.assign(to);
      return;
    }
    if (active) finish({continueToDestination:false});
    active = true;
    returnFocus = opener;
    destination = to;
    portal.hidden = false;
    portal.classList.remove("is-opening");
    for (const element of background) {
      inertStates.set(element, element.inert);
      element.inert = true;
    }
    document.body.classList.add("locker-entry-active");
    if (withFeedback) { playSound(); playHaptics(); }
    void portal.offsetWidth;
    portal.classList.add("is-opening");
    skip?.focus({preventScroll:true});
    timeout = window.setTimeout(() => finish(),durationMs);
  }

  if (replay) {
    replay.hidden = reducedMotion.matches;
    replay.addEventListener("click",() => begin({opener:replay,withFeedback:true}));
  }
  if (enter) {
    enter.addEventListener("click", event => {
      // Respect modifier keys and target behavior.
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      begin({opener:enter,to:"/catalog",withFeedback:true});
    });
  }
  if (browse) browse.addEventListener("click",remember);

  skip?.addEventListener("click",() => finish());
  document.addEventListener("keydown",event => {
    if (!active) return;
    if (event.key === "Escape") {
      event.preventDefault();
      finish({continueToDestination:false});
    } else if (event.key === "Tab") {
      // Only the Skip intro button is interactive in the modal.
      event.preventDefault();
      skip?.focus({preventScroll:true});
    }
  });
  document.addEventListener("visibilitychange",() => {
    if (document.visibilityState === "hidden") finish({continueToDestination:false});
  });
  reducedMotion.addEventListener?.("change",() => {
    if (replay) replay.hidden = reducedMotion.matches;
    if (reducedMotion.matches) finish({continueToDestination:true});
  });
  // Catalog direct visits get a silent entrance; dashboard visitors choose when to unlock.
  if (replay && !reducedMotion.matches && !hasSeen()) begin();
  else if (replay) remember();
})();
