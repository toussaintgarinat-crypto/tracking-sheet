import { h, clear, toast, uid, toLocalInput, fmtDate, fmtDateLong } from './dom.js';
import { db, requestPersistence } from './db.js';
import { MODULES, BUILTIN_TEMPLATES, templateFields, resolveModules, fmtValue } from './modules.js';
import { buildForm, fieldsEditor } from './engine.js';
import { filterPeriod, buildTable, qrPayloads, printSheet } from './export.js';
import { qrSvg } from './qr.js';
import * as scan from './scan.js';

const app = document.getElementById('app');
const titleEl = document.getElementById('title');
const backBtn = document.getElementById('back');

const PERIODS = [{ h: 6, label: '6 h' }, { h: 12, label: '12 h' }, { h: 24, label: '24 h' }, { h: 48, label: '48 h' }, { h: 0, label: 'Tout' }];

// ---------- Données ----------
async function allTemplates() {
  const custom = await db.all('templates');
  return [...BUILTIN_TEMPLATES, ...custom.sort((a, b) => a.name.localeCompare(b.name))];
}
async function getTemplate(id) {
  return BUILTIN_TEMPLATES.find(t => t.id === id) || (await db.get('templates', id)) || BUILTIN_TEMPLATES[0];
}
function lastValues(entries) {
  const last = {};
  [...entries].sort((a, b) => b.ts - a.ts).forEach(e => { for (const [k, v] of Object.entries(e.values)) if (!(k in last)) last[k] = v; });
  return last;
}
async function saveTemplate(name, fields) {
  const clean = fields.map(({ skip, ...f }) => ({ ...f, group: undefined }));
  const t = { id: 'cus-' + uid(), name, custom: true, desc: 'Fiche personnalisée', fields: clean };
  await db.put('templates', t);
  return t;
}

// ---------- Routeur ----------
const routes = [
  [/^$/, homeView],
  [/^new-patient$/, newPatientView],
  [/^p\/([^/]+)$/, patientView],
  [/^p\/([^/]+)\/new(?:\/([^/]+))?$/, entryView],
  [/^p\/([^/]+)\/table$/, tableView],
  [/^p\/([^/]+)\/qr$/, qrView],
  [/^templates$/, templatesView],
  [/^compose$/, composeView],
  [/^scan$/, scanView],
];

async function render() {
  const path = location.hash.replace(/^#\/?/, '');
  clear(app);
  setHeader('Suivi hospitalier', false);
  window.scrollTo(0, 0);
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      try { await fn(...m.slice(1)); } catch (err) { console.error(err); app.append(h('p', { class: 'error' }, 'Erreur : ' + err.message)); }
      return;
    }
  }
  location.hash = '#/';
}
function setHeader(title, back) {
  titleEl.textContent = title;
  document.title = title + ' · Suivi';
  backBtn.hidden = !back;
}
backBtn.addEventListener('click', () => (history.length > 1 ? history.back() : (location.hash = '#/')));
window.addEventListener('hashchange', render);

const link = (href, text, cls = 'btn') => h('a', { href, class: cls }, text);
const confirmDo = (msg, fn) => { if (confirm(msg)) fn(); };

// ---------- Accueil / patients ----------
async function homeView() {
  const patients = (await db.all('patients')).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const tpls = await allTemplates();
  app.append(h('p', { class: 'lead' }, 'Fonctionne sans réseau. Les données restent sur cet appareil.'));
  const list = h('div', { class: 'cards' });
  for (const p of patients) {
    const entries = await db.entriesOf(p.id);
    const last = entries.sort((a, b) => b.ts - a.ts)[0];
    const t = tpls.find(x => x.id === p.templateId);
    list.append(h('a', { class: 'card patient', href: `#/p/${p.id}` },
      h('strong', {}, p.name),
      h('span', {}, [p.service, t?.name].filter(Boolean).join(' · ')),
      h('small', {}, last ? `${entries.length} saisie(s) · dernière : ${fmtDate(last.ts)}` : 'Aucune saisie')));
  }
  if (!patients.length) list.append(h('p', { class: 'empty' }, 'Aucun patient. Créez une fiche pour commencer.'));
  app.append(list,
    link('#/new-patient', '＋ Nouveau patient', 'btn big'),
    h('div', { class: 'row' }, link('#/scan', '📷 Scanner une fiche papier', 'btn secondary'), link('#/templates', '📋 Modèles de fiches', 'btn secondary')),
    h('details', { class: 'danger-zone' }, h('summary', {}, 'Confidentialité & purge'),
      h('p', {}, 'Aucune donnée n’est envoyée à un serveur. Tout est stocké dans le navigateur de cet appareil.'),
      h('button', { class: 'btn danger', onclick: () => confirmDo('Supprimer DÉFINITIVEMENT tous les patients, saisies et fiches personnalisées de cet appareil ?', async () => { await db.purgeAll(); toast('Toutes les données ont été supprimées'); render(); }) }, 'Tout effacer')));
  if (deferredInstall) app.append(h('button', { class: 'btn secondary', onclick: async () => { deferredInstall.prompt(); deferredInstall = null; } }, '⬇ Installer l’application'));
}

