// Restitution : tableau chronologique, charges utiles QR (JSON compact), impression/PDF.
import { h, fmtDate } from './dom.js';
import { fmtValue } from './modules.js';
import { buildPdf, savePdf } from './pdf.js';

export function filterPeriod(entries, hours) {
  const sorted = [...entries].sort((a, b) => a.ts - b.ts);
  if (!hours) return sorted;
  const from = Date.now() - hours * 3600e3;
  return sorted.filter(e => e.ts >= from);
}

// Grille chronologique reprenant les colonnes de la fiche
export function buildTable(fields, entries, { hideEmpty = false, onRow } = {}) {
  const cols = hideEmpty ? fields.filter(f => entries.some(e => e.values[f.key] != null)) : fields;
  // ligne de groupes (modules)
  const groups = [];
  cols.forEach(f => {
    const last = groups[groups.length - 1];
    if (last && last.name === (f.group || '')) last.span++;
    else groups.push({ name: f.group || '', span: 1 });
  });
  const showGroups = groups.some(g => g.name);
  const thead = h('thead', {},
    showGroups ? h('tr', { class: 'grp' }, h('th', {}), groups.map(g => h('th', { colspan: g.span }, g.name))) : null,
    h('tr', {}, h('th', { class: 'time' }, 'Date / heure'),
      cols.map(f => h('th', {}, f.label, f.unit ? h('small', {}, ` ${f.unit}`) : null)),
      onRow ? h('th', { class: 'edit' }, '') : null));
  const tbody = h('tbody', {}, entries.map(e =>
    h('tr', { onclick: onRow && !e._ro ? () => onRow(e) : null, tabindex: onRow && !e._ro ? 0 : null },
      h('th', { class: 'time', scope: 'row' }, fmtDate(e.ts), e._by ? h('small', { class: 'by' }, ' · ' + e._by) : null),
      cols.map(f => h('td', {}, fmtValue(f, e.values[f.key]))),
      onRow ? h('td', { class: 'edit' }, e._ro ? null : h('button', { type: 'button', class: 'mini', 'aria-label': `Modifier la saisie du ${fmtDate(e.ts)} (heure comprise)`, onclick: ev => { ev.stopPropagation(); onRow(e); } }, '✎')) : null)));
  if (!entries.length) tbody.append(h('tr', {}, h('td', { colspan: cols.length + (onRow ? 2 : 1), class: 'empty' }, 'Aucune saisie sur cette période')));
  return h('div', { class: 'table-wrap' }, h('table', { class: 'grid' }, thead, tbody));
}

const utf8Len = s => new TextEncoder().encode(s).length;

// Découpe le bilan en un ou plusieurs JSON autonomes (chacun tient dans un QR lisible)
export function qrPayloads(patient, template, fields, entries, { includeName = true, maxBytes = 600 } = {}) {
  const keyOf = new Map();
  const used = new Set();
  fields.forEach(f => {
    let k = (f.short || f.label).replace(/\s+/g, '').slice(0, 8) || f.key;
    while (used.has(k)) k += "'";
    used.add(k); keyOf.set(f.key, k);
  });
  const rows = entries.map(e => {
    const r = { d: fmtDate(e.ts) };
    for (const f of fields) {
      const v = e.values[f.key];
      if (v == null || v === '') continue;
      r[keyOf.get(f.key)] = typeof v === 'boolean' ? (v ? 'Oui' : 'Non') : v;
    }
    return r;
  });
  const legendFor = chunk => {
    const lg = {};
    for (const f of fields) {
      const k = keyOf.get(f.key);
      if (k !== f.label && chunk.some(r => k in r)) lg[k] = f.label + (f.unit ? ` (${f.unit})` : '');
    }
    return lg;
  };
  const head = (chunk, n, total) => ({
    v: 1,
    ...(includeName ? { p: patient.name } : {}),
    ...(n === 1 ? { f: template.name, g: new Date().toISOString().slice(0, 16).replace('T', ' ') } : {}),
    ...(total > 1 ? { n: `${n}/${total}` } : {}),
    ...(n === 1 ? { k: legendFor(chunk) } : {}),
    r: chunk,
  });
  // découpage glouton
  const chunks = [];
  let cur = [];
  for (const r of rows) {
    const trial = [...cur, r];
    if (cur.length && utf8Len(JSON.stringify(head(trial, chunks.length + 1 === 1 ? 1 : 2, 99))) > maxBytes) { chunks.push(cur); cur = [r]; }
    else cur = trial;
  }
  if (cur.length || !chunks.length) chunks.push(cur);
  return chunks.map((c, i) => JSON.stringify(head(c, i + 1, chunks.length)));
}

// Impression / export PDF via la boîte d'impression du navigateur
export function printSheet(patient, template, fields, entries, periodLabel) {
  let sheet = document.getElementById('print-sheet');
  if (!sheet) { sheet = h('div', { id: 'print-sheet' }); document.body.append(sheet); }
  sheet.replaceChildren(
    h('h1', {}, `Suivi – ${patient.name}`),
    h('p', {}, `${template.name}${patient.service ? ' · ' + patient.service : ''} · ${periodLabel} · édité le ${new Date().toLocaleString('fr-FR')}`),
    buildTable(fields, entries, { hideEmpty: false }));
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 50);
}

// Vrai fichier PDF (feuille de partage sur mobile, téléchargement sinon)
export async function exportPdf(patient, template, fields, entries, periodLabel) {
  const cols = fields.map(f => ({ label: f.label + (f.unit ? ` (${f.unit})` : '') }));
  const rows = entries.map(e => [fmtDate(e.ts), ...fields.map(f => fmtValue(f, e.values[f.key]))]);
  const blob = buildPdf({
    title: `Suivi - ${patient.name}`,
    subtitle: `${template.name}${patient.service ? ' - ' + patient.service : ''} - ${periodLabel} - ${entries.length} saisie(s)`,
    columns: cols, rows,
  });
  const safe = patient.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'patient';
  return savePdf(blob, `suivi-${safe}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
