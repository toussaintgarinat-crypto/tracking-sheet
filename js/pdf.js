// Générateur PDF minimal, 100 % local (polices Helvetica standard, A4 paysage). Produit un vrai fichier .pdf
// partageable/enregistrable, y compris sur iOS où window.print() est peu fiable dans une PWA installée.
const PW = 842, PH = 595, M = 28, FS = 8.5, LH = 10.5, PAD = 3, MAXCOL = 110;

const CP1252 = { 0x2019: 0x27, 0x2018: 0x27, 0x2013: 0x2d, 0x2014: 0x2d, 0x2212: 0x2d, 0x20ac: 0x80, 0x153: 0x9c, 0x152: 0x8c, 0x2026: 0x85, 0x2022: 0x95, 0x2082: 0x32 };
function enc(s) {
  let out = '';
  for (const ch of String(s)) {
    let c = ch.codePointAt(0);
    if (CP1252[c] !== undefined) c = CP1252[c]; else if (c > 255) c = 0x3f;
    if (c < 32) c = 32;
    const t = String.fromCharCode(c);
    out += t === '(' || t === ')' || t === '\\' ? '\\' + t : t;
  }
  return out;
}

const ctx = document.createElement('canvas').getContext('2d');
function width(text, bold) { ctx.font = `${bold ? 'bold ' : ''}${FS}px Helvetica, Arial, sans-serif`; return ctx.measureText(text).width; }

function wrap(text, maxW, bold) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let cur = '';
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (width(word, bold) > maxW && word.length > 1) { // mot trop long : coupe
        let k = word.length - 1; while (k > 1 && width(word.slice(0, k), bold) > maxW) k--;
        if (cur) { lines.push(cur); cur = ''; }
        lines.push(word.slice(0, k)); word = word.slice(k);
      }
      const trial = cur ? cur + ' ' + word : word;
      if (cur && width(trial, bold) > maxW) { lines.push(cur); cur = word; } else cur = trial;
    }
    lines.push(cur);
  }
  return lines.length ? lines : [''];
}

// columns: [{label}] ; rows: [[date, v1, v2, ...]] (chaînes) ; retourne un Blob PDF
export function buildPdf({ title, subtitle, columns, rows }) {
  const timeW = Math.max(width('00/00 00:00', true), width('Date / heure', true)) + 2 * PAD;
  const natural = columns.map((c, i) => {
    const longestHead = Math.max(...String(c.label).split(/\s+/).map(w => width(w, true)), 0);
    const cells = rows.reduce((m, r) => Math.max(m, width(String(r[i + 1] ?? ''), false)), 0);
    return Math.min(MAXCOL, Math.max(longestHead, cells, 22) + 2 * PAD);
  });
  // blocs de colonnes qui tiennent dans la largeur de page
  const avail = PW - 2 * M - timeW, blocks = [];
  let cur = [], sum = 0;
  natural.forEach((w, i) => {
    if (cur.length && sum + w > avail) { blocks.push(cur); cur = []; sum = 0; }
    cur.push(i); sum += w;
  });
  if (cur.length) blocks.push(cur);
  if (!blocks.length) blocks.push([]);

  const pages = [];
  const newPage = () => { const p = []; pages.push(p); return p; };
  const text = (p, x, yTop, s, bold) => p.push(`BT /${bold ? 'F2' : 'F1'} ${FS} Tf ${x.toFixed(2)} ${(PH - yTop).toFixed(2)} Td (${enc(s)}) Tj ET`);
  const cell = (p, x, yTop, w, h, lines, bold, fill) => {
    if (fill) p.push(`0.88 g ${x.toFixed(2)} ${(PH - yTop - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g`);
    p.push(`0.5 w ${x.toFixed(2)} ${(PH - yTop - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
    lines.forEach((l, i) => l && text(p, x + PAD, yTop + PAD + FS * 0.85 + i * LH, l, bold));
  };

  blocks.forEach((idxs, bi) => {
    const sumW = idxs.reduce((a, i) => a + natural[i], 0) || 1;
    const k = Math.min(1.6, avail / sumW);
    const ws = idxs.map(i => natural[i] * k);
    const head = [wrap('Date / heure', timeW - 2 * PAD, true), ...idxs.map((i, j) => wrap(columns[i].label, ws[j] - 2 * PAD, true))];
    const headH = Math.max(...head.map(l => l.length)) * LH + 2 * PAD;
    let p, y;
    const start = () => {
      p = newPage(); y = M;
      ctxTitle(p);
      cell(p, M, y, timeW, headH, head[0], true, true);
      let x = M + timeW;
      idxs.forEach((_, j) => { cell(p, x, y, ws[j], headH, head[j + 1], true, true); x += ws[j]; });
      y += headH;
    };
    const ctxTitle = pg => {
      pg.push(`BT /F2 13 Tf ${M} ${PH - M + 6} Td (${enc(title)}) Tj ET`);
      pg.push(`BT /F1 8.5 Tf ${M} ${PH - M - 6} Td (${enc(subtitle + (blocks.length > 1 ? `  -  colonnes ${bi + 1}/${blocks.length}` : ''))}) Tj ET`);
      y = M + 22;
    };
    start();
    // premier bloc : le titre pousse le tableau sous lui
    for (const r of rows) {
      const lines = [wrap(r[0], timeW - 2 * PAD, true), ...idxs.map((i, j) => wrap(r[i + 1] ?? '', ws[j] - 2 * PAD, false))];
      const h = Math.max(...lines.map(l => l.length)) * LH + 2 * PAD;
      if (y + h > PH - M - 14) { start(); }
      cell(p, M, y, timeW, h, lines[0], true, false);
      let x = M + timeW;
      idxs.forEach((_, j) => { cell(p, x, y, ws[j], h, lines[j + 1], false, false); x += ws[j]; });
      y += h;
    }
    if (!rows.length) text(p, M, y + 14, 'Aucune saisie sur cette periode', false);
  });

  // pieds de page
  pages.forEach((p, i) => {
    p.push(`BT /F1 7 Tf ${M} 16 Td (${enc(`Genere hors-ligne le ${new Date().toLocaleString('fr-FR')} - Aide a la saisie, ne remplace pas le dossier patient`)}) Tj ET`);
    p.push(`BT /F1 7 Tf ${PW - M - 40} 16 Td (${enc(`Page ${i + 1}/${pages.length}`)}) Tj ET`);
  });

  // assemblage PDF
  const objs = [];
  const add = body => { objs.push(body); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(''); // Pages, rempli plus bas
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  pages.forEach(p => {
    const stream = p.join('\n');
    const cid = objs.length + 2;
    const pid = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cid} 0 R >>`);
    add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(`${pid} 0 R`);
  });
  objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((b, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${b}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: 'application/pdf' });
}

// Partage (feuille de partage iOS/Android : « Enregistrer dans Fichiers », AirDrop, mail…) ou téléchargement
export async function savePdf(blob, filename) {
  const file = new File([blob], filename, { type: 'application/pdf' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return 'shared'; }
  } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}