let deferredInstall;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });

async function newPatientView() {
  setHeader('Nouveau patient', true);
  const tpls = await allTemplates();
  const name = h('input', { type: 'text', placeholder: 'Nom ou initiales (ex : Léa M.)', 'aria-label': 'Nom', required: true });
  const service = h('input', { type: 'text', placeholder: 'Service / chambre (facultatif)', 'aria-label': 'Service' });
  const sel = h('select', { 'aria-label': 'Modèle de fiche' },
    h('optgroup', { label: 'Modèles standards' }, BUILTIN_TEMPLATES.map(t => h('option', { value: t.id }, t.name))),
    tpls.some(t => t.custom) ? h('optgroup', { label: 'Mes fiches' }, tpls.filter(t => t.custom).map(t => h('option', { value: t.id }, t.name))) : null);
  const desc = h('small', { class: 'hint' }, BUILTIN_TEMPLATES[0].desc);
  sel.addEventListener('change', () => { desc.textContent = tpls.find(t => t.id === sel.value)?.desc || ''; });
  const form = h('form', { class: 'stack', onsubmit: async e => {
    e.preventDefault();
    if (!name.value.trim()) return name.focus();
    const p = { id: uid(), name: name.value.trim(), service: service.value.trim(), templateId: sel.value, created: Date.now(), updated: Date.now() };
    await db.put('patients', p);
    location.hash = `#/p/${p.id}`;
  } },
    h('label', {}, 'Patient', name), h('label', {}, 'Service', service), h('label', {}, 'Fiche de suivi', sel), desc,
    h('button', { class: 'btn big', type: 'submit' }, 'Créer'),
    h('div', { class: 'row' }, link('#/compose', 'Composer une fiche', 'btn secondary'), link('#/scan', 'Scanner une fiche', 'btn secondary')));
  app.append(form);
}

async function patientView(pid) {
  const p = await db.get('patients', pid);
  if (!p) { location.hash = '#/'; return; }
  setHeader(p.name, true);
  const [t, entries, tpls] = await Promise.all([getTemplate(p.templateId), db.entriesOf(pid), allTemplates()]);
  const fields = templateFields(t);
  const recent = entries.sort((a, b) => b.ts - a.ts).slice(0, 5);
  const sel = h('select', { 'aria-label': 'Fiche de suivi', onchange: async e => { p.templateId = e.target.value; await db.put('patients', p); toast('Fiche changée'); render(); } },
    tpls.map(x => h('option', { value: x.id, selected: x.id === t.id }, x.name)));
  app.append(
    p.service ? h('p', { class: 'lead' }, p.service) : null,
    link(`#/p/${pid}/new`, '＋ Nouvelle saisie', 'btn big'),
    h('div', { class: 'row' }, link(`#/p/${pid}/table`, '📊 Tableau', 'btn secondary'), link(`#/p/${pid}/qr`, '▦ QR code', 'btn secondary')),
    h('label', {}, 'Fiche de suivi', sel),
    h('h2', {}, 'Dernières saisies'),
    recent.length ? h('ul', { class: 'recent' }, recent.map(e => h('li', {}, h('a', { href: `#/p/${pid}/new/${e.id}` },
      h('b', {}, fmtDate(e.ts)), ' ✎ ',
      fields.filter(f => e.values[f.key] != null).slice(0, 4).map(f => `${f.short || f.label} ${fmtValue(f, e.values[f.key])}`).join(' · '))))) : h('p', { class: 'empty' }, 'Aucune saisie.'),
    h('details', { class: 'danger-zone' }, h('summary', {}, 'Sortie d’hospitalisation / purge'),
      h('button', { class: 'btn danger', onclick: () => confirmDo(`Supprimer définitivement ${p.name} et tout son historique (${entries.length} saisie(s)) ?`, async () => { await db.purgePatient(pid); toast('Patient supprimé'); location.hash = '#/'; }) }, 'Supprimer ce patient et son historique')));
}

