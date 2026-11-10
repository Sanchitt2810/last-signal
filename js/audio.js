// Procedural sound for Last Signal: no audio files, everything is synthesized live.
export const A = { ctx: null, ready: false };
let C, master, comp, verb, verbSend, rainG, rainF, droneG, droneF, music = null, heart = { t: 0, rate: 0 }, listener;
const noiseBuf = {};
function noise(sec = 2, color = 'white') {
  const k = color + sec; if (noiseBuf[k]) return noiseBuf[k];
  const b = C.createBuffer(1, C.sampleRate * sec, C.sampleRate), d = b.getChannelData(0); let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (color === 'brown') { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
  return noiseBuf[k] = b;
}
function src(buf, loop = false) { const s = C.createBufferSource(); s.buffer = buf; s.loop = loop; return s; }
function env(g, t, a, peak, d, end = 0.0001) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); }
function impulse(sec = 3.2, decay = 2.6) {
  const len = C.sampleRate * sec, b = C.createBuffer(2, len, C.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
  return b;
}
export function initAudio() {
  if (A.ready) { if (C.state === 'suspended') C.resume(); return; }
  C = A.ctx = new (window.AudioContext || window.webkitAudioContext)();
  comp = C.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(C.destination);
  master = C.createGain(); master.gain.value = .9; master.connect(comp);
  verb = C.createConvolver(); verb.buffer = impulse(); verbSend = C.createGain(); verbSend.gain.value = .35; verbSend.connect(verb); verb.connect(master);
  listener = C.listener;
  // rain bed: two noise layers (hiss + body), muffled indoors
  rainG = C.createGain(); rainG.gain.value = 0; rainF = C.createBiquadFilter(); rainF.type = 'lowpass'; rainF.frequency.value = 900;
  const r1 = src(noise(4), true), h = C.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = 400; r1.connect(h); h.connect(rainF);
  const r2 = src(noise(4, 'brown'), true), g2 = C.createGain(); g2.gain.value = .6; r2.connect(g2); g2.connect(rainF);
  rainF.connect(rainG); rainG.connect(master); r1.start(); r2.start();
  // drips: random little ticks
  setInterval(() => { if (!A.ready || rainG.gain.value < .05) return; const t = C.currentTime; for (let i = 0; i < 3; i++) { const o = C.createOscillator(), g = C.createGain(); o.frequency.value = 1800 + Math.random() * 2200; env(g, t + Math.random() * .3, .002, .02 * rainG.gain.value, .05); o.connect(g); g.connect(rainF); o.start(t); o.stop(t + .5); } }, 260);
  // dread drone
  droneG = C.createGain(); droneG.gain.value = 0; droneF = C.createBiquadFilter(); droneF.type = 'lowpass'; droneF.frequency.value = 220; droneF.Q.value = 6;
  [41.2, 41.9, 61.7, 87.3].forEach((f, i) => { const o = C.createOscillator(); o.type = i < 2 ? 'sawtooth' : 'sine'; o.frequency.value = f; const g = C.createGain(); g.gain.value = i < 2 ? .28 : .12; o.connect(g); g.connect(droneF); o.start(); });
  const lfo = C.createOscillator(), lg = C.createGain(); lfo.frequency.value = .07; lg.gain.value = 120; lfo.connect(lg); lg.connect(droneF.frequency); lfo.start();
  droneF.connect(droneG); droneG.connect(master); const ds = C.createGain(); ds.gain.value = .5; droneG.connect(ds); ds.connect(verbSend);
  A.ready = true;
}
const now = () => C.currentTime;
export function setListener(cam) {
  if (!A.ready) return; const p = cam.position, f = cam.getWorldDirection(cam.userData.tmpV || (cam.userData.tmpV = cam.position.clone()));
  const L = listener, t = now();
  if (L.positionX) { L.positionX.setTargetAtTime(p.x, t, .02); L.positionY.setTargetAtTime(p.y, t, .02); L.positionZ.setTargetAtTime(p.z, t, .02); L.forwardX.setTargetAtTime(f.x, t, .02); L.forwardY.setTargetAtTime(f.y, t, .02); L.forwardZ.setTargetAtTime(f.z, t, .02); L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
  else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
}
function panner(pos, ref = 1.5, roll = 1.4) { const p = C.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; if (pos) setPan(p, pos); return p; }
export function setPan(p, pos) { if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z); }
function out(node, pos, wet = .25, ref) { let n = node; if (pos) { const p = panner(pos, ref); node.connect(p); n = p; } n.connect(master); if (wet) { const w = C.createGain(); w.gain.value = wet; n.connect(w); w.connect(verbSend); } return n; }

export function setRain(level, indoors) { if (!A.ready) return; const t = now(); rainG.gain.setTargetAtTime(level * (indoors ? .32 : .75), t, .6); rainF.frequency.setTargetAtTime(indoors ? 700 : 5200, t, .4); }
export function setDread(level) { if (!A.ready) return; droneG.gain.setTargetAtTime(level * .22, now(), 1.5); droneF.frequency.setTargetAtTime(160 + level * 260, now(), 2); }
export function setHeart(rate) { heart.rate = rate; }
export function tick(dt) {
  if (!A.ready || heart.rate <= 0) return; heart.t -= dt;
  if (heart.t <= 0) { heart.t = 60 / heart.rate; const t = now(); [0, .16].forEach((o, i) => { const os = C.createOscillator(), g = C.createGain(); os.frequency.setValueAtTime(58, t + o); os.frequency.exponentialRampToValueAtTime(38, t + o + .12); env(g, t + o, .01, i ? .32 : .45, .16); os.connect(g); g.connect(master); os.start(t + o); os.stop(t + o + .3); }); }
}
export function thunder(dist = .5) {
  if (!A.ready) return; const t = now(), s = src(noise(6, 'brown')), f = C.createBiquadFilter(), g = C.createGain();
  f.type = 'lowpass'; f.frequency.setValueAtTime(1600 - dist * 900, t); f.frequency.exponentialRampToValueAtTime(90, t + 5);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(1.6 - dist, t + .05 + dist * .4); g.gain.exponentialRampToValueAtTime(.4, t + 1.2); g.gain.exponentialRampToValueAtTime(.0001, t + 5.8);
  s.connect(f); f.connect(g); out(g, null, .6); s.start(t); s.stop(t + 6);
  if (dist < .4) { const c = src(noise(1)), cg = C.createGain(), hf = C.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 900; env(cg, t, .003, .9, .25); c.connect(hf); hf.connect(cg); out(cg, null, .5); c.start(t); c.stop(t + 1); }
}
export function staticBurst(dur = 1.2, vol = .3, pos) {
  if (!A.ready) return; const t = now(), s = src(noise(3)), f = C.createBiquadFilter(), g = C.createGain(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = .7;
  g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(vol, t + dur * .7); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  // crackle modulation
  const m = C.createOscillator(), mg = C.createGain(); m.type = 'square'; m.frequency.value = 11; mg.gain.value = vol * .6; m.connect(mg); mg.connect(g.gain); m.start(t); m.stop(t + dur);
  s.connect(f); f.connect(g); out(g, pos, .1); s.start(t); s.stop(t + dur);
}
export function eas(pos) { // emergency alert two-tone
  if (!A.ready) return; const t = now();
  for (let k = 0; k < 3; k++) { [853, 960].forEach(fr => { const o = C.createOscillator(), g = C.createGain(); o.type = 'square'; o.frequency.value = fr; g.gain.setValueAtTime(.0001, t + k * 1.1); g.gain.linearRampToValueAtTime(.05, t + k * 1.1 + .02); g.gain.setValueAtTime(.05, t + k * 1.1 + .85); g.gain.linearRampToValueAtTime(.0001, t + k * 1.1 + .9); const f = C.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1000; o.connect(f); f.connect(g); out(g, pos, .15); o.start(t + k * 1.1); o.stop(t + k * 1.1 + 1); }); }
}
// Radio voice: speech synthesis (low, slow) + static bed.
export function radioVoice(text, pos, { pitch = .3, rate = .78 } = {}) {
  staticBurst(Math.max(2, text.length * .075), .12, pos);
  try { const u = new SpeechSynthesisUtterance(text); u.pitch = pitch; u.rate = rate; u.volume = .9; const v = speechSynthesis.getVoices().find(v => /en(-|_)(US|GB)/.test(v.lang) && /male|david|daniel|fred|alex/i.test(v.name)) || speechSynthesis.getVoices().find(v => /^en/.test(v.lang)); if (v) u.voice = v; speechSynthesis.speak(u); } catch (e) { }
}
export function say(text, { pitch = 1, rate = 1.02, voice = 0 } = {}) {
  try { const u = new SpeechSynthesisUtterance(text); u.pitch = pitch; u.rate = rate; u.volume = .85; const vs = speechSynthesis.getVoices().filter(v => /^en/.test(v.lang)); if (vs.length) u.voice = vs[voice % vs.length]; speechSynthesis.speak(u); } catch (e) { }
}
export function stinger(kind = 0) {
  if (!A.ready) return; const t = now();
  if (kind === 0) { // dissonant string stab + screech
    [220, 233, 311, 466, 659].forEach((f, i) => { const o = C.createOscillator(), g = C.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 1.03, t + 1.6); env(g, t, .015, .09, 1.8); const fl = C.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 3200; o.connect(fl); fl.connect(g); out(g, null, .5); o.start(t); o.stop(t + 2); });
    const s = src(noise(1)), f = C.createBiquadFilter(), g = C.createGain(); f.type = 'bandpass'; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(1200, t + .5); f.Q.value = 8; env(g, t, .005, 1.2, .5); s.connect(f); f.connect(g); out(g, null, .4); s.start(t); s.stop(t + 1);
  } else if (kind === 1) { // low boom + reverse swell
    const o = C.createOscillator(), g = C.createGain(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.5); env(g, t, .01, 1.4, 2.2); o.connect(g); out(g, null, .6); o.start(t); o.stop(t + 2.5);
    const s = src(noise(2, 'brown')), gs = C.createGain(); env(gs, t, .01, .9, 1.4); s.connect(gs); out(gs, null, .8); s.start(t); s.stop(t + 2);
  } else { // metallic scrape
    [523, 587, 1243].forEach(f => { const o = C.createOscillator(), g = C.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * .7, t + 1.2); const m = C.createOscillator(), mg = C.createGain(); m.frequency.value = 37; mg.gain.value = 40; m.connect(mg); mg.connect(o.frequency); m.start(t); m.stop(t + 1.4); env(g, t, .02, .12, 1.3); o.connect(g); out(g, null, .7); o.start(t); o.stop(t + 1.4); });
  }
}
export function riser(sec = 4) { if (!A.ready) return; const t = now(), s = src(noise(6)), f = C.createBiquadFilter(), g = C.createGain(); f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(4000, t + sec); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.25, t + sec); g.gain.setValueAtTime(.0001, t + sec + .01); s.connect(f); f.connect(g); out(g, null, .3); s.start(t); s.stop(t + sec + .1); }
export function step(pos, surface = 'wood', vol = .25) {
  if (!A.ready) return; const t = now(), s = src(noise(1, surface === 'grass' ? 'white' : 'brown')), f = C.createBiquadFilter(), g = C.createGain();
  f.type = surface === 'grass' ? 'bandpass' : 'lowpass'; f.frequency.value = surface === 'grass' ? 1800 + Math.random() * 800 : 380 + Math.random() * 120; env(g, t, .004, vol * (surface === 'grass' ? .35 : 1), surface === 'grass' ? .12 : .09);
  s.connect(f); f.connect(g); out(g, pos, .12, 1); s.start(t, Math.random()); s.stop(t + .3);
  if (surface === 'wood' && Math.random() < .12) creak(pos, .05);
}
export function creak(pos, vol = .12) { if (!A.ready) return; const t = now(), o = C.createOscillator(), g = C.createGain(), f = C.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.setValueAtTime(90 + Math.random() * 40, t); o.frequency.linearRampToValueAtTime(140 + Math.random() * 80, t + .5); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 10; env(g, t, .08, vol, .5); o.connect(f); f.connect(g); out(g, pos, .3); o.start(t); o.stop(t + .7); }
export function knock(pos, n = 3) { if (!A.ready) return; const t = now(); for (let i = 0; i < n; i++) { const s = src(noise(1, 'brown')), f = C.createBiquadFilter(), g = C.createGain(); f.type = 'lowpass'; f.frequency.value = 260; env(g, t + i * .42, .003, 1.4, .18); s.connect(f); f.connect(g); out(g, pos, .5, 2); s.start(t + i * .42); s.stop(t + i * .42 + .3); } }
export function slam(pos) { if (!A.ready) return; const t = now(), s = src(noise(2, 'brown')), f = C.createBiquadFilter(), g = C.createGain(); f.type = 'lowpass'; f.frequency.value = 500; env(g, t, .002, 2.2, .7); s.connect(f); f.connect(g); out(g, pos, .9, 3); s.start(t); s.stop(t + 1.5); }
export function thud(pos) { if (!A.ready) return; const t = now(), o = C.createOscillator(), g = C.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + .3); env(g, t, .003, 1.2, .4); o.connect(g); out(g, pos, .7, 2); o.start(t); o.stop(t + .5); const s = src(noise(1, 'brown')), sg = C.createGain(); env(sg, t, .003, .8, .3); s.connect(sg); out(sg, pos, .6, 2); s.start(t); s.stop(t + .5); }
export function glass(pos) { if (!A.ready) return; const t = now(); for (let i = 0; i < 14; i++) { const o = C.createOscillator(), g = C.createGain(); o.type = 'sine'; o.frequency.value = 2500 + Math.random() * 5000; const d = Math.random() * .4; env(g, t + d, .002, .05, .25 + Math.random() * .4); o.connect(g); out(g, pos, .5); o.start(t + d); o.stop(t + d + .8); } }
export function shutter() { if (!A.ready) return; const t = now(); [0, .07].forEach(o => { const s = src(noise(1)), f = C.createBiquadFilter(), g = C.createGain(); f.type = 'highpass'; f.frequency.value = 2000; env(g, t + o, .001, .5, .04); s.connect(f); f.connect(g); g.connect(master); s.start(t + o); s.stop(t + o + .1); }); }
export function click() { if (!A.ready) return; const t = now(), o = C.createOscillator(), g = C.createGain(); o.type = 'square'; o.frequency.value = 1800; env(g, t, .001, .08, .03); o.connect(g); g.connect(master); o.start(t); o.stop(t + .06); }
export function squelch(on) { if (!A.ready) return; click(); const t = now(), s = src(noise(1)), f = C.createBiquadFilter(), g = C.createGain(); f.type = 'bandpass'; f.frequency.value = 3000; env(g, t, .005, on ? .06 : .12, on ? .08 : .22); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + .4); }
export function spark(pos) { if (!A.ready) return; const t = now(); for (let i = 0; i < 6; i++) { const s = src(noise(1)), f = C.createBiquadFilter(), g = C.createGain(); f.type = 'highpass'; f.frequency.value = 3000; const d = Math.random() * .25; env(g, t + d, .001, .4, .03); s.connect(f); f.connect(g); out(g, pos, .2); s.start(t + d); s.stop(t + d + .1); } const o = C.createOscillator(), g2 = C.createGain(); o.type = 'sawtooth'; o.frequency.value = 60; env(g2, t, .01, .05, .4); o.connect(g2); out(g2, pos, 0); o.start(t); o.stop(t + .5); }
export function phoneRing(pos) { // returns stop()
  if (!A.ready) return () => { }; let alive = true; const ring = () => { if (!alive) return; const t = now(); [0, .5].forEach(o => [1318, 1568].forEach(f => { const os = C.createOscillator(), g = C.createGain(); os.frequency.value = f; g.gain.setValueAtTime(.0001, t + o); g.gain.linearRampToValueAtTime(.06, t + o + .01); g.gain.setValueAtTime(.06, t + o + .35); g.gain.linearRampToValueAtTime(.0001, t + o + .4); os.connect(g); out(g, pos, .3, 1); os.start(t + o); os.stop(t + o + .45); })); setTimeout(ring, 2600); }; ring(); return () => alive = false;
}
export function breath(pos, vol = .08) { if (!A.ready) return; const t = now(); [0, 1.5].forEach((o, i) => { const s = src(noise(2)), f = C.createBiquadFilter(), g = C.createGain(); f.type = 'bandpass'; f.frequency.value = i ? 900 : 1300; f.Q.value = 1.2; g.gain.setValueAtTime(.0001, t + o); g.gain.linearRampToValueAtTime(vol, t + o + .5); g.gain.linearRampToValueAtTime(.0001, t + o + 1.3); s.connect(f); f.connect(g); out(g, pos, .1, .8); s.start(t + o); s.stop(t + o + 1.4); }); }
export function scream(pos) { // short distorted cry, cut off
  if (!A.ready) return; const t = now(); const o = C.createOscillator(), o2 = C.createOscillator(), g = C.createGain(); o.type = 'sawtooth'; o2.type = 'sawtooth';
  o.frequency.setValueAtTime(420, t); o.frequency.linearRampToValueAtTime(610, t + .25); o.frequency.linearRampToValueAtTime(380, t + .6); o2.frequency.setValueAtTime(426, t); o2.frequency.linearRampToValueAtTime(618, t + .25); o2.frequency.linearRampToValueAtTime(372, t + .6);
  const vib = C.createOscillator(), vg = C.createGain(); vib.frequency.value = 7; vg.gain.value = 18; vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
  const f1 = C.createBiquadFilter(), f2 = C.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 900; f1.Q.value = 5; f2.type = 'bandpass'; f2.frequency.value = 2600; f2.Q.value = 6; const m = C.createGain();
  o.connect(f1); o2.connect(f2); f1.connect(m); f2.connect(m); m.connect(g); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.7, t + .06); g.gain.setValueAtTime(.7, t + .55); g.gain.exponentialRampToValueAtTime(.0001, t + .62);
  out(g, pos, .8, 2);[o, o2, vib].forEach(x => { x.start(t); x.stop(t + .7); });
}
// Radio music: a gentle lo-fi loop played from a positioned speaker. Returns {stop, node}
export function radioMusic(pos) {
  if (!A.ready) return { stop() { } }; const bus = C.createGain(); bus.gain.value = .0001; const f = C.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = .5; bus.connect(f); const o = out(f, pos, .2, 1.2);
  bus.gain.exponentialRampToValueAtTime(.5, now() + 1);
  const chords = [[220, 261.6, 329.6, 392], [174.6, 220, 261.6, 329.6], [196, 246.9, 293.7, 349.2], [164.8, 207.7, 246.9, 329.6]];
  const mel = [659, 587, 523, 494, 523, 587, 523, 440]; let bar = 0, alive = true, timer;
  const play = () => {
    if (!alive) return; const t = now(), ch = chords[bar % 4];
    ch.forEach(fr => { const os = C.createOscillator(), g = C.createGain(); os.type = 'triangle'; os.frequency.value = fr; env(g, t, .08, .06, 1.9); os.connect(g); g.connect(bus); os.start(t); os.stop(t + 2.1); });
    for (let i = 0; i < 4; i++) { const tt = t + i * .5; const k = C.createOscillator(), kg = C.createGain(); k.frequency.setValueAtTime(110, tt); k.frequency.exponentialRampToValueAtTime(45, tt + .12); env(kg, tt, .002, i % 2 ? .05 : .2, .15); k.connect(kg); kg.connect(bus); k.start(tt); k.stop(tt + .2); }
    [0, 1].forEach(i => { const tt = t + i * 1 + .5, m = C.createOscillator(), mg = C.createGain(); m.type = 'sine'; m.frequency.value = mel[(bar * 2 + i) % 8]; env(mg, tt, .02, .05, .7); m.connect(mg); mg.connect(bus); m.start(tt); m.stop(tt + .8); });
    bar++; timer = setTimeout(play, 2000);
  }; play();
  return { stop() { alive = false; clearTimeout(timer); bus.gain.setTargetAtTime(.0001, now(), .05); } };
}
export function musicBox(notes, pos) { // [[freq,beats]], beat=.42s
  if (!A.ready) return 0; let t = now() + .1; for (const [f, b] of notes) { if (f) { [1, 2.01].forEach((h, i) => { const o = C.createOscillator(), g = C.createGain(); o.frequency.value = f * h; env(g, t, .004, i ? .02 : .09, b * .42 + .6); o.connect(g); out(g, pos, .5, 1.5); o.start(t); o.stop(t + b * .42 + .8); }); } t += b * .42; } return t - now();
}
export function whoosh() { if (!A.ready) return; const t = now(), s = src(noise(2)), f = C.createBiquadFilter(), g = C.createGain(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3000, t + .35); f.frequency.exponentialRampToValueAtTime(400, t + .8); env(g, t, .3, .35, .5); s.connect(f); f.connect(g); out(g, null, .3); s.start(t); s.stop(t + 1); }
// Voice chat: route a remote stream through a walkie-talkie filter. Returns gain node to open/close.
export function walkieInput(stream) {
  if (!A.ready) return null; const s = C.createMediaStreamSource(stream), hp = C.createBiquadFilter(), lp = C.createBiquadFilter(), ws = C.createWaveShaper(), g = C.createGain();
  hp.type = 'highpass'; hp.frequency.value = 450; lp.type = 'lowpass'; lp.frequency.value = 3000; const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 3); } ws.curve = curve; g.gain.value = 0;
  s.connect(hp); hp.connect(ws); ws.connect(lp); lp.connect(g); g.connect(master); return g;
}
export function setMaster(v) { if (A.ready) master.gain.setTargetAtTime(v, now(), .1); }
