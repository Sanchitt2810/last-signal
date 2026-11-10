// Rigged MakeHuman characters + retargeted mocap clips for three.js
import * as THREE from 'three';
const b64 = (s, T) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new T(u.buffer); };

export async function loadCharacter(base, name, { maxTex = 1024, loader = new THREE.TextureLoader() } = {}) {
  const d = await (await fetch(`${base}/${name}.json`)).json();
  const bones = {}; const list = [];
  for (const b of d.bones) { const bone = new THREE.Bone(); bone.name = b.name; bones[b.name] = bone; list.push(bone); }
  let rootBone = null;
  for (const b of d.bones) {
    const bone = bones[b.name]; const h = new THREE.Vector3(...b.head);
    if (b.parent) { const ph = new THREE.Vector3(...d.bones.find(x => x.name === b.parent).head); bone.position.copy(h.sub(ph)); bones[b.parent].add(bone); }
    else { bone.position.copy(h); rootBone = bone; }
  }
  const group = new THREE.Group(); group.name = name; group.add(rootBone); group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(list);
  const tex = (f, srgb = true) => { if (!f) return null; const t = loader.load(`${base}/${f}`); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const meshes = [];
  for (const p of d.parts) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(b64(p.pos, Float32Array), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(b64(p.uv, Float32Array), 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(b64(p.si, Uint16Array), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(b64(p.sw, Float32Array), 4));
    g.setIndex(new THREE.BufferAttribute(b64(p.idx, Uint32Array), 1));
    g.computeVertexNormals();
    const m = p.mat; let mat;
    if (m.kind === 'skin') mat = new THREE.MeshStandardMaterial({ color: m.tint ? new THREE.Color(m.tint) : 0xffffff, map: tex(m.diffuse), normalMap: tex(m.normal, false), roughness: .5 });
    else if (m.kind === 'eye') mat = new THREE.MeshStandardMaterial({ color: 0x9a9aa2, map: tex(m.diffuse), roughness: .1, transparent: true, alphaTest: .05 });
    else if (['hair', 'eyebrows', 'eyelashes', 'beard'].includes(m.kind)) mat = new THREE.MeshStandardMaterial({ map: tex(m.diffuse), alphaTest: .3, side: THREE.DoubleSide, roughness: .55, color: m.tint ? new THREE.Color(m.tint) : 0xffffff });
    else mat = new THREE.MeshStandardMaterial({ map: tex(m.diffuse), normalMap: tex(m.normal, false), roughness: .85, side: THREE.DoubleSide });
    mat.name = m.kind; g.name = m.kind;
    const mesh = new THREE.SkinnedMesh(g, mat); mesh.castShadow = !['eyelashes', 'eyebrows'].includes(m.kind); mesh.receiveShadow = true; mesh.frustumCulled = false;
    mesh.bind(skeleton); group.add(mesh); meshes.push(mesh);
  }
  group.userData = { bones, skeleton, meshes, height: d.height };
  return group;
}

const clipCache = {};
export async function loadClip(url, name) {
  if (clipCache[url]) return clipCache[url];
  const d = await (await fetch(url)).json(); const tracks = [];
  for (const [bone, v] of Object.entries(d.tracks)) {
    const times = v.length === 4 ? [0] : d.times;
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, v));
  }
  tracks.push(new THREE.VectorKeyframeTrack('root.position', d.times, d.root));
  const clip = new THREE.AnimationClip(name || url, d.duration, tracks);
  clipCache[url] = clip; return clip;
}

// ---- actors: cloned characters with a small animation state machine
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
const templates = {}; let CLIPS = {}; const REF_HIP = 0.8894;
export async function loadClips(base, names) { await Promise.all(names.map(async n => CLIPS[n] = await loadClip(`${base}/${n}.json`, n))); return CLIPS; }
export async function preloadChar(base, name, loader) { if (!templates[name]) templates[name] = loadCharacter(base, name, { loader }); return templates[name]; }
function scaledClip(clip, ratio) {
  if (Math.abs(ratio - 1) < .01) return clip; const c = clip.clone();
  const tr = c.tracks.find(t => t.name === 'root.position'); tr.values = tr.values.slice(); for (let i = 1; i < tr.values.length; i += 3) tr.values[i] *= ratio; return c;
}
export async function makeActor(name, { tint = null, silhouette = false } = {}) {
  const tpl = await templates[name]; const g = SkeletonUtils.clone(tpl); g.userData = { ...tpl.userData };
  g.traverse(o => {
    if (!o.isSkinnedMesh) return; o.frustumCulled = false;
    if (silhouette) { const k = o.geometry.name; o.material = new THREE.MeshBasicMaterial({ color: 0x020202 }); if (/eye|hair|brow|lash/.test(k)) o.visible = false; }
    else if (tint && o.material.map && !/skin|eye|hair|brow|lash/.test(o.material.name)) { o.material = o.material.clone(); o.material.color = new THREE.Color(tint); }
  });
  const root = g.getObjectByName('root'); const ratio = root.position.y / REF_HIP;
  const mixer = new THREE.AnimationMixer(g); const acts = {};
  for (const [n, c] of Object.entries(CLIPS)) { acts[n] = mixer.clipAction(scaledClip(c, ratio)); }
  let cur = null;
  const actor = { obj: g, mixer, name, state: '', play(s, fade = .3) { if (s === actor.state || !acts[s]) return; const a = acts[s]; a.reset().setEffectiveWeight(1).fadeIn(fade).play(); if (cur) cur.fadeOut(fade); cur = a; actor.state = s; },
    speed(v) { if (cur) cur.timeScale = v; }, update(dt) { mixer.update(dt); } };
  actor.play('idle', 0); acts.idle && (acts.idle.time = Math.random() * 5);
  return actor;
}