// ---------- Saisie ----------
async function entryView(pid, eid) {
  const p = await db.get('patients', pid);
  if (!p) { location.hash = '#/'; return; }
  const existing = eid ? await db.get('entries', eid) : null;
  setHeader(existing ? 'Modifier la saisie' : 'Nouvelle saisie', true);
  const t = await getTemplate(p.templateId);
  const fields = templateFields(t);
  const entries = await db.entriesOf(pid);
  const values = { ...(existing?.values || {}) };
  const when = h('input', { type: 'datetime-local', value: toLocalInput(existing?.ts || Date.now()), 'aria-label': 'Date et heure' });
  const now = h('button', { type: 'button', class: 'btn secondary small', onclick: () => { when.value = toLocalInput(Date.now()); } }, 'Maintenant');
  // décalage rapide : le patient a oublié de saisir au moment de la tâche
  const shift = min => { const base = new Date(when.value).getTime() || Date.now(); when.value = toLocalInput(base + min * 60000); };
  const shifts = h('div', { class: 'chips shifts', role: 'group', 'aria-label': 'Décaler l’heure' },
    [[-15, '−15 min'], [-30, '−30 min'], [-60, '−1 h'], [-120, '−2 h'], [-240, '−4 h'], [15, '+15 min']]
      .map(([m, t]) => h('button', { type: 'button', class: 'chip', onclick: () => shift(m) }, t)));
  const save = h('button', { class: 'btn big', type: 'button', onclick: async () => {
    if (!Object.keys(values).length) return toast('Renseignez au moins une valeur');
    const ts = new Date(when.value).getTime() || Date.now();
    await db.put('entries', { id: existing?.id || uid(), patientId: pid, ts, values });
    p.updated = Date.now(); await db.put('patients', p);
    toast('Saisie enregistrée ✓');
    location.hash = `#/p/${pid}`;
  } }, 'Enregistrer');
  app.append(
    h('div', { class: 'whenbar' }, h('label', {}, existing ? 'Date / heure (modifiable)' : 'Date / heure de la tâche', when), now),
    shifts,
    buildForm(fields, values, lastValues(entries.filter(e => e.id !== existing?.id))),
    h('div', { class: 'savebar' }, save,
      existing ? h('button', { class: 'btn danger', type: 'button', onclick: () => confirmDo('Supprimer cette saisie ?', async () => { await db.del('entries', existing.id); history.back(); }) }, 'Supprimer') : null));
}

// ---------- Tableau de bord chronologique ----------
async function tableView(pid) {
  const p = await db.get('patients', pid);
  if (!p) { location.hash = '#/'; return; }
  setHeader(p.name + ' · Tableau', true);
  const t = await getTemplate(p.templateId), fields = templateFields(t), all = await db.entriesOf(pid);
  const st = { hours: 24, hide: false };
  const holder = h('div');
  const draw = () => { holder.replaceChildren(buildTable(fields, filterPeriod(all, st.hours), { hideEmpty: st.hide, onRow: e => (location.hash = `#/p/${pid}/new/${e.id}`) })); };
  const per = periodPicker(st.hours, v => { st.hours = v; draw(); });
  const hide = h('input', { type: 'checkbox', onchange: e => { st.hide = e.target.checked; draw(); } });
  draw();
  app.append(per,
    h('label', { class: 'check' }, hide, ' Masquer les colonnes vides'),
    h('p', { class: 'hint' }, 'Touchez ✎ (ou une ligne) pour corriger une saisie, y compris son heure.'),
    holder,
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => printSheet(p, t, st.hide ? fields.filter(f => filterPeriod(all, st.hours).some(e => e.values[f.key] != null)) : fields, filterPeriod(all, st.hours), PERIODS.find(x => x.h === st.hours).label) }, '🖨 Imprimer / PDF'),
      link(`#/p/${pid}/qr`, '▦ QR code', 'btn secondary')));
}

