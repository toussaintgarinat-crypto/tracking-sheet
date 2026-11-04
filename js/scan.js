// Numérisation d'une fiche papier : redressement, détection de grille, OCR local (Tesseract.js), inférence de types.
// Tout est traité sur l'appareil, sans réseau.
import { newField } from './engine.js';

// ---------- Image -> niveaux de gris ----------
export async function loadGray(file, maxSide = 1800) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  }
  const sw = bmp.width || bmp.naturalWidth, sh = bmp.height || bmp.naturalHeight;
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.round(sw * k), h = Math.round(sh * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000;
  return { gray, w, h };
}

export function grayToCanvas(gray, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) { img.data[j] = img.data[j + 1] = img.data[j + 2] = gray[i]; img.data[j + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Intégrale pour moyennes locales
function integral(gray, w, h) {
  const W = w + 1, I = new Uint32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += gray[y * w + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row; }
  }
  return I;
}
function boxMean(I, w, h, x, y, r) {
  const W = w + 1;
  const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
  const s = I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
  return s / ((x1 - x0) * (y1 - y0));
}

// Ajustement du contraste : supprime l'ombre/le fond, étire les niveaux
export function normalize(gray, w, h) {
  const I = integral(gray, w, h);
  const r = Math.max(12, Math.round(Math.max(w, h) / 25));
  const out = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // le fond local ≈ moyenne ; on prend une valeur "papier" légèrement au-dessus de la moyenne
    const bg = Math.min(255, boxMean(I, w, h, x, y, r) * 1.08 + 4);
    out[y * w + x] = Math.min(255, (gray[y * w + x] / bg) * 255);
  }
  // étirement global : le papier (majorité des pixels) devient blanc
  const hist = new Uint32Array(256);
  for (let i = 0; i < out.length; i++) hist[out[i]]++;
  let acc = 0, p = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= out.length * 0.6) { p = v; break; } }
  const k = 255 / Math.max(p, 128);
  for (let i = 0; i < out.length; i++) out[i] = Math.min(255, out[i] * k);
  return out;
}

export function binarize(norm, thr = 205) {
  const b = new Uint8Array(norm.length);
  for (let i = 0; i < norm.length; i++) b[i] = norm[i] < thr ? 1 : 0;
  return b;
}

// ---------- Détection du cadre (estimation initiale, ajustable à la main) ----------
export function guessQuad(gray, w, h) {
  const n = normalize(gray, w, h), b = binarize(n, 190);
  const rows = new Uint32Array(h), cols = new Uint32Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (b[y * w + x]) { rows[y]++; cols[x]++; }
  const first = (arr, t) => arr.findIndex(v => v > t);
  const last = (arr, t) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] > t) return i; return arr.length - 1; };
  let x0 = first(cols, h * 0.03), x1 = last(cols, h * 0.03), y0 = first(rows, w * 0.03), y1 = last(rows, w * 0.03);
  if (x0 < 0 || y0 < 0 || x1 - x0 < w * 0.2 || y1 - y0 < h * 0.2) { x0 = w * 0.04; x1 = w * 0.96; y0 = h * 0.04; y1 = h * 0.96; }
  const m = 6;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]; // TL TR BR BL
}

// ---------- Redressement de perspective ----------
function solveHomography(src, dst) { // src -> dst, 4 points chacun
  const A = [], B = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
  }
  const n = 8;
  for (let i = 0; i < n; i++) { // Gauss-Jordan avec pivot
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [B[i], B[p]] = [B[p], B[i]];
    const d = A[i][i] || 1e-12;
    for (let c = i; c < n; c++) A[i][c] /= d; B[i] /= d;
    for (let r = 0; r < n; r++) if (r !== i) {
      const f = A[r][i];
      if (!f) continue;
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; B[r] -= f * B[i];
    }
  }
  return B; // a..h
}

