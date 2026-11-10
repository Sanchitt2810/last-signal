// Last Signal: The Harrow Point Killings — Chapter 1 "The Party"
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, collide, ROOM, HALL } from './world.js';
import { preloadChar, loadClips, makeActor } from './chars.js';
import * as S from './audio.js';
import { Net, code5 } from './net.js';

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const touch = matchMedia('(pointer: coarse)').matches;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TINTS = [null, '#7a8cff', '#ff8a7a', '#8affb0', '#ffd27a', '#c58aff', '#7affef', '#ff7ad2', '#b0b0b0', '#a0703a', '#ffffff', '#7aa0ff', '#ffb07a', '#9aff7a', '#ff7a7a', '#7affff'];
const CHARS = ['riya', 'dev', 'nolan'];
const CHAT = ['Over here!', 'Follow me', 'Wait for me', 'I found something', 'Did you hear that?', 'RUN!', 'I\'m scared', 'Where are you?'];

// ---------------------------------------------------------------- renderer
const LEVELS = [{ name: 'Low', pr: .7, shadow: 512, bloom: false }, { name: 'Medium', pr: 1, shadow: 1024, bloom: true }, { name: 'High', pr: Math.min(devicePixelRatio, 1.6), shadow: 2048, bloom: true }];
const TEST = /lowtest/.test(location.search);
if (TEST) LEVELS[0].pr = .45;
let qi = touch || TEST ? 0 : 1, autoQ = !TEST;
let renderer, scene, camera, composer, grainPass, W = null; // W = world refs
const G = window.Game = { ready: false, started: false, fear: 1, voices: true };

const GrainShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, amt: { value: .06 }, vig: { value: .9 }, red: { value: 0 }, desat: { value: 0 } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform float time,amt,vig,red,desat;varying vec2 vUv;
  float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+time*7.)*43758.5453);}
  void main(){vec2 d=vUv-.5;float ca=.0025*(1.+red*4.);vec3 c=vec3(texture2D(tDiffuse,vUv+d*ca).r,texture2D(tDiffuse,vUv).g,texture2D(tDiffuse,vUv-d*ca).b);
  c+= (h(vUv*vec2(1920.,1080.))-.5)*amt;float v=smoothstep(.85,.2,length(d)*vig);c*=mix(.35,1.,v);
  float l=dot(c,vec3(.3,.59,.11));c=mix(c,vec3(l)*vec3(.8,.9,1.1),desat);c=mix(c,c*vec3(1.6,.25,.2)+vec3(.12,0.,0.),red);gl_FragColor=vec4(c,1.);}`
};

function setupRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3; renderer.outputColorSpace = THREE.SRGBColorSpace;
  $('stage').appendChild(renderer.domElement);
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, .03, 80); scene.add(camera);
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer && composer.setSize(innerWidth, innerHeight); });
}
function applyQuality() {
  const q = LEVELS[qi]; renderer.setPixelRatio(q.pr); renderer.setSize(innerWidth, innerHeight);
  for (const l of [W.lights.moon, W.lights.street, flash]) { l.shadow.mapSize.set(q.shadow, q.shadow); if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; } }
  composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  if (q.bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), .45, .5, .82));
  composer.addPass(new OutputPass()); grainPass = new ShaderPass(GrainShader); composer.addPass(grainPass);
  $('qual').textContent = q.name + (autoQ ? ' · auto' : '');
}

// ---------------------------------------------------------------- state
const net = new Net();
const me = { id: 'solo', name: 'You', char: 'dev', tint: null, x: 1.8, z: 1.6, yaw: .7, pitch: -.08, alive: true, anim: 'idle', flash: false, stamina: 1 };
const players = new Map(); // id -> remote player
let kabir, killer, winFig, crossFig, body, myAvatar; let flash;
const npc = { kabir: { x: -.15, z: .75, yaw: .9, anim: 'talk', vis: true, path: [], speed: 1.3 }, killer: { x: -3.2, z: -12, yaw: 0, anim: 'idle', vis: false, speed: 2.35 } };
const gates = { hall: true, back: false };
let beat = 'lobby', beatT = 0, dark = false, chase = false, ended = false;
const host = () => net.isHost;
const ids = () => [me.id, ...players.keys()];
const alivePlayers = () => [{ id: me.id, x: me.x, z: me.z, alive: me.alive }, ...[...players.values()].map(p => ({ id: p.id, x: p.x, z: p.z, alive: p.alive }))].filter(p => p.alive);
const nameOf = id => id === me.id ? me.name : (players.get(id)?.name || 'someone');

// ---------------------------------------------------------------- preload (runs during the title screen)
G.preload = async (onProgress) => {
  if (G._pre) return G._pre;
  return G._pre = (async () => {
    setupRenderer(); const manager = new THREE.LoadingManager(); let lastPct = 0;
    manager.onProgress = (u, l, t) => { lastPct = Math.max(lastPct, l / t); onProgress && onProgress(lastPct * .85, 'Loading Harrow Point…'); };
    W = await buildWorld(scene, manager, m => onProgress && onProgress(lastPct * .85, m));
    onProgress && onProgress(.86, 'Waking everyone up…');
    await Promise.all(['kabir', ...CHARS].map(n => preloadChar('a/chars', n, new THREE.TextureLoader(manager))));
    await loadClips('a/anim', ['idle', 'talk', 'walk', 'run', 'flashlight', 'creep', 'laugh', 'wait']);
    kabir = await makeActor('kabir'); scene.add(kabir.obj); kabir.play('talk');
    killer = await makeActor('nolan', { silhouette: true }); killer.obj.visible = false; scene.add(killer.obj);
    addMask(killer.obj, true);
    winFig = await makeActor('dev', { silhouette: true }); winFig.obj.position.copy(W.windowSpot); winFig.obj.visible = false; scene.add(winFig.obj); addMask(winFig.obj, true);
    crossFig = await makeActor('nolan', { silhouette: true }); crossFig.obj.visible = false; scene.add(crossFig.obj); addMask(crossFig.obj, false); crossFig.play('walk', 0);
    body = await makeActor('kabir'); body.obj.visible = false; scene.add(body.obj);
    // flashlight
    flash = new THREE.SpotLight(0xfff0dc, 0, 16, .42, .8, 1.6); flash.position.set(.16, -.18, 0); camera.add(flash); camera.add(flash.target); flash.target.position.set(0, -.1, -4); flash.castShadow = true; flash.shadow.bias = -.0004;
    await new Promise(r => { if (manager.itemsLoaded >= manager.itemsTotal) r(); else manager.onLoad = r; setTimeout(r, 25000); });
    applyQuality(); onProgress && onProgress(1, 'Ready.'); G.ready = true;
    renderer.compile(scene, camera);
  })();
};

// ---------------------------------------------------------------- lobby / networking
G.host = async ({ name, char, mic }) => {
  me.name = name; me.char = char; const code = code5(); await net.hostRoom(code); me.id = net.myId; G.code = code; wireNet();
  if (mic) { await net.enableMic(); } return code;
};
G.join = async ({ code, name, char, mic }) => {
  me.name = name; me.char = char; if (mic) await net.enableMic(); await net.joinRoom(code); me.id = net.myId; wireNet();
  net.send({ t: 'hello', name, char }); G.code = code;
};
G.solo = ({ name, char }) => { me.name = name || 'You'; me.char = char; };
G.lobbyList = () => [{ id: me.id, name: me.name + ' (you)', char: me.char }, ...[...players.values()].map(p => ({ id: p.id, name: p.name, char: p.char }))];
G.onLobby = null;

function roster() { return [{ id: me.id, name: me.name, char: me.char, tint: me.tint }, ...[...players.values()].map(p => ({ id: p.id, name: p.name, char: p.char, tint: p.tint }))]; }
async function addPlayer(r) {
  if (r.id === me.id || players.has(r.id)) return; const p = { id: r.id, name: r.name, char: CHARS.includes(r.char) ? r.char : 'dev', tint: r.tint, x: 1.8, z: 1.6, tx: 1.8, tz: 1.6, yaw: 0, tyaw: 0, anim: 'idle', flash: false, alive: true, actor: null, talking: false };
  players.set(r.id, p);
  if (G.ready) { p.actor = await makeActor(p.char, { tint: p.tint }); scene.add(p.actor.obj); p.cone = cone(); p.actor.obj.add(p.cone); p.label = label(p.name); p.actor.obj.add(p.label); }
  G.onLobby && G.onLobby(); if (net.mic) net.callAll([r.id]);
}
function removePlayer(id) { const p = players.get(id); if (!p) return; if (p.actor) scene.remove(p.actor.obj); players.delete(id); net.dropVoice(id); G.onLobby && G.onLobby(); if (G.started) toast(`${p.name} lost signal.`); }
function wireNet() {
  net.on('hello', async m => { // host: someone joined
    const used = new Set(roster().map(r => r.tint)); const tint = TINTS.find(t => !used.has(t)) ?? null; const r = { id: m.from, name: String(m.name).slice(0, 16), char: m.char, tint };
    await addPlayer(r); net.relay({ t: 'roster', list: roster() }); net.sendTo(m.from, { t: 'welcome', list: roster(), beat, started: G.started, fear: G.fear, recap: recap() });
  });
  net.on('welcome', async m => { for (const r of m.list) { if (r.id === me.id) me.tint = r.tint; else await addPlayer(r); } G.fear = m.fear; if (m.started) { G.lateRecap = m.recap; G.startGame(m.beat); } });
  net.on('roster', async m => { const keep = new Set(m.list.map(r => r.id)); for (const id of [...players.keys()]) if (!keep.has(id)) removePlayer(id); for (const r of m.list) { if (r.id === me.id) me.tint = r.tint; else await addPlayer(r); } });
  net.on('leave', m => { removePlayer(m.from); net.relay({ t: 'roster', list: roster() }); });
  net.on('hostgone', () => { toast('The host lost signal. Room closed.', 6); setTimeout(() => location.reload(), 6000); });
  net.on('start', m => { G.fear = m.fear; G.startGame(m.beat); });
  net.on('me', m => { const p = players.get(m.from); if (!p) return; [p.tx, p.tz, p.tyaw, p.pitch] = m.p; p.anim = m.a; p.flash = m.f; if (p.alive !== m.al) { p.alive = m.al; } if (host()) { } });
  net.on('W', m => { for (const [id, s] of Object.entries(m.ps)) { if (id === me.id) continue; const p = players.get(id); if (!p) continue; [p.tx, p.tz, p.tyaw, p.anim, p.flash, p.alive] = s; } if (m.k) applyNpc(npc.kabir, m.k); if (m.m) applyNpc(npc.killer, m.m); });
  net.on('beat', m => { if (m.id !== beat) enterBeat(m.id, m.arg); });
  net.on('fx', m => fx(m.k, m.a, true));
  net.on('act', m => { if (host()) hostAct(m.k, m.from); });
  net.on('chat', m => { if (host()) net.relay(m, m.from); showChat(m.id || m.from, m.i); });
  net.on('ptt', m => { if (host()) net.relay(m, m.from); const id = m.id || m.from; const p = players.get(id); if (!p) return; p.talking = m.on && (m.to === 'all' || m.to === me.id); net.hear(id, p.talking, !p.alive); talkHud(); });
  net.on('caught', m => onCaught(m.id, m.v));
  net.on('neterr', m => toast('Signal trouble: ' + m.e));
}
function applyNpc(n, s) { [n.x, n.z, n.yaw, n.anim, n.vis] = s; }
G.startRoom = () => { if (!host()) return; net.send({ t: 'start', beat: 'cold', fear: G.fear }); G.startGame('cold'); };

// ---------------------------------------------------------------- the mask: a pale, featureless face on the figure
function addMask(obj, glow) {
  const head = obj.getObjectByName('head'); if (!head) return;
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 120, 20, 128, 128, 140); g.addColorStop(0, '#e9e4d6'); g.addColorStop(1, '#a29c8c'); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#050403'; [[88, 118], [168, 118]].forEach(([ex, ey]) => { x.beginPath(); x.ellipse(ex, ey, 20, 13, 0, 0, 7); x.fill(); });
  x.strokeStyle = 'rgba(60,40,30,.55)'; x.lineWidth = 3; x.beginPath(); x.moveTo(96, 190); x.quadraticCurveTo(128, 196, 160, 190); x.stroke();
  for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(80,60,40,${Math.random() * .12})`; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.SphereGeometry(.105, 24, 16, Math.PI / 2 - 1.1, 2.2, .35, 2.3); geo.scale(.82, 1.15, .78);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, roughness: .55, emissive: glow ? 0x221d16 : 0x000000, emissiveMap: t }));
  m.position.set(0, .085, .04); head.add(m);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(.135, 18, 14, Math.PI / 2 + .95, Math.PI * 2 - 1.9, 0, 2.2), new THREE.MeshStandardMaterial({ color: 0x030303, roughness: .95, side: THREE.DoubleSide })); hood.scale.set(1, 1.15, 1.05); hood.position.set(0, .1, -.025); head.add(hood);
}

