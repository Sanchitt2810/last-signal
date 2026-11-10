// Room-code multiplayer over WebRTC (PeerJS public broker). Host is authoritative and relays data; voice is a mesh.
import { walkieInput, squelch } from './audio.js';
const PREFIX = 'harrowpt-ls1-';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const code5 = () => Array.from({ length: 6 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
let PeerCls = null;
async function loadPeer() {
  if (PeerCls) return PeerCls;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/peerjs.min.js'; s.onload = res; s.onerror = () => { s.remove(); const t = document.createElement('script'); t.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js'; t.onload = res; t.onerror = rej; document.head.appendChild(t); }; document.head.appendChild(s); });
  return PeerCls = window.Peer;
}
export class Net {
  constructor() { this.peer = null; this.isHost = true; this.conns = new Map(); this.host = null; this.handlers = {}; this.myId = 'solo'; this.mic = null; this.voices = new Map(); this.calls = new Map(); this.online = false; }
  on(t, fn) { this.handlers[t] = fn; }
  emit(m) { const h = this.handlers[m.t]; if (h) h(m); }
  async hostRoom(code) {
    const Peer = await loadPeer();
    return new Promise((res, rej) => {
      const p = this.peer = new Peer(PREFIX + code, { debug: 0 }); this.isHost = true; this.code = code;
      p.on('open', id => { this.myId = id; this.online = true; res(id); });
      p.on('error', e => { if (!this.online) rej(e); else this.emit({ t: 'neterr', e: String(e.type || e) }); });
      p.on('connection', c => {
        c.on('open', () => { this.conns.set(c.peer, c); });
        c.on('data', m => { m.from = c.peer; this.emit(m); });
        c.on('close', () => { this.conns.delete(c.peer); this.emit({ t: 'leave', from: c.peer }); this.dropVoice(c.peer); });
      });
      p.on('call', call => this.answer(call));
    });
  }
  async joinRoom(code) {
    const Peer = await loadPeer(); this.isHost = false; this.code = code;
    return new Promise((res, rej) => {
      const p = this.peer = new Peer({ debug: 0 });
      const to = setTimeout(() => rej(new Error('No room with that code answered.')), 12000);
      p.on('open', id => {
        this.myId = id; const c = this.host = p.connect(PREFIX + code, { reliable: true });
        c.on('open', () => { clearTimeout(to); this.online = true; res(id); });
        c.on('data', m => this.emit(m));
        c.on('close', () => this.emit({ t: 'hostgone' }));
        c.on('error', e => rej(e));
      });
      p.on('error', e => { clearTimeout(to); if (!this.online) rej(e.type === 'peer-unavailable' ? new Error('No room with that code. Check the letters.') : e); else this.emit({ t: 'neterr', e: String(e.type || e) }); });
      p.on('call', call => this.answer(call));
    });
  }
  // host -> everyone (except optional), client -> host
  send(m) { if (!this.online) return; if (this.isHost) { for (const c of this.conns.values()) if (c.open) c.send(m); } else if (this.host && this.host.open) this.host.send(m); }
  sendTo(id, m) { const c = this.conns.get(id); if (c && c.open) c.send(m); }
  relay(m, except) { for (const [id, c] of this.conns) if (id !== except && c.open) c.send(m); }
  // ---- walkie-talkie voice
  async enableMic() {
    if (this.mic) return true;
    try { this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); this.mic.getAudioTracks().forEach(t => t.enabled = false); return true; } catch (e) { return false; }
  }
  callAll(ids) { if (!this.peer) return; for (const id of ids) { if (id === this.myId || this.calls.has(id) || id > this.myId) continue; const call = this.peer.call(id, this.mic || silentStream()); this.wire(call); } }
  answer(call) { call.answer(this.mic || silentStream()); this.wire(call); }
  wire(call) {
    this.calls.set(call.peer, call);
    call.on('stream', st => { if (this.voices.has(call.peer)) return; const el = new Audio(); el.srcObject = st; el.muted = true; el.play().catch(() => { }); const g = walkieInput(st); this.voices.set(call.peer, { g, el }); });
    call.on('close', () => this.dropVoice(call.peer));
  }
  dropVoice(id) { const v = this.voices.get(id); if (v) { v.g && v.g.disconnect(); v.el.srcObject = null; } this.voices.delete(id); const c = this.calls.get(id); if (c) c.close(); this.calls.delete(id); }
  talk(on) { if (this.mic) this.mic.getAudioTracks().forEach(t => t.enabled = on); }
  hear(id, on, ghost) { const v = this.voices.get(id); if (!v || !v.g) return; v.g.gain.setTargetAtTime(on ? (ghost ? .5 : 1.4) : 0, v.g.context.currentTime, .03); if (on !== v.on) { squelch(on); v.on = on; } }
}
let _silent = null;
function silentStream() { if (_silent) return _silent; const ac = new AudioContext(); const d = ac.createMediaStreamDestination(); _silent = d.stream; return _silent; }