function periodPicker(current, onPick) {
  const wrap = h('div', { class: 'opts period', role: 'group', 'aria-label': 'Période' });
  PERIODS.forEach(pe => wrap.append(h('button', { type: 'button', class: 'opt' + (pe.h === current ? ' on' : ''), onclick: e => {
    wrap.querySelectorAll('.opt').forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); onPick(pe.h);
  } }, pe.label)));
  return wrap;
}

// ---------- QR code ----------
async function qrView(pid) {
  const p = await db.get('patients', pid);
  if (!p) { location.hash = '#/'; return; }
  setHeader(p.name + ' · QR', true);
  const t = await getTemplate(p.templateId), fields = templateFields(t), all = await db.entriesOf(pid);
  const st = { hours: 12, name: true, i: 0, payloads: [] };
  const box = h('div', { class: 'qrbox' }), info = h('p', { class: 'lead' }), raw = h('pre', { class: 'raw' });
  const nav = h('div', { class: 'row' });
  const draw = () => {
    const entries = filterPeriod(all, st.hours);
    st.payloads = qrPayloads(p, t, fields, entries, { includeName: st.name });
    st.i = Math.min(st.i, st.payloads.length - 1);
    const cur = st.payloads[st.i];
    box.innerHTML = '';
    if (!entries.length) { box.append(h('p', { class: 'empty' }, 'Aucune saisie sur cette période.')); info.textContent = ''; raw.textContent = ''; nav.replaceChildren(); return; }
    const wrap = h('div', { class: 'qr' }); wrap.innerHTML = qrSvg(cur); // SVG généré localement par la bibliothèque
    box.append(wrap);
    info.textContent = `${entries.length} saisie(s) · code ${st.i + 1} / ${st.payloads.length}`;
    raw.textContent = JSON.stringify(JSON.parse(cur), null, 1);
    nav.replaceChildren(
      h('button', { class: 'btn secondary', disabled: st.i === 0, onclick: () => { st.i--; draw(); } }, '‹ Précédent'),
      h('button', { class: 'btn secondary', disabled: st.i >= st.payloads.length - 1, onclick: () => { st.i++; draw(); } }, 'Suivant ›'));
  };
  const nameCb = h('input', { type: 'checkbox', checked: true, onchange: e => { st.name = e.target.checked; draw(); } });
  app.append(periodPicker(st.hours, v => { st.hours = v; st.i = 0; draw(); }),
    h('label', { class: 'check' }, nameCb, ' Inclure le nom du patient'),
    box, info, nav,
    h('p', { class: 'hint' }, 'Le soignant scanne le code avec n’importe quel lecteur : le bilan s’affiche en texte, sans connexion. Si plusieurs codes, les scanner dans l’ordre.'),
    h('details', {}, h('summary', {}, 'Contenu du code'), raw));
  draw();
}

// ---------- Modèles ----------
async function templatesView() {
  setHeader('Modèles de fiches', true);
  const tpls = await allTemplates();
  const card = t => h('div', { class: 'card' }, h('strong', {}, t.name), h('span', {}, t.desc || ''),
    h('small', {}, templateFields(t).map(f => f.label).join(' · ')),
    t.custom ? h('button', { class: 'btn danger small', onclick: () => confirmDo(`Supprimer la fiche « ${t.name} » ?`, async () => { await db.del('templates', t.id); render(); }) }, 'Supprimer') : null);
  app.append(h('div', { class: 'row' }, link('#/compose', '＋ Composer une fiche', 'btn'), link('#/scan', '📷 Scanner une fiche', 'btn secondary')),
    h('h2', {}, 'Standards'), h('div', { class: 'cards' }, tpls.filter(t => !t.custom).map(card)),
    h('h2', {}, 'Mes fiches'), h('div', { class: 'cards' }, tpls.some(t => t.custom) ? tpls.filter(t => t.custom).map(card) : h('p', { class: 'empty' }, 'Aucune fiche personnalisée.')));
}