// ---------------------------------------------------------------- avatars helpers
function cone() { const g = new THREE.Mesh(new THREE.ConeGeometry(.9, 4, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: .045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); g.geometry.translate(0, -2, 0); g.geometry.rotateX(-Math.PI / 2); g.position.set(.2, 1.35, .2); g.rotation.y = Math.PI; g.visible = false; const lens = new THREE.Mesh(new THREE.SphereGeometry(.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); g.add(lens); return g; }
function label(text) { const c = document.createElement('canvas'); c.width = 256; c.height = 48; const x = c.getContext('2d'); x.font = '600 26px IBM Plex Mono, monospace'; x.textAlign = 'center'; x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(0, 6, 256, 36); x.fillStyle = '#e6e3d8'; x.fillText(text.slice(0, 14), 128, 33); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.set(.55, .1, 1); s.position.y = 1.95; return s; }

// ---------------------------------------------------------------- HUD
let subQ = Promise.resolve();
function line(who, text, sec = 3.2, { voice = null, color = null } = {}) {
  subQ = subQ.then(async () => {
    const el = $('sub'); el.innerHTML = (who ? `<b style="${color ? 'color:' + color : ''}">${who}</b>` : '') + text; el.classList.add('on');
    if (voice && G.voices) voice();
    await sleep(sec * 1000); el.classList.remove('on'); await sleep(250);
  }); return subQ;
}
const K = (t, s) => line('Kabir', t, s || Math.max(2.4, t.length * .065), { voice: () => S.say(t, { pitch: .95, rate: 1.05, voice: 1 }) });
const RADIO = (t, s) => line('162.55 MHz', t, s || Math.max(3, t.length * .085), { color: 'var(--alarm)', voice: () => S.radioVoice(t, W.radioPos, { pitch: .1, rate: .7 }) });
function objective(t) { const o = $('obj'); o.classList.remove('on'); setTimeout(() => { o.querySelector('span').textContent = t; o.classList.toggle('on', !!t); }, 300); if (t) S.click(); }
function toast(t, sec = 3) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = t; $('toasts').appendChild(el); setTimeout(() => el.remove(), sec * 1000); }
function card(lines, sec = 3) { const c = $('card'); c.innerHTML = lines.map(l => `<div>${l}</div>`).join(''); c.classList.add('on'); setTimeout(() => c.classList.remove('on'), sec * 1000); }
function showChat(id, i) { const n = nameOf(id); toast(`${n}: “${CHAT[i]}”`, 3.5); S.squelch(false); const p = players.get(id); if (p && p.actor) { const b = label(CHAT[i]); b.position.y = 2.15; b.scale.set(.8, .14, 1); p.actor.obj.add(b); setTimeout(() => p.actor.obj.remove(b), 3500); } }
function talkHud() { const t = [...players.values()].filter(p => p.talking).map(p => (p.alive ? '' : '☠ ') + p.name); $('talkers').textContent = t.length ? '▮ ' + t.join(', ') : ''; }
let flashHud = 0;
function whiteFlash(k = 1, col = '#fff') { const f = $('flashov'); f.style.background = col; f.style.transition = 'none'; f.style.opacity = k; requestAnimationFrame(() => { f.style.transition = 'opacity 1.4s'; f.style.opacity = 0; }); }

// ---------------------------------------------------------------- the story
const RECAP = {
  cold: 'Storm night on Harrow Point.', arrive: 'You arrived at Kabir\'s birthday party.', cake: 'Kabir is turning 24. The cake is waiting.', photo: 'Kabir wanted a group photo.', radio: 'Kabir asked for music on his old radio.',
  dark: 'The radio read out Kabir\'s name. Then the power died.', find: 'Kabir went to the breaker. Something hit the floor.', hall: 'Kabir is missing. His phone is ringing in the hallway.', yard: 'The marks lead outside, into the rain.', chase: 'Something is in the yard with you.', end: ''
};
const ORDER = ['cold', 'arrive', 'cake', 'photo', 'radio', 'dark', 'find', 'hall', 'yard', 'chase', 'end'];
function recap() { const i = ORDER.indexOf(beat); return ORDER.slice(0, Math.max(0, i + 1)).map(b => RECAP[b]).filter(Boolean); }
function advance(id, arg) { if (!host() || beat === id) return; net.send({ t: 'beat', id, arg }); enterBeat(id, arg); }
function fx(k, a, remote) { if (!remote && host()) net.send({ t: 'fx', k, a }); FX[k] && FX[k](a); }

const FX = {
  thunder: a => { S.thunder(a ?? .3); lightning(); },
  windowFigure: () => { winFig.obj.visible = true; winFig.obj.lookAt(V3(-1, 0, 0)); setTimeout(() => winFig.obj.visible = false, 650); },
  candles: () => { W.flames.forEach(f => f.visible = true); W.lights.candle.intensity = 2.2; },
  radioOn: () => { G.music = S.radioMusic(W.radioPos); },
  radioOff: () => { G.music && G.music.stop(); },
  eas: () => { G.music && G.music.stop(); S.staticBurst(1.5, .3, W.radioPos); setTimeout(() => S.eas(W.radioPos), 1200); },
  lightsOut: () => setDark(true),
  hallDoor: v => { W.doors.hall.userData.target = v; gates.hall = v > .5; if (v < .5) S.creak(V3(3.2, 1, .9), .2); else S.creak(V3(3.2, 1, .9), .15); },
  slamHall: () => { W.doors.hall.userData.target = 0; W.doors.hall.userData.fast = true; gates.hall = false; S.slam(V3(3.2, 1, .9)); },
  backDoor: v => { W.doors.back.userData.target = v; gates.back = v > .5; if (v > .5) S.creak(V3(3.95, 1, -6), .25); },
  slamBack: () => { W.doors.back.userData.target = 0; W.doors.back.userData.fast = true; gates.back = false; S.slam(V3(3.95, 1, -6)); },
  thud: () => { S.thud(V3(4, 1, -3)); setTimeout(() => S.glass(V3(4, 1.5, -3.5)), 200); },
  scream: () => S.scream(V3(4, 1.4, -4)),
  phone: on => { W.phone.obj.visible = true; W.phone.light.intensity = on ? .9 : .2; if (on && !G.ring) G.ring = S.phoneRing(V3(4.05, .1, -3.4)); if (!on && G.ring) { G.ring(); G.ring = null; } },
  phoneText: () => { W.drawPhone('UNKNOWN', 'did you tell them yet?'); },
  marks: () => { W.drag.visible = true; },
  spark: () => { S.spark(W.fuse.pos); W.lights.spark.intensity = 6; setTimeout(() => W.lights.spark.intensity = 0, 90); },
  fuseFlicker: async () => {
    W.fuse.door.rotation.y = -1.4; for (let i = 0; i < 7; i++) { setLights(Math.random() < .6 ? .7 : 0); S.spark(W.fuse.pos); await sleep(60 + Math.random() * 140); }
    setLights(.9); W.wallMsg.visible = true; S.stinger(0); await sleep(1800); setLights(0); await sleep(200); setLights(.5); await sleep(70); setLights(0);
  },
  cross: () => { crossFig.obj.visible = true; crossFig.obj.position.set(3.4, 0, -5.6); crossFig.obj.rotation.y = Math.PI / 2; crossFig.t = 0; S.creak(V3(4, 1, -5.6), .2); },
  streetOff: async () => { for (let i = 0; i < 6; i++) { W.lights.street.intensity = i % 2 ? 40 : 4; await sleep(80 + Math.random() * 120); } W.lights.street.intensity = 0; S.spark(V3(-3, 4, -11.4)); },
  whisper: name => { RADIO(`…the following name has been selected… ${name}.`, 4); setTimeout(() => RADIO('…no. Not yet.', 2.4), 5200); },
  shot: () => takePhoto(),
  kline: t => K(t, 2.2),
};
function setLights(k) { W.lights.ceil.intensity = 1.8 * k; W.lights.hall.intensity = 2.5 * k; W.lights.hall2.intensity = 1.6 * k; W.lights.lamp.intensity = 6 * k; W.party.visible = k > .3; }
function setDark(on) {
  dark = on; setLights(on ? 0 : 1); scene.environmentIntensity = on ? .035 : .12; W.lights.moon.intensity = on ? 30 : 60; W.lights.hemi.intensity = on ? .05 : .25; me.flash = on; W.lights.radio.color.set(on ? 0xff3020 : 0x7fd0ff);
  if (on) { S.setDread(.7); S.setHeart(64); S.stinger(1); }
}
let lightningT = 0;
function lightning() { lightningT = .5; }

async function enterBeat(id, arg) {
  beat = id; beatT = 0; const B = BEATS[id]; if (!B) return; $('chapter').textContent = B.title || $('chapter').textContent;
  try { await B.enter(arg); } catch (e) { console.error(e); }
}
// Each beat: enter() runs on every device; host() branches drive NPCs + transitions.
const BEATS = {
  cold: {
    title: 'Chapter 1 · The Party', async enter() {
      G.cine = { t: 0, dur: 19 }; $('hud').classList.add('cine'); S.setRain(1, false); S.setDread(.25);
      setTimeout(() => G.cine && card(['Harrow Point', '<small>11:42 PM · the storm is getting worse</small>'], 5), 1500);
      setTimeout(() => G.cine && RADIO('…weather service for Harrow Point. Stay indoors tonight. Keep this frequency open.', 6), 7000);
      setTimeout(() => G.cine && card(['Kabir is turning twenty-four.', '<small>You came anyway.</small>'], 4.5), 13000);
      await sleep(19000); if (G.cine) endCine();
    }
  },
  arrive: {
    title: 'Chapter 1 · The Party', async enter() {
      endCine(); S.setRain(1, true); S.setDread(.08); npc.kabir.anim = 'talk';
      await K('There you are! I thought the storm ate you.'); await K('Okay, okay. Nobody touch the cake yet.');
      objective('Wish Kabir happy birthday'); W.interact.kabir.on = true;
    }
  },
  cake: {
    async enter(who) {
      W.interact.kabir.on = false; await K(`Thank you, ${who || 'my friend'}! You actually remembered.`); await K('Candles. Someone light the candles before Riya eats it.');
      objective('Light the candles'); W.interact.cake.on = true;
    }
  },
  photo: {
    async enter() {
      W.interact.cake.on = false; FX.candles(); const dur = S.musicBox([[392, .75], [392, .25], [440, 1], [392, 1], [523, 1], [494, 2], [392, .75], [392, .25], [440, 1], [392, 1], [587, 1], [523, 2]], V3(-.55, .6, -.4));
      card(['♪'], 2); await sleep(dur * 1000 + 300);
      npc.kabir.anim = 'laugh'; await K('Twenty-four. Old man now.'); npc.kabir.anim = 'talk';
      await K('I wished for something. Tell you later… maybe.', 3);
      await K('Photo first! Everyone over by the sofa. Squeeze in.');
      objective('Group photo: stand by the sofa'); if (host()) { npc.kabir.path = [[-.15, -1.25]]; G.photoWait = 0; }
    }
  },
  radio: {
    async enter() {
      objective(''); await K('That photo is going on my wall. Music! Somebody turn the radio on. The old one. Just twist the knob.');
      objective('Turn on the radio'); W.interact.radio.on = true; if (host()) npc.kabir.path = [[.8, .2]];
    }
  },
  dark: {
    async enter() {
      W.interact.radio.on = false; objective(''); FX.radioOn(); await sleep(9000); FX.eas(); await sleep(4400);
      await RADIO('This is Harrow Point emergency frequency. One six two point five five.', 4.5);
      await RADIO('The following name has been selected.', 3.5); await sleep(600); await RADIO('Kabir.', 2.2);
      npc.kabir.anim = 'laugh'; await K('Ha. Ha. Very funny. Who paid the radio guy? Dev?'); npc.kabir.anim = 'wait';
      await sleep(800); S.thunder(.1); lightning(); FX.windowFigure(); S.stinger(2); await sleep(600);
      setDark(true); S.staticBurst(1.6, .25, W.radioPos); $('hint').textContent = touch ? 'Flashlight is on' : 'F: flashlight';
      await sleep(1500); await K('Okay. That is the storm. Breaker is in the hallway.'); await K('Stay here. Don\'t touch my cake.');
      if (host()) { npc.kabir.path = [[2.6, .9], [3.95, .9], [3.95, -2.9]]; npc.kabir.onArrive = () => advance('find'); }
    }
  },
  find: {
    async enter() {
      await sleep(400); FX.hallDoor(0); await sleep(5000); FX.spark(); await sleep(3500); FX.thud(); FX.scream(); npc.kabir.vis = false; S.setHeart(92); S.setDread(1);
      await sleep(2500); line('', '[ silence ]', 2.5);
      await sleep(4000); if (host()) { const ap = alivePlayers(); const pick = ap[Math.floor(Math.random() * ap.length)]; fx('whisper', nameOf(pick.id)); }
      await sleep(9000); objective('Find Kabir'); W.interact.hallDoor.on = true;
    }
  },
  hall: {
    async enter() {
      W.interact.hallDoor.on = false; FX.hallDoor(1.4); FX.phone(true); FX.marks(); W.interact.phone.on = true; W.interact.fuse.on = true; objective('Find Kabir');
      if (host()) G.crossDone = false;
    }
  },
  yard: {
    async enter() {
      objective('Follow the marks'); FX.backDoor(1.4); S.thunder(.4); lightning(); S.setRain(1, false);
      body.obj.visible = true; body.obj.position.set(4.6, .16, -10.4); body.obj.rotation.set(Math.PI / 2, 0, .4); body.play('idle', 0); body.speed(0);
      W.interact.body.on = true; W.interact.phone.on = false; W.interact.fuse.on = false;
    }
  },
  chase: {
    async enter() {
      W.interact.body.on = false; objective(''); await line('', 'He\'s cold. His jacket is soaked through…', 3); await line('', '…so who has been texting from his phone?', 3);
      FX.streetOff(); await sleep(1400); S.stinger(0); S.setHeart(130); objective('GET BACK INSIDE'); $('obj').classList.add('alarm');
      chase = true; npc.killer.vis = true; if (host()) { npc.killer.x = -3.2; npc.killer.z = -12.3; }
    }
  },
  end: {
    async enter(arg) {
      chase = false; npc.killer.vis = false; objective(''); $('obj').classList.remove('alarm'); FX.slamBack(); S.setHeart(70); await sleep(1500);
      await RADIO('Nine names remain.', 3); await RADIO('The next one is closer than you think.', 4); await sleep(800); finish(arg === 'lost');
    }
  },
};

// host-side per-frame story logic
function hostUpdate(dt) {
  const k = npc.kabir;
  if (k.path.length) { const [tx, tz] = k.path[0]; const dx = tx - k.x, dz = tz - k.z, d = Math.hypot(dx, dz); if (d < .08) { k.path.shift(); if (!k.path.length) { k.anim = beat === 'dark' ? 'idle' : 'talk'; if (k.onArrive) { const f = k.onArrive; k.onArrive = null; f(); } } } else { const s = Math.min(d, k.speed * dt); k.x += dx / d * s; k.z += dz / d * s; k.yaw = Math.atan2(dx, dz); k.anim = 'walk'; } }
  if (beat === 'photo' && G.photoWait !== undefined) {
    G.photoWait += dt; const all = alivePlayers().every(p => p.x > -2.4 && p.x < 1.2 && p.z > -1.6 && p.z < .6);
    if ((all && G.photoWait > 3) || G.photoWait > 28) { G.photoWait = undefined; (async () => { fx('kline', 'Three… two… one!'); await sleep(2400); fx('shot'); await sleep(2500); advance('radio'); })(); }
  }
  if (beat === 'hall' && !G.crossDone && alivePlayers().some(p => p.x > 3.3 && p.z < .6)) { G.crossDone = true; setTimeout(() => fx('cross'), 700); }
  if (beat === 'yard') { if (!G.marksLine && alivePlayers().some(p => p.z < -6.3)) { G.marksLine = true; } }
  if (chase) {
    const kk = npc.killer; const outside = alivePlayers().filter(p => W.outdoors(p.x, p.z));
    if (outside.length) {
      let best = null, bd = 1e9; for (const p of outside) { const d = Math.hypot(p.x - kk.x, p.z - kk.z); if (d < bd) { bd = d; best = p; } }
      const sp = npc.killer.speed * [0.82, 1, 1.15][G.fear] * (beatT < 2 ? .4 : 1); const dx = best.x - kk.x, dz = best.z - kk.z; kk.x += dx / bd * sp * dt; kk.z += dz / bd * sp * dt; if (kk.x > 3.0) kk.z = Math.min(kk.z, -6.4); if (kk.z > -2.9) kk.z = -2.9; kk.yaw = Math.atan2(dx, dz); kk.anim = bd > 4 ? 'creep' : 'run';
      if (bd < .7) { const v = Math.floor(Math.random() * 3); net.send({ t: 'caught', id: best.id, v }); onCaught(best.id, v); }
    } else { kk.anim = 'idle'; kk.yaw = Math.atan2(3.95 - kk.x, -6 - kk.z); }
    const ap = alivePlayers(); if (!ap.length) advance('end', 'lost'); else if (ap.every(p => !W.outdoors(p.x, p.z)) && beatT > 3) advance('end', 'won');
  }
}
// interactions arrive here on the host
function hostAct(k, from) {
  const I = W.interact; const who = nameOf(from);
  if (k === 'kabir' && I.kabir.on && beat === 'arrive') advance('cake', who);
  else if (k === 'cake' && I.cake.on && beat === 'cake') advance('photo');
  else if (k === 'radio' && I.radio.on && beat === 'radio') advance('dark');
  else if (k === 'hallDoor' && I.hallDoor.on && beat === 'find') advance('hall');
  else if (k === 'fuse' && I.fuse.on) { I.fuse.on = false; fx('fuseFlicker'); }
  else if (k === 'phone' && I.phone.on) { I.phone.on = false; fx('phone', false); fx('phoneText'); setTimeout(() => { fx('slamHall'); setTimeout(() => { fx('hallDoor', 1.4); advance('yard'); }, 3500); }, 2600); toastAll(`${who} picked up Kabir's phone.`); }
  else if (k === 'body' && I.body.on && beat === 'yard') advance('chase');
  else if (k === 'frontDoor') { }
}
function toastAll(t) { toast(t); net.send({ t: 'fx', k: 'toast', a: t }); }
FX.toast = t => toast(t);
function use(k) {
  if (k === 'frontDoor') { S.creak(V3(3.95, 1, 2.5), .1); toast('Locked. The key is on Kabir\'s keyring.'); return; }
  if (k === 'phone') { line('', 'UNKNOWN: “did you tell them yet?”', 4); }
  if (host()) hostAct(k, me.id); else net.send({ t: 'act', k });
}

// ---------------------------------------------------------------- the group photo (the window is behind the sofa)
function takePhoto() {
  S.shutter(); const pc = new THREE.PerspectiveCamera(50, camera.aspect, .05, 40); pc.position.set(-.55, 1.45, 1.9); pc.lookAt(-.8, 1.2, -2.6);
  const wasVis = winFig.obj.visible; winFig.obj.visible = true; winFig.obj.position.set(-1.05, 0, -3.15); winFig.obj.lookAt(-1.05, 0, 0);
  if (myAvatar) myAvatar.obj.visible = true; const fl = flash.intensity; flash.intensity = 0;
  const pf = new THREE.PointLight(0xffffff, 18, 8, 2); pf.position.copy(pc.position); scene.add(pf);
  renderer.render(scene, pc); const url = renderer.domElement.toDataURL('image/jpeg', .85);
  scene.remove(pf); winFig.obj.visible = wasVis; if (myAvatar) myAvatar.obj.visible = false; flash.intensity = fl;
  whiteFlash(1); const p = $('photo'); p.querySelector('img').src = url; p.classList.add('on');
  setTimeout(() => { p.classList.add('look'); S.stinger(1); }, 2600); setTimeout(() => p.classList.remove('on', 'look'), 7200);
}

// ---------------------------------------------------------------- caught
let caughtAnim = null;
function onCaught(id, v) {
  if (id === me.id) {
    if (!me.alive) return; me.alive = false; caughtAnim = { t: 0, v, from: camera.position.clone(), yaw: me.yaw };
    S.stinger(v === 1 ? 1 : 0); if (v === 2) S.scream(camera.position); whiteFlash(.8, v === 1 ? '#000' : '#600'); navigator.vibrate && navigator.vibrate([80, 40, 200]);
  } else { const p = players.get(id); if (p) { p.alive = false; toast(`${p.name} was taken.`, 4); S.scream(V3(p.x, 1.5, p.z)); } }
}
function caughtUpdate(dt) {
  const c = caughtAnim; c.t += dt; const kk = killer.obj.position;
  if (c.v === 0) { // face snap
    const face = V3(kk.x, 1.62, kk.z); const dir = V3(me.x - kk.x, 0, me.z - kk.z).normalize(); camera.position.copy(face).addScaledVector(dir, .32); camera.lookAt(face); camera.position.x += (Math.random() - .5) * .02 * Math.max(0, 1 - c.t);
  } else if (c.v === 1) { // pulled down backwards
    const k = Math.min(1, c.t / .6); camera.position.set(me.x, 1.6 - k * 1.35, me.z); camera.rotation.set(-.2 + k * 1.6, c.yaw + k * .8, k * .6, 'YXZ');
  } else { // lights die, it stands over you
    camera.position.set(me.x, .25, me.z); camera.lookAt(kk.x, 1.7, kk.z);
  }
  grainPass.uniforms.red.value = Math.max(0, .9 - c.t * .3); grainPass.uniforms.amt.value = .3;
  if (c.t > 2.6 && !c.done) { c.done = true; $('dead').classList.add('on'); setTimeout(() => { $('dead').classList.remove('on'); caughtAnim = null; grainPass.uniforms.desat.value = .85; grainPass.uniforms.red.value = 0; grainPass.uniforms.amt.value = .09; toast('You are a ghost now. Your walkie still works. They can hear you, faintly.', 6); }, 3500); }
}

// ---------------------------------------------------------------- cinematic
function endCine() { if (!G.cine) return; G.cine = null; $('hud').classList.remove('cine'); if (host() && beat === 'cold') advance('arrive'); }
G.skipCine = () => { if (host()) endCine(); else toast('Waiting for the host…'); };
function cineUpdate(dt) {
  const c = G.cine; c.t += dt; const k = Math.min(1, c.t / c.dur), e = k * k * (3 - 2 * k);
  const a = V3(-3.6, 1.7, -13.2), b = V3(-1.0, 1.45, -3.35); camera.position.lerpVectors(a, b, e); camera.position.y += Math.sin(c.t * .7) * .03;
  camera.lookAt(-.95, 1.35 - e * .1, -1.2);
  if (c.t > 4 && c.t < 4.1) lightning(), S.thunder(.6);
}

// ---------------------------------------------------------------- controls
const keys = {}; let drag = null; const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; const lk = { id: null, x: 0, y: 0 };
let talkTo = 'all', talking = false, wheelOpen = false, nearI = null;
function setupControls() {
  const cv = renderer.domElement;
  addEventListener('keydown', e => {
    if (!G.started) return; keys[e.code] = true;
    if (e.code === 'KeyE' && nearI) use(nearI);
    if (e.code === 'KeyF' && dark) me.flash = !me.flash;
    if (e.code === 'KeyT' && !e.repeat) ptt(true);
    if (e.code === 'KeyC') cycleChannel();
    if (e.code === 'KeyQ') toggleWheel();
    if (wheelOpen && /^Digit[1-8]$/.test(e.code)) sendChat(+e.code.slice(5) - 1);
    if (e.code === 'Space' && G.cine) G.skipCine();
  });
  addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyT') ptt(false); });
  cv.addEventListener('click', () => { if (!touch && G.started && !document.pointerLockElement) cv.requestPointerLock && cv.requestPointerLock(); });
  addEventListener('mousemove', e => { if (document.pointerLockElement === cv) { me.yaw -= e.movementX * .0022; me.pitch = Math.max(-1.3, Math.min(1.3, me.pitch - e.movementY * .0022)); } });
  cv.addEventListener('pointerdown', e => {
    if (!touch) { if (!document.pointerLockElement) drag = { x: e.clientX, y: e.clientY }; return; }
    if (e.clientX < innerWidth * .45 && joy.id === null) { joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; const j = $('joy'); j.style.left = e.clientX + 'px'; j.style.top = e.clientY + 'px'; j.style.display = 'block'; }
    else if (lk.id === null) { lk.id = e.pointerId; lk.x = e.clientX; lk.y = e.clientY; }
  });
  addEventListener('pointermove', e => {
    if (touch) {
      if (e.pointerId === joy.id) { let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const m = Math.hypot(dx, dy); if (m > 55) { dx *= 55 / m; dy *= 55 / m; } joy.x = dx / 55; joy.y = dy / 55; $('joy').firstElementChild.style.transform = `translate(${dx}px,${dy}px)`; }
      if (e.pointerId === lk.id) { me.yaw -= (e.clientX - lk.x) * .0065; me.pitch = Math.max(-1.3, Math.min(1.3, me.pitch - (e.clientY - lk.y) * .0065)); lk.x = e.clientX; lk.y = e.clientY; }
    } else if (drag) { me.yaw -= (e.clientX - drag.x) * .005; me.pitch = Math.max(-1.3, Math.min(1.3, me.pitch - (e.clientY - drag.y) * .005)); drag = { x: e.clientX, y: e.clientY }; }
  });
  const end = e => { if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; $('joy').style.display = 'none'; } if (e.pointerId === lk.id) lk.id = null; drag = null; };
  addEventListener('pointerup', end); addEventListener('pointercancel', end);
  $('bUse').onclick = () => nearI && use(nearI);
  const bt = $('bTalk'); bt.addEventListener('pointerdown', e => { e.preventDefault(); ptt(true); }); ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => bt.addEventListener(ev, () => ptt(false)));
  $('bChan').onclick = cycleChannel; $('bChat').onclick = toggleWheel; $('bSkip').onclick = () => G.skipCine();
  $('wheel').querySelectorAll('button').forEach((b, i) => b.onclick = () => sendChat(i));
  $('bQual').onclick = () => { autoQ = false; qi = (qi + 1) % LEVELS.length; applyQuality(); };
}
function ptt(on) {
  if (on === talking) return; if (on && !net.mic) { if (net.online) toast('Mic is off. Allow the microphone to use the walkie-talkie.'); if (net.online) net.enableMic().then(ok => { if (ok) net.callAll([...players.keys()]); }); return; }
  talking = on; net.talk(on); S.squelch(on); $('bTalk').classList.toggle('on', on); net.send({ t: 'ptt', id: me.id, on, to: talkTo });
}
function cycleChannel() { const list = ['all', ...players.keys()]; talkTo = list[(list.indexOf(talkTo) + 1) % list.length] || 'all'; $('bChan').textContent = talkTo === 'all' ? 'All' : nameOf(talkTo).slice(0, 8); S.click(); }
function toggleWheel() { wheelOpen = !wheelOpen; $('wheel').classList.toggle('on', wheelOpen); }
function sendChat(i) { wheelOpen = false; $('wheel').classList.remove('on'); net.send({ t: 'chat', id: me.id, i }); showChat(me.id, i); }

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock(); let frames = 0, acc = 0, low = 0, high = 0, bob = 0, stepT = 0, sendT = 0, breathT = 4, scareT = 25;
function loop() {
  requestAnimationFrame(loop); const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime; beatT += dt;
  // ---- me
  if (G.cine) cineUpdate(dt);
  else if (caughtAnim) caughtUpdate(dt);
  else {
    let mx = 0, mz = 0, run = false; if (touch) { mx = joy.x; mz = joy.y; run = Math.hypot(mx, mz) > .92; } else { if (keys.KeyW || keys.ArrowUp) mz -= 1; if (keys.KeyS || keys.ArrowDown) mz += 1; if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1; run = keys.ShiftLeft || keys.ShiftRight; const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; } }
    const moving = Math.hypot(mx, mz) > .1; run = run && moving && me.stamina > .05; me.stamina = Math.max(0, Math.min(1, me.stamina + (run ? -dt / 5 : dt / 7)));
    const sp = (run ? 3.1 : 1.75) * dt, s = Math.sin(me.yaw), c = Math.cos(me.yaw);
    if (moving) { const nx = me.x + (mx * c + mz * s) * sp, nz = me.z + (-mx * s + mz * c) * sp; [me.x, me.z] = collide(W, me.x, me.z, nx, nz, gates); bob += dt * (run ? 12 : 8); stepT -= dt * (run ? 1.7 : 1); if (stepT <= 0) { stepT = .5; S.step(V3(me.x, 0, me.z), W.outdoors(me.x, me.z) ? 'grass' : 'wood', run ? .35 : .22); } }
    me.anim = moving ? (run ? 'run' : 'walk') : 'idle';
    camera.position.set(me.x, 1.62 + Math.sin(bob) * (run ? .035 : .02), me.z); camera.rotation.set(me.pitch, me.yaw, Math.sin(bob * .5) * .004, 'YXZ');
    $('stam').style.width = (me.stamina * 100) + '%'; $('stamw').classList.toggle('on', me.stamina < .98);
  }
  flash.intensity = me.flash && dark ? 18 * (1 - Math.random() * .03 * (chase ? 3 : 1)) : 0;
  // ---- interactables near me
  nearI = null; if (me.alive && !G.cine) { let bd = 9; for (const [k, I] of Object.entries(W.interact)) { if (!I.on && k !== 'frontDoor') continue; if (k === 'kabir') I.pos.set(npc.kabir.x, 1.2, npc.kabir.z); const d = Math.hypot(I.pos.x - me.x, I.pos.z - me.z); if (d < I.r && d < bd) { bd = d; nearI = k; } } }
  $('bUse').hidden = !nearI; if (nearI) $('bUse').querySelector('span').textContent = W.interact[nearI].label;
  // ---- host logic + sync
  if (host()) hostUpdate(dt);
  sendT -= dt; if (sendT <= 0 && net.online) {
    sendT = .1; const mine = [+me.x.toFixed(2), +me.z.toFixed(2), +me.yaw.toFixed(2), +me.pitch.toFixed(2)];
    if (host()) { const ps = { [me.id]: [mine[0], mine[1], mine[2], me.anim, me.flash, me.alive] }; for (const p of players.values()) ps[p.id] = [p.tx, p.tz, p.tyaw, p.anim, p.flash, p.alive]; const k = npc.kabir, m = npc.killer; net.send({ t: 'W', ps, k: [k.x, k.z, k.yaw, k.anim, k.vis], m: [m.x, m.z, m.yaw, m.anim, m.vis] }); }
    else net.send({ t: 'me', p: mine, a: me.anim, f: me.flash, al: me.alive });
  }
  // ---- remote players
  for (const p of players.values()) {
    if (!p.actor) continue; const k = 1 - Math.exp(-dt * 10); p.x += (p.tx - p.x) * k; p.z += (p.tz - p.z) * k; let dy = p.tyaw - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.yaw += dy * k;
    const o = p.actor.obj; o.position.set(p.x, 0, p.z); o.rotation.y = p.yaw + Math.PI; o.visible = p.alive || !me.alive; p.actor.play(p.anim === 'run' ? 'run' : p.anim === 'walk' ? 'walk' : (dark ? 'flashlight' : 'idle')); p.actor.update(dt);
    if (p.cone) p.cone.visible = p.flash && dark && p.alive; if (p.label) p.label.visible = Math.hypot(p.x - me.x, p.z - me.z) < 5 && !dark;
    if (!p.alive && me.alive) o.visible = false;
  }
  // ---- NPCs
  const kn = npc.kabir; kabir.obj.visible = kn.vis && !G.cine || (G.cine && kn.vis); kabir.obj.position.lerp(V3(kn.x, 0, kn.z), 1 - Math.exp(-dt * 10)); kabir.obj.rotation.y = kn.yaw; kabir.play(kn.anim); kabir.update(dt);
  const kk = npc.killer; killer.obj.visible = kk.vis; if (kk.vis) { killer.obj.position.lerp(V3(kk.x, 0, kk.z), 1 - Math.exp(-dt * 12)); killer.obj.rotation.y = kk.yaw; killer.play(kk.anim); killer.update(dt); }
  if (crossFig.obj.visible) { crossFig.t += dt; crossFig.obj.position.x = 3.4 + crossFig.t * 1.1; crossFig.update(dt); if (crossFig.t > 1.3) crossFig.obj.visible = false; }
  winFig.update(dt);
  if (myAvatar) { myAvatar.obj.position.set(me.x, 0, me.z); myAvatar.obj.rotation.y = me.yaw + Math.PI; myAvatar.play(me.anim); myAvatar.update(dt); }
  // ---- world animation
  const fl = .85 + Math.sin(t * 13) * .08 + Math.sin(t * 29) * .05; if (W.flames[0].visible) { W.lights.candle.intensity = (dark ? 1.4 : 2.2) * fl; W.flames.forEach((f, i) => f.scale.y = 2 + Math.sin(t * 20 + i) * .3); }
  if (!dark) W.lights.lamp.intensity = 6 * (.95 + Math.sin(t * 7) * .05); else W.lights.radio.intensity = 2.5 * (.6 + .4 * Math.sin(t * 5));
  for (const d of Object.values(W.doors)) { const u = d.userData; u.open += (u.target - u.open) * Math.min(1, dt * (u.fast ? 18 : 2.2)); if (Math.abs(u.target - u.open) < .01) u.fast = false; d.rotation.y = u.base + u.open * (u.dir || 1); }
  if (W.phone.obj.visible && G.ring) W.phone.light.intensity = .6 + .4 * Math.sin(t * 8);
  const a = W.rain.geometry.attributes.position.array; for (let i = 0; i < a.length; i += 6) { a[i + 1] -= dt * 9; a[i + 4] -= dt * 9; if (a[i + 4] < 0) { a[i + 1] += 6; a[i + 4] += 6; } } W.rain.geometry.attributes.position.needsUpdate = true;
  if (lightningT > 0) { lightningT -= dt; const on = (lightningT > .42 || (lightningT > .25 && lightningT < .32)) ? 1 : 0; W.lights.lightning.intensity = on * 6; scene.backgroundIntensity = .18 + on * 1.2; } else { W.lights.lightning.intensity = 0; scene.backgroundIntensity = .18; }
  if (G.started && !G.cine && beat !== 'end') { scareT -= dt; if (scareT <= 0) { scareT = 30 + Math.random() * 40; if (host()) fx('thunder', .3 + Math.random() * .5); } }
  // teammates breathing near you in the dark
  if (dark && me.alive) { breathT -= dt; if (breathT <= 0) { breathT = 3 + Math.random() * 4; for (const p of players.values()) if (p.alive && Math.hypot(p.x - me.x, p.z - me.z) < 3.5 && !p.flash) S.breath(V3(p.x, 1.5, p.z), .07); } }
  // ---- audio
  S.setListener(camera); S.tick(dt); if (!G.cine) S.setRain(1, !W.outdoors(camera.position.x, camera.position.z));
  if (chase && me.alive) { const d = Math.hypot(kk.x - me.x, kk.z - me.z); S.setHeart(d < 4 ? 150 : d < 8 ? 120 : 95); grainPass.uniforms.red.value = Math.max(0, .35 - d * .04); }
  // ---- render
  grainPass.uniforms.time.value = t; composer.render();
  frames++; acc += dt; if (acc >= 1) { const f = frames / acc; $('fps').textContent = Math.round(f); if (autoQ) { if (f < 28) { low++; high = 0; if (low >= 3 && qi > 0) { qi--; applyQuality(); low = 0; } } else if (f > 57) { high++; low = 0; if (high >= 5 && qi < LEVELS.length - 1) { qi++; applyQuality(); high = 0; } } else low = high = 0; } frames = 0; acc = 0; }
}

