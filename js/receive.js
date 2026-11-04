// Mode corps médical : réception des bilans transmis par QR code (caméra, photo ou texte collé), sans réseau.
import { db } from './db.js';

// ---------- Lecture des charges utiles ----------
export function parseMany(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n+/)) {
    const s = line.trim();
    if (!s.startsWith('{')) continue;
    try { const j = JSON.parse(s); if (j && j.v === 1 && Array.isArray(j.r)) out.push(j); } catch { /* ignoré */ }
  }
  if (!out.length) { // texte pretty-printé sur plusieurs lignes
    try { const j = JSON.parse(String(text).trim()); if (j && j.v === 1 && Array.isArray(j.r)) out.push(j); } catch { /* ignoré */ }
  }
  return out;
}

// Un bilan peut tenir en plusieurs codes (n = "i/N") ; la session les rassemble dans n'importe quel ordre
export class Session {
  constructor() { this.parts = new Map(); this.total = null; this.name = null; this.startedAt = Date.now(); }
  add(j) {
    const [i, n] = j.n ? String(j.n).split('/').map(Number) : [1, 1];
    if (!(i >= 1 && n >= 1 && i <= n)) return 'invalid';
    if (this.total == null) { this.total = n; this.name = j.p ?? null; }
    else if (n !== this.total || (j.p ?? null) !== this.name) return 'other';
    if (this.parts.has(i)) return 'dup';
    this.parts.set(i, j);
    return 'ok';
  }
  get complete() { return this.total != null && this.parts.size === this.total; }
  get count() { return this.parts.size; }
}

// "dd/mm HH:MM" -> timestamp (l'année est déduite de la date de génération du bilan)
function toTs(d, ref) {
  const m = /^(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2})$/.exec(d || '');
  if (!m) return ref.getTime();
  let ts = new Date(ref.getFullYear(), +m[2] - 1, +m[1], +m[3], +m[4]).getTime();
  if (ts > ref.getTime() + 864e5) ts = new Date(ref.getFullYear() - 1, +m[2] - 1, +m[1], +m[3], +m[4]).getTime();
  return ts;
}

const rowKey = r => r.ts + '|' + JSON.stringify(r.v);

// Enregistre (ou fusionne) le bilan reçu ; retourne l'id
export async function saveReceived(session) {
  const parts = [...session.parts.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
  const first = parts.find(p => p.g) || {};
  const ref = first.g ? new Date(first.g.replace(' ', 'T') + ':00Z') : new Date();
  const template = (parts.find(p => p.f) || {}).f || 'Fiche inconnue';
  const legend = Object.assign({}, ...parts.map(p => p.k || {}));
  const order = Object.keys(legend);
  const rows = [];
  for (const p of parts) for (const r of p.r) {
    const { d, ...v } = r;
    Object.keys(v).forEach(k => { if (!order.includes(k)) order.push(k); });
    rows.push({ ts: toTs(d, ref), d, v });
  }
  const name = session.name || 'Patient (nom non transmis)';
  // sans nom, on ne fusionne jamais : deux patients anonymes ne doivent pas se mélanger
  const id = session.name ? `${session.name}|${template}` : `anon|${template}|${session.startedAt}`;
  const old = await db.get('received', id);
  const rec = old || { id, name, template, legend: {}, order: [], rows: [] };
  Object.assign(rec.legend, legend);
  order.forEach(k => { if (!rec.order.includes(k)) rec.order.push(k); });
  const seen = new Set(rec.rows.map(rowKey));
  rows.forEach(r => { if (!seen.has(rowKey(r))) { rec.rows.push(r); seen.add(rowKey(r)); } });
  rec.rows.sort((a, b) => a.ts - b.ts);
  rec.updated = Date.now();
  rec.generated = first.g || rec.generated || null;
  await db.put('received', rec);
  return id;
}

export const receivedFields = rec => rec.order.map(k => ({ key: k, label: rec.legend[k] || k }));
export const receivedEntries = rec => rec.rows.map((r, i) => ({ id: String(i), ts: r.ts, values: r.v }));

// ---------- Décodage d'image QR ----------
let jsQRp;
export function loadJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  jsQRp ??= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'vendor/jsQR.js';
    s.onload = () => res(window.jsQR); s.onerror = () => rej(new Error('Lecteur QR indisponible'));
    document.head.append(s);
  });
  return jsQRp;
}

export async function decodeImageFile(file) {
  const jsQR = await loadJsQR();
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  for (const max of [1400, 900, 2000]) { // plusieurs échelles : un QR dense se lit mieux à la bonne taille
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const r = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
    if (r) return r.data;
  }
  return null;
}

// ---------- Caméra ----------
export async function startScanner(video, onData, onError) {
  const jsQR = await loadJsQR();
  let stream, stopped = false;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
  } catch (e) { onError?.(e); return () => {}; }
  video.srcObject = stream; video.setAttribute('playsinline', ''); video.muted = true;
  await video.play().catch(() => {});
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  let last = 0;
  const tick = t => {
    if (stopped) return;
    if (t - last > 90 && video.videoWidth) { // ~10 images/s
      last = t;
      const k = Math.min(1, 960 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * k); canvas.height = Math.round(video.videoHeight * k);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const r = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
      if (r?.data) onData(r.data);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => { stopped = true; stream.getTracks().forEach(t => t.stop()); video.srcObject = null; };
}