async function composeView() {
  setHeader('Composer une fiche', true);
  const fields = [];
  const name = h('input', { type: 'text', placeholder: 'Nom de la fiche (ex : Chirurgie – bloc 2)', 'aria-label': 'Nom de la fiche' });
  const editor = fieldsEditor(fields);
  const mods = h('div', { class: 'opts' }, Object.entries(MODULES).map(([id, m]) => h('button', { type: 'button', class: 'opt', onclick: e => {
    const on = e.currentTarget.classList.toggle('on');
    const names = m.fields.map(f => f.key);
    if (on) fields.push(...resolveModules([id]));
    else for (let i = fields.length - 1; i >= 0; i--) if (fields[i].group === m.name && names.includes(fields[i].key)) fields.splice(i, 1);
    editor.refresh();
  } }, `${m.icon} ${m.name}`)));
  app.append(h('label', {}, 'Nom', name), h('h2', {}, '1. Choisir des modules'), mods, h('h2', {}, '2. Ajuster les champs'), editor,
    h('button', { class: 'btn big', onclick: async () => {
      if (!name.value.trim()) return name.focus();
      if (!fields.length) return toast('Ajoutez au moins un champ');
      await saveTemplate(name.value.trim(), fields); toast('Fiche enregistrée ✓'); location.hash = '#/templates';
    } }, 'Enregistrer la fiche'));
}