// ---------------------------------------------------------------- start / finish
G.startGame = async (startBeat = 'cold') => {
  if (G.started) return; await G.preload(); G.started = true; S.initAudio(); window.__menuHide && window.__menuHide();
  me.tint = me.tint ?? null; myAvatar = await makeActor(me.char, { tint: me.tint }); myAvatar.obj.visible = false; scene.add(myAvatar.obj);
  for (const p of players.values()) if (!p.actor) { p.actor = await makeActor(p.char, { tint: p.tint }); scene.add(p.actor.obj); p.cone = cone(); p.actor.obj.add(p.cone); p.label = label(p.name); p.actor.obj.add(p.label); }
  // spawn spread around the room
  const spots = [[1.8, 1.6], [1.2, 1.9], [2.3, 1.0], [.6, 1.9], [-.5, 1.9], [-1.4, 1.7], [-2.2, 1.4], [1.6, .3], [2.4, 2.0], [-2.4, .6], [0, 2.1], [1.0, 1.2], [-1.0, 1.1], [2.6, -.2], [-2.6, 2.0], [.3, 1.4]];
  const order = [me.id, ...players.keys()].sort(); const si = order.indexOf(me.id) % 16; [me.x, me.z] = spots[si]; me.yaw = Math.atan2(me.x + .15, me.z - .75);
  if (startBeat !== 'cold') catchUp(startBeat);
  $('menuRoot').hidden = true; $('hud').hidden = false; $('hint').textContent = touch ? 'Left thumb: walk (push far to run) · Right: look' : 'WASD walk · Shift run · E use · T talk · Q quick chat · click to look';
  if (!net.online) { $('bTalk').hidden = true; $('bChan').hidden = true; } $('bChat').hidden = !net.online;
  setupControls(); loop();
  if (G.lateRecap && G.lateRecap.length) card(['Previously…', ...G.lateRecap.slice(-3).map(s => `<small>${s}</small>`)], 6);
  enterBeat(startBeat);
};
function finish(lost) {
  ended = true; const e = $('end'); e.querySelector('h2').textContent = lost ? 'Everyone was taken.' : 'Chapter 1 complete';
  e.querySelector('p').innerHTML = lost ? 'The yard is quiet again. The radio is still on.' : 'Kabir is dead. Someone in that house knew he would be.<br>And someone has been texting from his phone.';
  e.classList.add('on'); S.setDread(.3); S.setHeart(0);
}
G.LEVELS = LEVELS;
G.initAudio = () => S.initAudio();
G.debug = { advance: (b, a) => advance(b, a), me, npc, W: () => W, cam: () => camera, setDark, FX, players };
function catchUp(b) {
  const i = ORDER.indexOf(b), past = x => i > ORDER.indexOf(x);
  endCine(); G.cine = null; $('hud').classList.remove('cine'); S.setRain(1, true);
  if (past('cake')) FX.candles();
  if (past('radio')) setDark(true);
  if (past('dark')) { npc.kabir.vis = false; }
  if (past('find')) { FX.marks(); FX.phone(false); }
  if (past('hall')) { FX.backDoor(1.4); body.obj.visible = true; body.obj.position.set(4.6, .16, -10.4); body.obj.rotation.set(Math.PI / 2, 0, .4); }
}
