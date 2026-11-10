// Kabir's house on Harrow Point: party room, hallway, back yard. Real CC0 assets (Poly Haven) + PBR textures.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

export const RH = 2.75;
export const ROOM = { x0: -3.2, x1: 3.2, z0: -2.6, z1: 2.6 };
export const HALL = { x0: 3.2, x1: 4.7, z0: -6, z1: 2.6 };
const WIN = { x0: -1.7, x1: -.3, y0: .85, y1: 2.15 };
const HDOOR = { z0: .45, z1: 1.35 }; // room -> hall doorway in wall x=3.2
const BDOOR = { x0: 3.5, x1: 4.4 }; // back door at hall end z=-6

export async function buildWorld(scene, manager, onProgress) {
  const TL = new THREE.TextureLoader(manager); const GL = new GLTFLoader(manager);
  const tex = (p, srgb, rep) => { const t = TL.load(p); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(...rep); t.anisotropy = 4; return t; };
  const pbr = (n, rep, o = {}) => { const b = `a/tex/${n}_`; const arm = tex(b + 'arm.jpg', false, rep); return new THREE.MeshStandardMaterial({ map: tex(b + 'Diffuse.jpg', true, rep), normalMap: tex(b + 'nor_gl.jpg', false, rep), roughnessMap: arm, aoMap: arm, roughness: 1, metalness: 0, ...o }); };
  const cache = {};
  const model = async n => { if (!cache[n]) cache[n] = GL.loadAsync(`a/models/${n}.json`); const o = (await cache[n]).scene.clone(true); o.traverse(c => { if (c.isMesh) { c.castShadow = c.receiveShadow = true; } }); return o; };
  const L = { solids: [], interact: {}, doors: {}, lights: {}, party: null, flick: [] };
  const place = async (n, x, z, ry = 0, { y = null, s = 1, onto = null, solid = true } = {}) => {
    const o = await model(n); o.scale.setScalar(s); o.rotation.y = ry; o.position.set(x, 0, z); o.updateMatrixWorld(true);
    let b = new THREE.Box3().setFromObject(o); const base = onto ? new THREE.Box3().setFromObject(onto).max.y : (y ?? 0); o.position.y += base - b.min.y; scene.add(o); o.updateMatrixWorld(true);
    b = new THREE.Box3().setFromObject(o); if (solid && b.min.y < 1) L.solids.push(b); return o;
  };
  const box = (w, h, d, m, x, y, z, { cast = true, solid = false } = {}) => { const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); k.position.set(x, y, z); k.castShadow = cast; k.receiveShadow = true; scene.add(k); if (solid) L.solids.push(new THREE.Box3().setFromObject(k)); return k; };

  // ---- sky / environment
  const hj = await (await fetch('a/hdri/night.json')).json(); const hb = Uint8Array.from(atob(hj.b64), c => c.charCodeAt(0));
  const hdr = await new RGBELoader().loadAsync(URL.createObjectURL(new Blob([hb]))); hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = hdr; scene.environmentIntensity = .12; scene.background = hdr; scene.backgroundIntensity = .18;
  scene.fog = new THREE.FogExp2(0x070a10, .045);
  onProgress && onProgress('Building the house…');

  // ---- materials
  const wallpaper = w => pbr('decrepit_wallpaper', [w / 1.6, RH / 1.6]);
  const plaster = pbr('white_plaster_rough_01', [3, 2.5]);
  const siding = (w, h) => pbr('weathered_plank_siding', [w / 2, h / 2]);
  const trim = new THREE.MeshStandardMaterial({ color: 0xe7e1d2, roughness: .45 }), dark = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: .55 });
  const wall = (w, h, x, y, z, ry = 0, out = false) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, .14), [out ? siding(w, h) : wallpaper(w), out ? siding(w, h) : wallpaper(w), plaster, plaster, out ? siding(w, h) : wallpaper(w), wallpaper(w)]); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
  // Walls use wallpaper inside; exterior faces get siding via a thin outer shell below.

  // ---- party room
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x1 - ROOM.x0 + 1.5, ROOM.z1 - ROOM.z0), pbr('old_wood_floor', [3.6, 2.5])); floor.rotation.x = -Math.PI / 2; floor.position.x = .75; floor.receiveShadow = true; scene.add(floor);
  const hfloor = new THREE.Mesh(new THREE.PlaneGeometry(HALL.x1 - HALL.x0, HALL.z1 - HALL.z0), pbr('old_wood_floor', [.8, 4.4])); hfloor.rotation.x = -Math.PI / 2; hfloor.position.set((HALL.x0 + HALL.x1) / 2, .001, (HALL.z0 + HALL.z1) / 2); hfloor.receiveShadow = true; scene.add(hfloor);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.8), pbr('dirty_carpet', [1.3, .9])); rug.rotation.x = -Math.PI / 2; rug.position.set(-.3, .006, .1); rug.receiveShadow = true; scene.add(rug);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALL.x1 - ROOM.x0, HALL.z1 - HALL.z0), plaster); ceil.rotation.x = Math.PI / 2; ceil.position.set((ROOM.x0 + HALL.x1) / 2, RH, (HALL.z0 + HALL.z1) / 2); scene.add(ceil);
  const bz = ROOM.z0;
  // back wall with window
  wall(WIN.x0 - ROOM.x0, RH, (ROOM.x0 + WIN.x0) / 2, RH / 2, bz); wall(ROOM.x1 - WIN.x1, RH, (WIN.x1 + ROOM.x1) / 2, RH / 2, bz);
  wall(WIN.x1 - WIN.x0, WIN.y0, (WIN.x0 + WIN.x1) / 2, WIN.y0 / 2, bz); wall(WIN.x1 - WIN.x0, RH - WIN.y1, (WIN.x0 + WIN.x1) / 2, (RH + WIN.y1) / 2, bz);
  wall(ROOM.z1 - ROOM.z0, RH, ROOM.x0, RH / 2, 0, Math.PI / 2); wall(ROOM.x1 - ROOM.x0, RH, 0, RH / 2, ROOM.z1);
  // wall between room and hall, doorway
  wall(HDOOR.z0 - ROOM.z0, RH, ROOM.x1, RH / 2, (ROOM.z0 + HDOOR.z0) / 2, Math.PI / 2); wall(ROOM.z1 - HDOOR.z1, RH, ROOM.x1, RH / 2, (HDOOR.z1 + ROOM.z1) / 2, Math.PI / 2);
  wall(HDOOR.z1 - HDOOR.z0, RH - 2.1, ROOM.x1, (RH + 2.1) / 2, (HDOOR.z0 + HDOOR.z1) / 2, Math.PI / 2);
  // hall walls: outer x=4.7, room-side x=3.2 continues from z0 -2.6 to -6
  wall(HALL.z1 - HALL.z0, RH, HALL.x1, RH / 2, (HALL.z0 + HALL.z1) / 2, Math.PI / 2);
  wall(ROOM.z0 - HALL.z0, RH, HALL.x0, RH / 2, (HALL.z0 + ROOM.z0) / 2, Math.PI / 2);
  wall(HALL.x1 - HALL.x0, RH, (HALL.x0 + HALL.x1) / 2, RH / 2, HALL.z1); // front wall (front door drawn on it)
  wall(BDOOR.x0 - HALL.x0, RH, (HALL.x0 + BDOOR.x0) / 2, RH / 2, HALL.z0); wall(HALL.x1 - BDOOR.x1, RH, (BDOOR.x1 + HALL.x1) / 2, RH / 2, HALL.z0); wall(BDOOR.x1 - BDOOR.x0, RH - 2.1, (BDOOR.x0 + BDOOR.x1) / 2, (RH + 2.1) / 2, HALL.z0);
  // exterior shell: siding planes just outside the walls the yard can see
  const shell = (w, h, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), siding(w, h)); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m); };
  const sh = RH + .5;
  shell(WIN.x0 - ROOM.x0 + .1, sh, (ROOM.x0 + WIN.x0) / 2 - .05, sh / 2, bz - .075, Math.PI); shell(HALL.x0 + .08 - WIN.x1, sh, (WIN.x1 + HALL.x0) / 2, sh / 2, bz - .075, Math.PI);
  shell(WIN.x1 - WIN.x0, WIN.y0, (WIN.x0 + WIN.x1) / 2, WIN.y0 / 2, bz - .075, Math.PI); shell(WIN.x1 - WIN.x0, sh - WIN.y1, (WIN.x0 + WIN.x1) / 2, (sh + WIN.y1) / 2, bz - .075, Math.PI);
  shell(ROOM.z0 - HALL.z0, sh, HALL.x0 - .075, sh / 2, (HALL.z0 + ROOM.z0) / 2, -Math.PI / 2);
  shell(BDOOR.x0 - HALL.x0 + .08, sh, (HALL.x0 + BDOOR.x0) / 2 - .04, sh / 2, HALL.z0 - .075, Math.PI); shell(HALL.x1 + .08 - BDOOR.x1, sh, (BDOOR.x1 + HALL.x1) / 2 + .04, sh / 2, HALL.z0 - .075, Math.PI); shell(BDOOR.x1 - BDOOR.x0, sh - 2.1, (BDOOR.x0 + BDOOR.x1) / 2, (sh + 2.1) / 2, HALL.z0 - .075, Math.PI);
  shell(HALL.z1 - HALL.z0 + .16, sh, HALL.x1 + .075, sh / 2, (HALL.z0 + HALL.z1) / 2, Math.PI / 2); shell(ROOM.z1 - ROOM.z0 + .16, sh, ROOM.x0 - .075, sh / 2, 0, -Math.PI / 2);
  // roof
  const roofM = pbr('grey_roof_tiles', [4, 3]); const rw = HALL.x1 - ROOM.x0 + 1, rd = HALL.z1 - HALL.z0 + 1;
  [-1, 1].forEach(sg => { const r = new THREE.Mesh(new THREE.PlaneGeometry(rw, rd / 2 / Math.cos(.5)), roofM); r.position.set((ROOM.x0 + HALL.x1) / 2, sh + Math.tan(.5) * rd / 4, (HALL.z0 + HALL.z1) / 2 + sg * rd / 4); r.rotation.x = -Math.PI / 2 + sg * -.5 * -1; r.rotation.x = sg > 0 ? -Math.PI / 2 + .5 : -Math.PI / 2 - .5; r.castShadow = true; scene.add(r); });
  // window frame + glass
  const wy0 = WIN.y0, wy1 = WIN.y1, wx0 = WIN.x0, wx1 = WIN.x1;
  box(wx1 - wx0 + .16, .07, .2, trim, (wx0 + wx1) / 2, wy0 - .02, bz + .05); box(wx1 - wx0 + .16, .07, .16, trim, (wx0 + wx1) / 2, wy1 + .02, bz + .02); box(.07, wy1 - wy0, .16, trim, wx0 - .03, (wy0 + wy1) / 2, bz + .02); box(.07, wy1 - wy0, .16, trim, wx1 + .03, (wy0 + wy1) / 2, bz + .02);
  box(.04, wy1 - wy0, .06, trim, (wx0 + wx1) / 2, (wy0 + wy1) / 2, bz); box(wx1 - wx0, .04, .06, trim, (wx0 + wx1) / 2, (wy0 + wy1) / 2, bz);
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0x9fb6cc, roughness: .05, transmission: 0, transparent: true, opacity: .12, metalness: 0, envMapIntensity: 1.5 });
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(wx1 - wx0, wy1 - wy0), glassM); gl.position.set((wx0 + wx1) / 2, (wy0 + wy1) / 2, bz); scene.add(gl);
  box(ROOM.x1 - ROOM.x0, .12, .03, dark, 0, .06, bz + .07, { cast: false });
  // door frames
  const frame = (x, z, ry, w) => { const g = new THREE.Group(); const a = new THREE.Mesh(new THREE.BoxGeometry(.08, 2.14, .18), trim), b = a.clone(), c = new THREE.Mesh(new THREE.BoxGeometry(w + .16, .08, .18), trim); a.position.set(-w / 2 - .04, 1.07, 0); b.position.set(w / 2 + .04, 1.07, 0); c.position.set(0, 2.14, 0); g.add(a, b, c); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g); };
  frame(ROOM.x1, (HDOOR.z0 + HDOOR.z1) / 2, Math.PI / 2, HDOOR.z1 - HDOOR.z0); frame((BDOOR.x0 + BDOOR.x1) / 2, HALL.z0, 0, BDOOR.x1 - BDOOR.x0); frame((HALL.x0 + HALL.x1) / 2, HALL.z1 - .02, 0, .95);
  // doors (pivot groups)
  const doorM = new THREE.MeshStandardMaterial({ color: 0x5b3b22, roughness: .6 });
  const mkDoor = (w, x, z, ry, flip = 1) => { const piv = new THREE.Group(); piv.position.set(x, 0, z); piv.rotation.y = ry; const d = new THREE.Mesh(new THREE.BoxGeometry(w, 2.08, .05), doorM); d.position.set(flip * w / 2, 1.04, 0); d.castShadow = d.receiveShadow = true; const knob = new THREE.Mesh(new THREE.SphereGeometry(.03, 12, 8), new THREE.MeshStandardMaterial({ color: 0xb08a40, metalness: 1, roughness: .3 })); knob.position.set(flip * (w - .08), 1, .05); piv.add(d, knob); scene.add(piv); piv.userData = { base: ry, open: 0, target: 0 }; return piv; };
  L.doors.hall = mkDoor(HDOOR.z1 - HDOOR.z0, ROOM.x1, HDOOR.z0, Math.PI / 2, -1); L.doors.hall.userData.target = 1.4; L.doors.hall.userData.open = 1.4; L.doors.hall.userData.dir = -1;
  L.doors.back = mkDoor(BDOOR.x1 - BDOOR.x0, BDOOR.x0, HALL.z0, 0, 1); L.doors.back.userData.dir = -1;
  L.doors.front = mkDoor(.95, (HALL.x0 + HALL.x1) / 2 - .475, HALL.z1 - .04, 0, 1);

  // ---- furniture
  await place('Sofa_01', -.9, -1.75, 0); await place('ArmChair_01', 1.55, -.9, -Math.PI / 2.6);
  const ct = await place('CoffeeTable_01', -.5, -.35, 0, { s: .9 }); const cake = await place('strawberry_chocolate_cake', -.55, -.4, 0, { onto: ct, solid: false });
  const side = await place('side_table_01', .55, -1.95, 0); const radio = await place('vintage_radio_transceiver', .55, -1.98, -.25, { onto: side, s: .85, solid: false });
  await place('standing_picture_frame_01', .36, -1.85, .5, { onto: side, solid: false }); await place('wooden_bookshelf_worn', 2.6, -2.1, -Math.PI / 2);
  await place('painted_wooden_cabinet', -2.7, -.5, Math.PI / 2); await place('wine_bottles_01', -2.6, -.25, 0, { y: 1.56, solid: false }); await place('vintage_oil_lamp', -2.65, -.85, 0, { y: 1.56, solid: false });
  await place('potted_plant_02', 2.6, 2.1, 0); await place('hanging_picture_frame_02', -2.0, bz + .09, 0, { y: 1.55, solid: false }); await place('wall_clock', 1.4, bz + .08, 0, { y: 1.9, solid: false });
  onProgress && onProgress('Furnishing…');
  await place('cardboard_box_01', 4.3, -4.9, .3, { s: 1 }); await place('cardboard_box_01', 4.35, -4.3, -.2, { s: .8 });
  const hlamp = await place('modern_ceiling_lamp_01', 3.95, -1.2, 0, { y: RH - .45, solid: false });
  // candles
  const cb = new THREE.Box3().setFromObject(cake); L.flames = [];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * 6.283; const c = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, .05, 8), new THREE.MeshStandardMaterial({ color: 0xf0e0d0 })); c.position.set(-.55 + Math.cos(a) * .06, cb.max.y + .025, -.4 + Math.sin(a) * .06); scene.add(c);
    const f = new THREE.Mesh(new THREE.SphereGeometry(.006, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc070 })); f.scale.y = 2; f.position.set(c.position.x, c.position.y + .035, c.position.z); f.visible = false; scene.add(f); L.flames.push(f);
  }
  L.lights.candle = new THREE.PointLight(0xffa050, 0, 5, 2); L.lights.candle.position.set(-.55, cb.max.y + .12, -.4); scene.add(L.lights.candle);
  L.lights.lamp = new THREE.PointLight(0xff9a48, 6, 7, 2); L.lights.lamp.position.set(-2.62, 1.9, -.85); scene.add(L.lights.lamp);
  L.lights.ceil = new THREE.PointLight(0xffd6a0, 1.8, 8, 2); L.lights.ceil.position.set(0, 2.25, .4); scene.add(L.lights.ceil);
  L.lights.hall = new THREE.PointLight(0xffd8a8, 2.5, 7, 2); L.lights.hall.position.set(3.95, 2.1, -1.2); scene.add(L.lights.hall);
  L.lights.hall2 = new THREE.PointLight(0xffd8a8, 1.6, 6, 2); L.lights.hall2.position.set(3.95, 2.3, -4.6); scene.add(L.lights.hall2);
  const rb = new THREE.Box3().setFromObject(radio); L.lights.radio = new THREE.PointLight(0x7fd0ff, .5, 1.4, 2); L.lights.radio.position.set(.55, rb.max.y - .08, rb.max.z + .1); scene.add(L.lights.radio);
  L.lights.moon = new THREE.SpotLight(0x8fb0ff, 60, 18, .5, .4, 1.2); L.lights.moon.position.set(-1.2, 3.6, bz - 3.6); L.lights.moon.target.position.set(-.6, 0, .4); L.lights.moon.castShadow = true; L.lights.moon.shadow.bias = -.0004; scene.add(L.lights.moon, L.lights.moon.target);
  L.lights.hemi = new THREE.HemisphereLight(0x3a4458, 0x120c08, .25); scene.add(L.lights.hemi);
  L.lights.lightning = new THREE.DirectionalLight(0xc8d8ff, 0); L.lights.lightning.position.set(-4, 10, -12); scene.add(L.lights.lightning);
  // party decor
  L.party = new THREE.Group(); scene.add(L.party); const cols = [0xffcf6e, 0xff7a5c, 0x9ad1ff, 0xb4ff8a];
  for (let i = 0; i < 36; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(.018, 8, 6), new THREE.MeshBasicMaterial({ color: cols[i % 4] })); b.position.set(-2.9 + i * .165, 2.55 - Math.sin(i / 35 * Math.PI) * .28, bz + .12); L.party.add(b); }
  for (let i = 0; i < 40; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(.018, 8, 6), new THREE.MeshBasicMaterial({ color: cols[(i + 2) % 4] })); b.position.set(-3.12, 2.5 - Math.sin(i / 39 * Math.PI) * .3, -2.3 + i * .115); L.party.add(b); }
  const pl = new THREE.PointLight(0xffc890, 2.5, 6, 2); pl.position.set(-2.6, 2.3, -.5); L.party.add(pl); const pl2 = new THREE.PointLight(0xffb0a0, 2, 6, 2); pl2.position.set(.5, 2.3, bz + .4); L.party.add(pl2);
  const balloons = new THREE.Group(); scene.add(balloons);
  [[-2.2, 2.35, -2.1, 0xc0232b], [-1.95, 2.2, -2.2, 0xd8a630], [2.2, 2.3, -2.05, 0x2a6fb5], [2.4, 2.15, -1.8, 0xc0232b], [-2.8, 2.25, 1.9, 0xd8a630]].forEach(([x, y, z, c]) => { const m = new THREE.Mesh(new THREE.SphereGeometry(.17, 24, 18), new THREE.MeshPhysicalMaterial({ color: c, roughness: .15, clearcoat: 1 })); m.scale.y = 1.18; m.position.set(x, y, z); m.castShadow = true; balloons.add(m); });
  L.balloons = balloons;
  // banner
  const bc = document.createElement('canvas'); bc.width = 1024; bc.height = 128; const bx = bc.getContext('2d'); bx.fillStyle = '#e9e0cc'; bx.fillRect(0, 0, 1024, 128); bx.fillStyle = '#9b1b22'; bx.font = 'italic 600 74px Georgia'; bx.textAlign = 'center'; bx.fillText('Happy Birthday Kabir', 512, 92);
  const bt = new THREE.CanvasTexture(bc); bt.colorSpace = THREE.SRGBColorSpace; const ban = new THREE.Mesh(new THREE.PlaneGeometry(2.2, .28), new THREE.MeshStandardMaterial({ map: bt, roughness: .9, side: THREE.DoubleSide })); ban.position.set(1.55, 2.3, ROOM.z1 - .1); ban.rotation.y = Math.PI; scene.add(ban);

  // ---- hallway: fuse box, phone, wall message, drag marks
  const fb = new THREE.Group(); const fbBox = new THREE.Mesh(new THREE.BoxGeometry(.06, .5, .38), new THREE.MeshStandardMaterial({ color: 0x8a8f8c, metalness: .8, roughness: .45 })); fb.add(fbBox);
  const fbDoor = new THREE.Mesh(new THREE.BoxGeometry(.01, .48, .36), new THREE.MeshStandardMaterial({ color: 0x9aa09c, metalness: .8, roughness: .4 })); fbDoor.position.set(-.035, 0, 0); fbDoor.geometry.translate(0, 0, .18); fbDoor.position.z = -.18; fb.add(fbDoor);
  fb.position.set(HALL.x1 - .1, 1.55, -3.1); scene.add(fb); L.fuse = { obj: fb, door: fbDoor, pos: fb.position.clone() };
  L.lights.spark = new THREE.PointLight(0x9fd0ff, 0, 3, 2); L.lights.spark.position.set(HALL.x1 - .3, 1.55, -3.1); scene.add(L.lights.spark);
  // wall writing (hidden until lights flicker)
  const wc = document.createElement('canvas'); wc.width = 1024; wc.height = 512; const wx = wc.getContext('2d'); wx.fillStyle = 'rgba(0,0,0,0)'; wx.fillRect(0, 0, 1024, 512); wx.fillStyle = '#6d0a0a'; wx.font = '900 150px Impact, sans-serif'; wx.textAlign = 'center'; wx.save(); wx.translate(512, 300); wx.rotate(-.05); wx.fillText('ONE OF NINE', 0, 0); wx.restore();
  for (let i = 0; i < 40; i++) { wx.fillRect(140 + Math.random() * 740, 300 + Math.random() * 30, 6, 30 + Math.random() * 120); }
  const wt = new THREE.CanvasTexture(wc); wt.colorSpace = THREE.SRGBColorSpace; const msg = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ map: wt, transparent: true, roughness: .4, depthWrite: false })); msg.position.set(HALL.x1 - .08, 1.45, -4.45); msg.rotation.y = -Math.PI / 2; msg.scale.setScalar(.85); msg.visible = false; scene.add(msg); L.wallMsg = msg;
  // drag marks
  const dc = document.createElement('canvas'); dc.width = 128; dc.height = 1024; const dx = dc.getContext('2d'); dx.fillStyle = '#3d0606';
  for (let i = 0; i < 1024; i += 2) { const w = 20 + Math.sin(i * .05) * 8; dx.globalAlpha = .5 + Math.random() * .4; dx.fillRect(30 + Math.sin(i * .013) * 10, i, w * Math.random(), 2); dx.fillRect(70 + Math.sin(i * .017) * 10, i, w * Math.random(), 2); }
  const dt = new THREE.CanvasTexture(dc); dt.colorSpace = THREE.SRGBColorSpace; const drag = new THREE.Mesh(new THREE.PlaneGeometry(.5, 6.2), new THREE.MeshStandardMaterial({ map: dt, transparent: true, roughness: .2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); drag.rotation.x = -Math.PI / 2; drag.position.set(3.95, .004, -6.1); drag.visible = false; scene.add(drag); L.drag = drag;
  // Kabir's phone
  const ph = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(.075, .008, .155), new THREE.MeshStandardMaterial({ color: 0x111, roughness: .3, metalness: .5 })); ph.add(body);
  const pc = document.createElement('canvas'); pc.width = 128; pc.height = 256; const pctx = pc.getContext('2d'); const ptex = new THREE.CanvasTexture(pc); ptex.colorSpace = THREE.SRGBColorSpace;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(.068, .145), new THREE.MeshBasicMaterial({ map: ptex })); scr.rotation.x = -Math.PI / 2; scr.position.y = .005; ph.add(scr);
  ph.position.set(4.05, .005, -3.4); ph.rotation.y = .6; ph.visible = false; scene.add(ph);
  L.phone = { obj: ph, ctx: pctx, tex: ptex, light: new THREE.PointLight(0xbfd8ff, 0, 1.2, 2) }; L.phone.light.position.set(4.05, .1, -3.4); scene.add(L.phone.light);
  L.drawPhone = (line1, line2) => { pctx.fillStyle = '#05070a'; pctx.fillRect(0, 0, 128, 256); pctx.fillStyle = '#dfe6ee'; pctx.font = '600 15px sans-serif'; pctx.textAlign = 'center'; pctx.fillText(line1, 64, 90); pctx.font = '12px sans-serif'; pctx.fillStyle = '#8fa0b0'; pctx.fillText(line2 || '', 64, 112); pctx.fillStyle = '#2ecc71'; pctx.beginPath(); pctx.arc(40, 200, 14, 0, 7); pctx.fill(); pctx.fillStyle = '#e74c3c'; pctx.beginPath(); pctx.arc(88, 200, 14, 0, 7); pctx.fill(); ptex.needsUpdate = true; };
  L.drawPhone('UNKNOWN', 'calling…');

  // ---- back yard
  onProgress && onProgress('Rain on the yard…');
  const yardM = pbr('concrete_pavement', [6, 6], { color: 0x6c7068 });
  const grassC = document.createElement('canvas'); grassC.width = grassC.height = 256; const gx = grassC.getContext('2d'); gx.fillStyle = '#1b2414'; gx.fillRect(0, 0, 256, 256); for (let i = 0; i < 9000; i++) { gx.fillStyle = `hsl(${85 + Math.random() * 30},${25 + Math.random() * 25}%,${8 + Math.random() * 14}%)`; gx.fillRect(Math.random() * 256, Math.random() * 256, 1, 2 + Math.random() * 3); }
  const gt = new THREE.CanvasTexture(grassC); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(14, 14); gt.colorSpace = THREE.SRGBColorSpace;
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: gt, roughness: .95 })); grass.rotation.x = -Math.PI / 2; grass.position.set(0, -.01, -8); grass.receiveShadow = true; scene.add(grass);
  const patio = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.2), yardM); patio.rotation.x = -Math.PI / 2; patio.position.set(1.2, .002, -7.7); patio.receiveShadow = true; scene.add(patio);
  const drive = new THREE.Mesh(new THREE.PlaneGeometry(4, 9), pbr('worn_asphalt', [2, 4], { roughness: .4 })); drive.rotation.x = -Math.PI / 2; drive.position.set(6.2, .003, -10.5); drive.receiveShadow = true; scene.add(drive);
  // fence
  const fenceM = siding(1, 1); const fence = (x0, z0, x1, z1) => { const len = Math.hypot(x1 - x0, z1 - z0); const f = new THREE.Mesh(new THREE.BoxGeometry(len, 1.7, .06), pbr('weathered_plank_siding', [len / 2, .85])); f.position.set((x0 + x1) / 2, .85, (z0 + z1) / 2); f.rotation.y = -Math.atan2(z1 - z0, x1 - x0); f.castShadow = f.receiveShadow = true; scene.add(f); };
  fence(-7, -15, 8.5, -15); fence(-7, -15, -7, -2.6); fence(8.5, -15, 8.5, -6);
  // lamp + car
  const lamp = await place('street_lamp_01', -3.2, -11.5, .4, { solid: true }); const lb = new THREE.Box3().setFromObject(lamp);
  L.lights.street = new THREE.SpotLight(0xffb060, 40, 14, .9, .6, 1.3); L.lights.street.position.set(-3.0, lb.max.y - .25, -11.3); L.lights.street.target.position.set(-2.3, 0, -10); L.lights.street.castShadow = true; L.lights.street.shadow.bias = -.0005; scene.add(L.lights.street, L.lights.street.target);
  const car = await place('covered_car', 5.8, -11.6, .15, { solid: true }); L.car = car;
  await place('cardboard_box_01', -6.2, -14.2, .4); await place('cardboard_box_01', -5.6, -14.4, 1.2, { s: .8 });
  // rain particles everywhere outside (lines), plus splashes
  const n = 4200, rg = new THREE.BufferGeometry(), rp = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) { const x = -8 + Math.random() * 17, y = Math.random() * 6, z = -16 + Math.random() * 13.3; rp.set([x, y, z, x + .02, y - .32, z], i * 6); }
  rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  L.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9fb0c8, transparent: true, opacity: .14, blending: THREE.AdditiveBlending, depthWrite: false })); L.rain.frustumCulled = false; scene.add(L.rain);
  // front-of-house rain too (seen through nothing yet but sells the storm in the cold open)
  // ---- window figure (lightning silhouette) – filled by main once actors load
  L.windowSpot = new THREE.Vector3(-1.0, 0, bz - 1.5);
  // ---- interactables
  const I = L.interact;
  I.kabir = { pos: new THREE.Vector3(), r: 1.3, label: 'Wish Kabir happy birthday', on: false };
  I.cake = { pos: new THREE.Vector3(-.55, .5, -.4), r: 1.3, label: 'Light the candles', on: false };
  I.radio = { pos: new THREE.Vector3(.55, .7, -1.98), r: 1.2, label: 'Turn on the radio', on: false };
  I.hallDoor = { pos: new THREE.Vector3(ROOM.x1, 1, (HDOOR.z0 + HDOOR.z1) / 2), r: 1.2, label: 'Open the door', on: false };
  I.fuse = { pos: L.fuse.pos.clone(), r: 1.2, label: 'Flip the breaker', on: false };
  I.phone = { pos: new THREE.Vector3(4.05, .3, -3.4), r: 1.1, label: 'Pick up Kabir\'s phone', on: false };
  I.frontDoor = { pos: new THREE.Vector3((HALL.x0 + HALL.x1) / 2, 1, HALL.z1), r: 1.1, label: 'Front door', on: false };
  I.body = { pos: new THREE.Vector3(4.6, .4, -10.4), r: 1.6, label: 'Check on Kabir', on: false };
  // walkable areas
  L.walk = [
    { x0: ROOM.x0 + .3, x1: ROOM.x1 - .3, z0: ROOM.z0 + .3, z1: ROOM.z1 - .3 },
    { x0: ROOM.x1 - .45, x1: HALL.x0 + .45, z0: HDOOR.z0 + .28, z1: HDOOR.z1 - .28, gate: 'hall' },
    { x0: HALL.x0 + .3, x1: HALL.x1 - .3, z0: HALL.z0 + .3, z1: HALL.z1 - .3 },
    { x0: BDOOR.x0 + .28, x1: BDOOR.x1 - .28, z0: HALL.z0 - .45, z1: HALL.z0 + .45, gate: 'back' },
    { x0: -6.7, x1: 8.2, z0: -14.7, z1: HALL.z0 - .32 },
    { x0: -6.7, x1: HALL.x0 - .32, z0: -14.7, z1: ROOM.z0 - .32 },
  ];
  L.outdoors = (x, z) => z < HALL.z0 - .1 || (z < ROOM.z0 - .1 && x < HALL.x0);
  L.inHall = (x, z) => x > HALL.x0 && x < HALL.x1 && z > HALL.z0 && z < HALL.z1;
  L.inRoom = (x, z) => x > ROOM.x0 && x < ROOM.x1 && z > ROOM.z0 && z < ROOM.z1;
  L.radioPos = new THREE.Vector3(.55, .8, -1.98);
  return L;
}

// keep a point inside walkable areas and outside solids
export function collide(L, ox, oz, nx, nz, gates) {
  const r = .22; const ok = (x, z) => L.walk.some(w => (!w.gate || gates[w.gate]) && x >= w.x0 && x <= w.x1 && z >= w.z0 && z <= w.z1) && !L.solids.some(b => x > b.min.x - r && x < b.max.x + r && z > b.min.z - r && z < b.max.z + r);
  if (!ok(ox, oz) || ok(nx, nz)) return [nx, nz]; if (ok(nx, oz)) return [nx, oz]; if (ok(ox, nz)) return [ox, nz]; return [ox, oz];
}