// ---------- Scan d'une fiche papier ----------
function quadEditor(srcCanvas, quad, onChange) {
  const maxW = Math.min(app.clientWidth || 640, 760);
  const k = maxW / srcCanvas.width;
  const cv = h('canvas', { class: 'quad', width: Math.round(srcCanvas.width * k), height: Math.round(srcCanvas.height * k) });
  const ctx = cv.getContext('2d');
  let drag = -1;
  const draw = () => {
    ctx.drawImage(srcCanvas, 0, 0, cv.width, cv.height);
    ctx.beginPath(); quad.forEach((q, i) => (i ? ctx.lineTo(q.x * k, q.y * k) : ctx.moveTo(q.x * k, q.y * k))); ctx.closePath();
    ctx.lineWidth = 3; ctx.strokeStyle = '#e8590c'; ctx.stroke();
    quad.forEach(q => { ctx.beginPath(); ctx.arc(q.x * k, q.y * k, 14, 0, 7); ctx.fillStyle = 'rgba(232,89,12,.85)'; ctx.fill(); });
  };
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cv.width / r.width) / k, y: (e.clientY - r.top) * (cv.height / r.height) / k }; };
  cv.addEventListener('pointerdown', e => {
    const m = pos(e); let best = 0, bd = 1e9;
    quad.forEach((q, i) => { const d = Math.hypot(q.x - m.x, q.y - m.y); if (d < bd) { bd = d; best = i; } });
    drag = best; cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', e => { if (drag < 0) return; const m = pos(e); quad[drag] = { x: Math.max(0, Math.min(srcCanvas.width - 1, m.x)), y: Math.max(0, Math.min(srcCanvas.height - 1, m.y)) }; draw(); onChange?.(); });
  cv.addEventListener('pointerup', () => { drag = -1; });
  draw();
  return cv;
}

async function scanView() {
  setHeader('Scanner une fiche', true);
  const S = { name: '', fields: [], mode: 'row' };
  const ocrState = h('small', { class: 'hint' }, 'Préparation de l’OCR hors-ligne…');
  scan.prefetchOcr(ok => { ocrState.textContent = ok ? '✓ OCR disponible hors-ligne' : '⚠ OCR non encore téléchargé : connectez-vous une fois pour l’activer. Vous pourrez toujours saisir les intitulés à la main.'; });

  const busy = msg => { clear(app); app.append(h('p', { class: 'lead busy' }, msg)); };

  const step1 = () => {
    clear(app);
    const input = h('input', { type: 'file', accept: 'image/*', capture: 'environment', id: 'photo', hidden: true, onchange: async e => {
      const file = e.target.files[0]; if (!file) return;
      busy('Chargement de l’image…');
      S.src = await scan.loadGray(file);
      S.srcCanvas = scan.grayToCanvas(scan.normalize(S.src.gray, S.src.w, S.src.h), S.src.w, S.src.h);
      S.quad = scan.guessQuad(S.src.gray, S.src.w, S.src.h);
      step2();
    } });
    app.append(h('p', { class: 'lead' }, 'Photographiez la fiche papier vierge du service, bien à plat et éclairée. L’application en recrée une version numérique.'),
      input, h('label', { class: 'btn big', for: 'photo' }, '📷 Prendre / choisir une photo'),
      ocrState,
      h('button', { class: 'btn secondary', onclick: () => { S.fields = []; step4(); } }, 'Saisir les intitulés à la main'));
  };

  const step2 = () => {
    clear(app);
    app.append(h('p', { class: 'lead' }, 'Déplacez les 4 coins orange sur les angles du tableau.'),
      quadEditor(S.srcCanvas, S.quad),
      h('div', { class: 'row' }, h('button', { class: 'btn secondary', onclick: step1 }, 'Autre photo'),
        h('button', { class: 'btn', onclick: () => { busy('Redressement et analyse du tableau…'); setTimeout(step3, 30); } }, 'Redresser et analyser')));
  };

  const step3 = () => {
    const flat = scan.warp(S.src.gray, S.src.w, S.src.h, S.quad);
    const warped = scan.deskew(flat.gray, flat.w, flat.h);
    S.w = warped.w; S.h = warped.h;
    S.norm = scan.normalize(warped.gray, warped.w, warped.h);
    S.grid = scan.detectGrid(scan.binarize(S.norm), S.w, S.h);
    clear(app);
    const cv = scan.grayToCanvas(S.norm, S.w, S.h); cv.className = 'preview';
    if (S.grid) {
      const ctx = cv.getContext('2d'); ctx.strokeStyle = 'rgba(232,89,12,.9)'; ctx.lineWidth = 3;
      S.grid.xs.forEach(x => { ctx.beginPath(); ctx.moveTo(x, S.grid.ys[0]); ctx.lineTo(x, S.grid.ys.at(-1)); ctx.stroke(); });
      S.grid.ys.forEach(y => { ctx.beginPath(); ctx.moveTo(S.grid.xs[0], y); ctx.lineTo(S.grid.xs.at(-1), y); ctx.stroke(); });
      S.mode = scan.guessOrientation(S.grid);
    }
    const mode = h('select', { 'aria-label': 'Position des intitulés', onchange: e => { S.mode = e.target.value; } },
      h('option', { value: 'row', selected: S.mode === 'row' }, 'Intitulés sur la 1re ligne (colonnes = paramètres)'),
      h('option', { value: 'col', selected: S.mode === 'col' }, 'Intitulés sur la 1re colonne (lignes = paramètres)'));
    app.append(cv,
      S.grid ? h('p', { class: 'lead' }, `Tableau détecté : ${S.grid.xs.length - 1} colonnes × ${S.grid.ys.length - 1} lignes.`) : h('p', { class: 'error' }, 'Aucune grille détectée. Réajustez le cadrage ou saisissez les intitulés à la main.'),
      S.grid ? h('label', {}, 'Intitulés', mode) : null,
      h('div', { class: 'row' }, h('button', { class: 'btn secondary', onclick: step2 }, '‹ Cadrage'),
        S.grid ? h('button', { class: 'btn', onclick: runOcr }, 'Lire les intitulés (OCR)') : h('button', { class: 'btn', onclick: () => { S.fields = []; step4(); } }, 'Saisir à la main')));
  };

  const runOcr = async () => {
    const cells = scan.headerCells(S.grid, S.mode);
    busy('Lecture des intitulés…');
    const bar = h('progress', { max: cells.length, value: 0 }); app.append(bar);
    let labels;
    try { labels = await scan.ocrCells(S.norm, S.w, cells, i => { bar.value = i; }); }
    catch (err) { toast(err.message); labels = cells.map(() => ''); }
    S.fields = labels.map((l, i) => scan.inferField(l, i)).filter(f => !f.skip);
    step4();
  };

  const step4 = () => {
    clear(app);
    const name = h('input', { type: 'text', placeholder: 'Nom de la fiche (ex : Service X – surveillance)', value: S.name, 'aria-label': 'Nom de la fiche', oninput: e => { S.name = e.target.value; } });
    app.append(
      h('p', { class: 'lead' }, 'Vérifiez les colonnes lues : corrigez l’intitulé et le type de saisie. La date/heure est ajoutée automatiquement.'),
      h('label', {}, 'Nom de la fiche', name),
      fieldsEditor(S.fields),
      h('button', { class: 'btn big', onclick: async () => {
        if (!S.name.trim()) return name.focus();
        if (!S.fields.length) return toast('Ajoutez au moins une colonne');
        const t = await saveTemplate(S.name.trim(), S.fields);
        await scan.stopOcr();
        toast('Fiche créée ✓');
        location.hash = '#/new-patient';
        void t;
      } }, 'Créer la fiche numérique'));
  };
  step1();
}

// ---------- Démarrage ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
requestPersistence();
window.addEventListener('online', () => document.body.classList.remove('offline'));
window.addEventListener('offline', () => document.body.classList.add('offline'));
if (!navigator.onLine) document.body.classList.add('offline');
render();