export function warp(gray, w, h, quad, maxSide = 2000) {
  const [TL, TR, BR, BL] = quad;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let W = Math.round(Math.max(dist(TL, TR), dist(BL, BR))), H = Math.round(Math.max(dist(TL, BL), dist(TR, BR)));
  const k = Math.min(1, maxSide / Math.max(W, H)); W = Math.max(50, Math.round(W * k)); H = Math.max(50, Math.round(H * k));
  const rect = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  const [a, b, c, d, e, f, g, hh] = solveHomography(rect, quad); // destination -> source
  const out = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const den = g * x + hh * y + 1;
    const sx = (a * x + b * y + c) / den, sy = (d * x + e * y + f) / den;
    if (sx < 0 || sy < 0 || sx >= w - 1 || sy >= h - 1) { out[y * W + x] = 255; continue; }
    const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0, i = y0 * w + x0;
    out[y * W + x] = gray[i] * (1 - fx) * (1 - fy) + gray[i + 1] * fx * (1 - fy) + gray[i + w] * (1 - fx) * fy + gray[i + w + 1] * fx * fy;
  }
  return { gray: out, w: W, h: H };
}

// ---------- Correction d'inclinaison (les lignes du tableau doivent être horizontales) ----------
export function deskew(gray, w, h) {
  const bin = binarize(normalize(gray, w, h));
  let n = 0; for (let i = 0; i < bin.length; i++) n += bin[i];
  const step = Math.max(1, Math.floor(n / 150000));
  const xs = [], ys = []; let c = 0;
  for (let i = 0; i < bin.length; i++) if (bin[i] && (c++ % step === 0)) { xs.push(i % w); ys.push((i / w) | 0); }
  const off = Math.ceil(w * 0.1) + 2, size = h + 2 * off;
  let best = 0, bestScore = -1;
  for (let a = -5; a <= 5.0001; a += 0.2) {
    const r = a * Math.PI / 180, sn = Math.sin(r), cs = Math.cos(r), hist = new Float32Array(size);
    for (let i = 0; i < xs.length; i++) hist[Math.round(-xs[i] * sn + ys[i] * cs) + off]++;
    let sc = 0; for (let j = 0; j < size; j++) sc += hist[j] * hist[j];
    if (sc > bestScore) { bestScore = sc; best = a; }
  }
  if (Math.abs(best) < 0.15) return { gray, w, h, angle: 0 };
  const r = best * Math.PI / 180, sn = Math.sin(r), cs = Math.cos(r), cx = w / 2, cy = h / 2;
  const out = new Uint8ClampedArray(w * h).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x - cx, v = y - cy;
    const sx = u * cs - v * sn + cx, sy = u * sn + v * cs + cy;
    if (sx < 0 || sy < 0 || sx >= w - 1 || sy >= h - 1) continue;
    const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0, i = y0 * w + x0;
    out[y * w + x] = gray[i] * (1 - fx) * (1 - fy) + gray[i + 1] * fx * (1 - fy) + gray[i + w] * (1 - fx) * fy + gray[i + w + 1] * fx * fy;
  }
  return { gray: out, w, h, angle: best };
}

// ---------- Détection des tableaux, lignes, colonnes ----------
function groups(flags, gap = 4) {
  const out = []; let start = -1, last = -100;
  for (let i = 0; i < flags.length; i++) {
    if (!flags[i]) continue;
    if (start >= 0 && i - last > gap) { out.push((start + last) / 2); start = i; } else if (start < 0) start = i;
    last = i;
  }
  if (start >= 0) out.push((start + last) / 2);
  return out;
}

// Retire les lignes de bord parasites (ombre/bord de la feuille) : une cellule extérieure nettement
// plus étroite que la cellule médiane n'est pas une vraie colonne/ligne.
function trimEdges(a) {
  a = [...a];
  const med = () => { const g = a.slice(1).map((v, i) => v - a[i]).sort((x, y) => x - y); return g[g.length >> 1] || 0; };
  for (let guard = 0; guard < 4 && a.length > 3; guard++) {
    const m = med(); let changed = false;
    if (a[1] - a[0] < 0.4 * m) { a.shift(); changed = true; }
    if (a.length > 3 && a.at(-1) - a.at(-2) < 0.4 * m) { a.pop(); changed = true; }
    if (!changed) break;
  }
  return a;
}

// Une ligne de bord n'est valide que si les lignes perpendiculaires la traversent (sinon : bord de feuille / titre)
function trimSupport(lines, cross, cover) {
  lines = [...lines];
  const ok = (a, b) => cross.filter(c => { let m = 0; for (let d = -2; d <= 2; d++) m = Math.max(m, cover(Math.round(c) + d, Math.round(a), Math.round(b))); return m > 0.6; }).length >= 0.6 * cross.length;
  while (lines.length > 2 && !ok(lines[0], lines[1])) lines.shift();
  while (lines.length > 2 && !ok(lines.at(-2), lines.at(-1))) lines.pop();
  return lines;
}

export function detectGrid(bin, w, h) {
  const rowFrac = (y, x0, x1) => { let n = 0; for (let x = x0; x < x1; x++) n += bin[y * w + x]; return n / (x1 - x0); };
  const colFrac = (x, y0, y1) => { let n = 0; for (let y = y0; y < y1; y++) n += bin[y * w + x]; return n / (y1 - y0); };
  const merge = a => a.filter((v, i) => i === 0 || v - a[i - 1] > 10);
  const hLines = (x0, x1, t) => merge(groups(Array.from({ length: h }, (_, y) => rowFrac(y, x0, x1) > t)));
  const vLines = (y0, y1, t) => merge(groups(Array.from({ length: w }, (_, x) => colFrac(x, y0, y1) > t)));
  let ys = hLines(0, w, 0.3);
  let xs = vLines(ys.length >= 2 ? Math.floor(ys[0]) : 0, ys.length >= 2 ? Math.ceil(ys.at(-1)) + 1 : h, 0.4);
  if (xs.length < 2) return null;
  // affinage alterné : chaque direction se mesure dans les bornes de l'autre
  for (let pass = 0; pass < 2; pass++) {
    xs = trimEdges(xs);
    ys = hLines(Math.floor(xs[0]), Math.min(w, Math.ceil(xs.at(-1)) + 1), 0.5);
    if (ys.length < 2) return null;
    ys = trimEdges(trimSupport(ys, xs, (x, a, b) => (x < 0 || x >= w ? 0 : colFrac(x, a, b))));
    xs = vLines(Math.floor(ys[0]), Math.min(h, Math.ceil(ys.at(-1)) + 1), 0.5);
    if (xs.length < 2) return null;
  }
  xs = trimEdges(trimSupport(xs, ys, (y, a, b) => (y < 0 || y >= h ? 0 : rowFrac(y, a, b))));
  return xs.length >= 2 && ys.length >= 2 ? { xs, ys } : null;
}

// Cellules d'en-tête selon l'orientation : 'row' = intitulés sur la 1re ligne, 'col' = sur la 1re colonne
export function headerCells(grid, mode) {
  const { xs, ys } = grid, pad = 3, cells = [];
  if (mode === 'row') {
    for (let j = 0; j < xs.length - 1; j++) cells.push({ x: xs[j] + pad, y: ys[0] + pad, w: xs[j + 1] - xs[j] - 2 * pad, h: ys[1] - ys[0] - 2 * pad });
  } else {
    for (let i = 0; i < ys.length - 1; i++) cells.push({ x: xs[0] + pad, y: ys[i] + pad, w: xs[1] - xs[0] - 2 * pad, h: ys[i + 1] - ys[i] - 2 * pad });
  }
  return cells.filter(c => c.w > 8 && c.h > 8);
}

export function guessOrientation(grid) {
  const cols = grid.xs.length - 1, rows = grid.ys.length - 1;
  return cols > rows * 1.5 ? 'col' : 'row'; // beaucoup de colonnes = heures en colonnes, paramètres en lignes
}

// ---------- OCR local ----------
const OCR_DIR = 'vendor/tesseract/';
const simd = (() => { try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch { return false; } })();
export const OCR_FILES = [
  OCR_DIR + 'tesseract.min.js', OCR_DIR + 'worker.min.js',
  OCR_DIR + (simd ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js'),
  OCR_DIR + 'lang/fra.traineddata.gz',
];

// Met en cache les fichiers OCR (le service worker les conserve pour l'usage hors-ligne)
export async function prefetchOcr(onState) {
  try {
    for (const f of OCR_FILES) await fetch(f);
    onState?.(true);
    return true;
  } catch { onState?.(false); return false; }
}

let tessWorker;
function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.Tesseract) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('OCR indisponible hors-ligne : ouvrez d\'abord cet écran avec une connexion.'));
    document.head.append(s);
  });
}
async function getWorker() {
  if (tessWorker) return tessWorker;
  await loadScript(OCR_DIR + 'tesseract.min.js');
  const abs = p => new URL(p, location.href).href;
  tessWorker = await window.Tesseract.createWorker('fra', 1, {
    workerPath: abs(OCR_DIR + 'worker.min.js'),
    corePath: abs(OCR_DIR),
    langPath: abs(OCR_DIR + 'lang'),
    gzip: true, cacheMethod: 'none',
  });
  await tessWorker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '0' });
  return tessWorker;
}
export async function stopOcr() { if (tessWorker) { await tessWorker.terminate(); tessWorker = null; } }

function cropCanvas(gray, w, rect) {
  const rw = Math.round(rect.w), rh = Math.round(rect.h);
  const k = Math.max(1, Math.min(3, 70 / rh));
  const pad = 12;
  const c = document.createElement('canvas');
  c.width = Math.round(rw * k) + pad * 2; c.height = Math.round(rh * k) + pad * 2;
  const src = document.createElement('canvas'); src.width = rw; src.height = rh;
  const sctx = src.getContext('2d'); const img = sctx.createImageData(rw, rh);
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const v = gray[(Math.round(rect.y) + y) * w + Math.round(rect.x) + x];
    const j = (y * rw + x) * 4; img.data[j] = img.data[j + 1] = img.data[j + 2] = v; img.data[j + 3] = 255;
  }
  sctx.putImageData(img, 0, 0);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, pad, pad, c.width - 2 * pad, c.height - 2 * pad);
  return c;
}

const clean = s => s.replace(/[|_\[\]{}~=]+/g, ' ').replace(/\s+/g, ' ').trim();

export async function ocrCells(gray, w, rects, onProgress) {
  const worker = await getWorker();
  const out = [];
  for (let i = 0; i < rects.length; i++) {
    onProgress?.(i, rects.length);
    const { data } = await worker.recognize(cropCanvas(gray, w, rects[i]));
    out.push(clean(data.text || ''));
  }
  onProgress?.(rects.length, rects.length);
  return out;
}

// ---------- Inférence du type de donnée attendu ----------
const strip = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function inferField(rawLabel, index) {
  const label = rawLabel || `Colonne ${index + 1}`;
  const s = strip(label);
  const f = newField(label, 'text');
  const num = (unit, min, max, step, def) => Object.assign(f, { type: 'number', unit, min, max, step, def });
  if (/^(date|heure|h|horaire|jour|hr)\b|heure|date/.test(s)) return { ...f, type: 'time', skip: true };
  if (/temp|t°|\bt\b.*c\b|°c/.test(s)) num('°C', 34, 42, 0.1, 37);
  else if (/tension|\bta\b|\bpa\b|pression art/.test(s)) Object.assign(f, { type: 'bp', unit: 'mmHg' });
  else if (/\bfc\b|pouls|card|bpm|rythme/.test(s)) num('bpm', 20, 250, 1, 80);
  else if (/sat|spo|o2/.test(s)) num('%', 50, 100, 1, 97);
  else if (/glyc|dextro|\bhgt\b/.test(s)) num('g/L', 0.2, 6, 0.1, 1);
  else if (/\bfr\b|resp/.test(s)) num('/min', 5, 70, 1, 16);
  else if (/douleur|\beva\b|algo|\ben\b/.test(s)) Object.assign(f, { type: 'scale', max: s.includes('algo') ? 5 : 10 });
  else if (/selle|transit|bristol/.test(s)) Object.assign(f, { type: 'choice', options: ['Aucune', '1', '2', '3', '4', '5', '6', '7'] });
  else if (/repas|alim|appetit/.test(s)) Object.assign(f, { type: 'choice', options: ['Rien', '¼', '½', '¾', 'Tout'] });
  else if (/vomi|nausee/.test(s)) Object.assign(f, { type: 'choice', options: ['Non', '1', '2', '3+'] });
  else if (/poids/.test(s)) num('kg', 1, 300, 0.1, 60);
  else if (/perim|tour de/.test(s)) num('cm', 30, 200, 1, 90);
  else if (/diur|urine|miction|stomie|drain|ml|volume|boisson|hydrat|biberon|entree|sortie|apport|\bl\b/.test(s)) num('ml', 0, 3000, 10, 100);
  else if (/saign/.test(s)) Object.assign(f, { type: 'choice', options: ['Aucun', 'Minimes', 'Modérés', 'Abondants'] });
  else if (/pansement|injection|trait|medic|soin|obs|remarque|comment|visa|signat|initiales/.test(s)) f.type = 'text';
  return f;
}
