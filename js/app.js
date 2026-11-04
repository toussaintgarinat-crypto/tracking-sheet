import { h, clear, toast, uid, toLocalInput, fmtDate, fmtDateLong } from './dom.js';
import { db, requestPersistence } from './db.js';
import { MODULES, BUILTIN_TEMPLATES, templateFields, resolveModules, fmtValue } from './modules.js';
import { buildForm, fieldsEditor } from './engine.js';
import { filterPeriod, buildTable, qrPayloads, printSheet, exportPdf } from './export.js';
import { qrSvg } from './qr.js';
import * as scan from './scan.js';
import * as rx from './receive.js';
import * as bk from './backup.js';
import * as sync from './sync.js';
import * as qs from './qrsync.js';
import { setClientId, hasClientId, hasToken } from './drive.js';

const app = document.getElementById('app');
const titleEl = document.getElementById('title');
const backBtn = document.getElementById('back');
// app.append natif écrit « null » pour les valeurs vides : on les filtre
const put = (...nodes) => app.append(...nodes.flat(Infinity).filter(n => n != null && n !== false));

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
  [/^share$/, shareView],
  [/^dossiers$/, dossiersView],
  [/^suivi$/, suiviView],
  [/^scansync$/, scanSyncView],
  [/^p\/([^/]+)\/qrsync$/, qrSyncView],
  [/^p\/([^/]+)\/seuils$/, seuilsView],
  [/^p\/([^/]+)\/messages$/, messagesView],
  [/^p\/([^/]+)\/sync$/, syncView],
  [/^backup$/, backupView],
  [/^receive$/, receiveView],
  [/^r\/(.+)$/, receivedView],
];

let stopCamera = null;
const getMode = () => { try { return localStorage.getItem('mode') === 'medical' ? 'medical' : 'patient'; } catch { return 'patient'; } };
const setMode = m => { try { localStorage.setItem('mode', m); } catch { /* ignoré */ } render(); };

// Rappel : des données ont changé depuis la dernière sauvegarde
function backupBanner() {
  const { lastBackup, lastChange } = bk.backupState();
  if (!lastChange || lastChange <= lastBackup) return null;
  const when = lastBackup ? `dernière sauvegarde le ${fmtDateLong(lastBackup)}` : 'aucune sauvegarde pour l’instant';
  return h('a', { class: 'banner', href: '#/backup' }, h('strong', {}, '⚠ Données non sauvegardées'), h('span', {}, `${when}. Touchez pour sauvegarder.`));
}
const dossiersLink = () => link('#/dossiers', '👥 Dossiers partagés', 'btn secondary');
const backupLink = () => link('#/backup', '💾 Sauvegarde & restauration', 'btn secondary');

function modeSwitch() {
  const cur = getMode();
  return h('div', { class: 'modes', role: 'group', 'aria-label': 'Mode' },
    h('button', { type: 'button', class: 'opt' + (cur === 'patient' ? ' on' : ''), 'aria-pressed': cur === 'patient', onclick: () => setMode('patient') }, '🧑 Patient'),
    h('button', { type: 'button', class: 'opt' + (cur === 'medical' ? ' on' : ''), 'aria-pressed': cur === 'medical', onclick: () => setMode('medical') }, '🩺 Corps médical'));
}

async function render() {
  if (stopCamera) { stopCamera(); stopCamera = null; }
  const path = location.hash.replace(/^#\/?/, '');
  clear(app);
  setHeader('Suivi hospitalier', false);
  window.scrollTo(0, 0);
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      try { await fn(...m.slice(1)); } catch (err) { console.error(err); put(h('p', { class: 'error' }, 'Erreur : ' + err.message)); }
      // sur tous les écrans secondaires : retour d'un niveau + retour au menu principal (sauf scanner caméra en cours)
      if (path) put(h('div', { class: 'row navbar' }, h('a', { class: 'btn secondary', href: '#/' + parentOf(path) }, '‹ Retour'), link('#/', '🏠 Menu principal', 'btn secondary')));
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
// Écran « parent » logique : le retour reste dans l'application (jamais hors de l'appli, même après un rechargement)
function parentOf(path) {
  if (/^p\/[^/]+\/(new|table|qr|qrsync|sync|messages|seuils)/.test(path)) return path.match(/^p\/[^/]+/)[0];
  if (/^r\/.+/.test(path)) return '';
  if (path === 'receive' || path === 'suivi' || path === 'scansync') return '';
  if (path === 'compose') return 'templates';
  return '';
}
backBtn.addEventListener('click', () => { location.hash = '#/' + parentOf(location.hash.replace(/^#\/?/, '')); });
window.addEventListener('hashchange', render);

const link = (href, text, cls = 'btn') => h('a', { href, class: cls }, text);
const confirmDo = (msg, fn) => { if (confirm(msg)) fn(); };

// ---------- Accueil / patients ----------
async function homeView() {
  put(modeSwitch(), backupBanner());
  if (getMode() === 'medical') return medicalHome();
  setHeader('Suivi hospitalier · Patient', false);
  const patients = (await db.all('patients')).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const tpls = await allTemplates();
  put(h('p', { class: 'lead' }, 'Fonctionne sans réseau. Les données restent sur cet appareil.'));
  const list = h('div', { class: 'cards' });
  for (const p of patients) {
    const entries = await db.allEntriesOf(p.id);
    const last = entries.sort((a, b) => b.ts - a.ts)[0];
    const t = tpls.find(x => x.id === p.templateId);
    list.append(h('a', { class: 'card patient', href: `#/p/${p.id}` },
      h('strong', {}, p.name),
      h('span', {}, [p.service, t?.name, p.share ? '👥 partagé' : ''].filter(Boolean).join(' · ')),
      h('small', {}, last ? `${entries.length} saisie(s) · dernière : ${fmtDate(last.ts)}` : 'Aucune saisie')));
  }
  if (!patients.length) list.append(h('p', { class: 'empty' }, 'Aucun patient. Créez une fiche pour commencer.'));
  put(list,
    link('#/new-patient', '＋ Nouveau patient', 'btn big'),
    h('div', { class: 'row' }, link('#/scan', '📷 Scanner une fiche papier', 'btn secondary'), link('#/templates', '📋 Modèles de fiches', 'btn secondary')),
    dossiersLink(), backupLink(),
    link('#/share', '📲 Partager l’application (QR)', 'btn secondary'),
    h('details', { class: 'danger-zone' }, h('summary', {}, 'Confidentialité & purge'),
      h('p', {}, 'Rien n’est envoyé à un serveur, sauf les dossiers que vous choisissez de partager (Google Drive). Le reste est stocké dans le navigateur de cet appareil.'),
      h('button', { class: 'btn danger', onclick: () => confirmDo('Supprimer DÉFINITIVEMENT tous les patients, saisies et fiches personnalisées de cet appareil ?', async () => { await db.purgeAll(); toast('Toutes les données ont été supprimées'); render(); }) }, 'Tout effacer')));
  if (deferredInstall) put(h('button', { class: 'btn secondary', onclick: async () => { deferredInstall.prompt(); deferredInstall = null; } }, '⬇ Installer l’application'));
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
  put(form);
}

async function patientView(pid) {
  const p = await db.get('patients', pid);
  if (!p) { location.hash = '#/'; return; }
  setHeader(p.name, true);
  const [t, entries, tpls] = await Promise.all([getTemplate(p.templateId), db.allEntriesOf(pid), allTemplates()]);
  const canWrite = sync.can(p, 'write');
  const pend = p.share && canWrite && !sync.can(p, 'ask') ? (await sync.thread(p)).pending : null;
  const fields = templateFields(t);
  const recent = entries.sort((a, b) => b.ts - a.ts).slice(0, 5);
  const sel = h('select', { 'aria-label': 'Fiche de suivi', onchange: async e => { p.templateId = e.target.value; await db.put('patients', p); toast('Fiche changée'); render(); } },
    tpls.map(x => h('option', { value: x.id, selected: x.id === t.id }, x.name)));
  put(
    p.service ? h('p', { class: 'lead' }, p.service) : null,
    p.share ? h('a', { class: 'banner info', href: `#/p/${pid}/sync` }, h('strong', {}, `👥 Dossier partagé · ${sync.ROLES[p.share.role].label}`), h('span', {}, p.share.syncedAt ? `Synchronisé le ${fmtDateLong(p.share.syncedAt)}. Touchez pour synchroniser / gérer.` : p.share.folder ? 'Touchez pour synchroniser.' : 'Échange par QR code, sans réseau. Touchez pour gérer.')) : null,
    pend ? h('a', { class: 'banner', href: `#/p/${pid}/messages` }, h('strong', {}, `💬 ${pend.by} demande de vos nouvelles`), h('span', {}, 'Touchez pour répondre en un tap.')) : null,
    canWrite ? link(`#/p/${pid}/new`, '＋ Nouvelle saisie', 'btn big') : h('p', { class: 'hint' }, 'Lecture seule : vous ne pouvez pas ajouter de saisie.'),
    h('div', { class: 'row' }, link(`#/p/${pid}/table`, '📊 Tableau', 'btn secondary'), link(`#/p/${pid}/qr`, '▦ Transmettre au soignant', 'btn secondary'), p.share ? link(`#/p/${pid}/messages`, '💬 Messages', 'btn secondary') : null, p.share ? link(`#/p/${pid}/qrsync`, '▦ Échanger par QR', 'btn secondary') : null, link(`#/p/${pid}/seuils`, '🔔 Seuils d’alerte', 'btn secondary')),
    h('label', {}, 'Fiche de suivi', sel),
    pdfBox(p, t, fields, entries),
    h('h2', {}, 'Dernières saisies'),
    recent.length ? h('ul', { class: 'recent' }, recent.map(e => h('li', {}, h(e._ro ? 'div' : 'a', e._ro ? { class: 'ro' } : { href: `#/p/${pid}/new/${e.id}` },
      h('b', {}, fmtDate(e.ts)), e._ro ? ` · ${e._by} 🔒 ` : ' ✎ ',
      fields.filter(f => e.values[f.key] != null).slice(0, 4).map(f => `${f.short || f.label} ${fmtValue(f, e.values[f.key])}`).join(' · '))))) : h('p', { class: 'empty' }, 'Aucune saisie.'),
    h('details', { class: 'danger-zone' }, h('summary', {}, 'Sortie d’hospitalisation / purge'),
      h('button', { class: 'btn danger', onclick: () => confirmDo(`Supprimer définitivement ${p.name} et tout son historique (${entries.length} saisie(s)) ?`, async () => { if (p.share) await sync.leaveShare(p, true); else await db.purgePatient(pid); toast('Patient supprimé'); location.hash = '#/'; }) }, 'Supprimer ce patient et son historique')));
}

// Export PDF : choix de la période + bouton (utilisé sur la fiche patient)
function pdfBox(p, t, fields, entries) {
  let hours = 24;
  const btn = h('button', { class: 'btn', type: 'button', onclick: async () => {
    const list = filterPeriod(entries, hours);
    const res = await exportPdf(p, t, fields, list, PERIODS.find(x => x.h === hours).label);
    if (res === 'downloaded') toast('PDF enregistré dans les téléchargements');
  } }, '📄 Exporter en PDF');
  return h('div', { class: 'pdfbox' }, h('h2', {}, 'PDF'), periodPicker(hours, v => { hours = v; }), btn);
}

// ---------- Saisie ----------
async function entryView(pid, eid) {
  const p = await db.get('patients', pid);
  if (!p) { location.hash = '#/'; return; }
  if (!sync.can(p, 'write')) { toast('Lecture seule'); location.hash = `#/p/${pid}`; return; }
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
    if (p.share?.folder && hasToken()) sync.syncNow(p).catch(() => {}); // envoi discret (rien si hors-ligne / pas connecté)
  } }, 'Enregistrer');
  put(
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
  const t = await getTemplate(p.templateId), fields = templateFields(t), all = await db.allEntriesOf(pid);
  const st = { hours: 24, hide: false };
  const holder = h('div');
  const draw = () => { holder.replaceChildren(buildTable(fields, filterPeriod(all, st.hours), { hideEmpty: st.hide, onRow: sync.can(p, 'write') ? (e => (location.hash = `#/p/${pid}/new/${e.id}`)) : null })); };
  const per = periodPicker(st.hours, v => { st.hours = v; draw(); });
  const hide = h('input', { type: 'checkbox', onchange: e => { st.hide = e.target.checked; draw(); } });
  draw();
  put(per,
    h('label', { class: 'check' }, hide, ' Masquer les colonnes vides'),
    h('p', { class: 'hint' }, 'Touchez ✎ (ou une ligne) pour corriger une saisie, y compris son heure.'),
    holder,
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: async () => { const r = await exportPdf(p, t, fields, filterPeriod(all, st.hours), PERIODS.find(x => x.h === st.hours).label); if (r === 'downloaded') toast('PDF enregistré'); } }, '📄 Exporter en PDF'),
      h('button', { class: 'btn secondary', onclick: () => printSheet(p, t, st.hide ? fields.filter(f => filterPeriod(all, st.hours).some(e => e.values[f.key] != null)) : fields, filterPeriod(all, st.hours), PERIODS.find(x => x.h === st.hours).label) }, '🖨 Imprimer'),
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
  const t = await getTemplate(p.templateId), fields = templateFields(t), all = await db.allEntriesOf(pid);
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
  put(periodPicker(st.hours, v => { st.hours = v; st.i = 0; draw(); }),
    h('label', { class: 'check' }, nameCb, ' Inclure le nom du patient'),
    box, info, nav,
    h('p', { class: 'hint' }, 'Le soignant scanne le code avec n’importe quel lecteur : le bilan s’affiche en texte, sans connexion. Si plusieurs codes, les scanner dans l’ordre.'),
    h('button', { class: 'btn secondary', onclick: async () => {
      const txt = st.payloads.join('\n');
      try { if (navigator.share) { await navigator.share({ text: txt, title: 'Bilan ' + p.name }); return; } } catch (e) { if (e.name === 'AbortError') return; }
      try { await navigator.clipboard.writeText(txt); toast('Bilan copié'); } catch { toast('Copie impossible'); }
    } }, '↗ Partager le bilan en texte'),
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
  put(h('div', { class: 'row' }, link('#/compose', '＋ Composer une fiche', 'btn'), link('#/scan', '📷 Scanner une fiche', 'btn secondary')),
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
  put(h('label', {}, 'Nom', name), h('h2', {}, '1. Choisir des modules'), mods, h('h2', {}, '2. Ajuster les champs'), editor,
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

  const busy = msg => { clear(app); put(h('p', { class: 'lead busy' }, msg)); };

  const step1 = () => {
    clear(app);
    // deux entrées : appareil photo (capture) ou photo existante (galerie / fichiers) – sans `capture`, iOS/Android proposent la photothèque
    const onFile = async e => {
      const file = e.target.files[0]; if (!file) return;
      busy('Chargement de l’image…');
      try {
        S.src = await scan.loadGray(file);
      } catch { clear(app); toast('Image illisible : essayez une photo JPEG ou PNG'); return step1(); }
      S.srcCanvas = scan.grayToCanvas(scan.normalize(S.src.gray, S.src.w, S.src.h), S.src.w, S.src.h);
      S.quad = scan.guessQuad(S.src.gray, S.src.w, S.src.h);
      step2();
    };
    const camera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', id: 'photo-camera', hidden: true, onchange: onFile });
    const gallery = h('input', { type: 'file', accept: 'image/*', id: 'photo', hidden: true, onchange: onFile });
    put(h('p', { class: 'lead' }, 'Prenez la fiche papier vierge du service en photo, ou importez une photo déjà enregistrée sur le téléphone. Cadrez bien à plat et éclairé : l’application en recrée une version numérique.'),
      camera, gallery,
      h('label', { class: 'btn big', for: 'photo-camera' }, '📷 Prendre une photo'),
      h('label', { class: 'btn big secondary', for: 'photo' }, '🖼 Importer une photo existante'),
      ocrState,
      h('button', { class: 'btn secondary', onclick: () => { S.fields = []; step4(); } }, 'Saisir les intitulés à la main'));
  };

  const step2 = () => {
    clear(app);
    put(h('p', { class: 'lead' }, 'Déplacez les 4 coins orange sur les angles du tableau.'),
      quadEditor(S.srcCanvas, S.quad),
      h('div', { class: 'row' }, h('button', { class: 'btn secondary', onclick: step1 }, 'Autre photo'),
        h('button', { class: 'btn', onclick: () => { busy('Redressement et analyse du tableau…'); setTimeout(step3, 30); } }, 'Redresser et analyser')));
  };

  const step3 = () => {
    const flat = scan.warp(S.src.gray, S.src.w, S.src.h, S.quad);
    const res = scan.analyze(flat.gray, flat.w, flat.h);
    S.w = res.w; S.h = res.h; S.norm = res.gray; S.grid = res.grid;
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
    put(cv,
      S.grid ? h('p', { class: 'lead' }, `Tableau détecté : ${S.grid.xs.length - 1} colonnes × ${S.grid.ys.length - 1} lignes.`) : h('p', { class: 'error' }, 'Aucune grille détectée. Réajustez le cadrage ou saisissez les intitulés à la main.'),
      S.grid ? h('label', {}, 'Intitulés', mode) : null,
      h('div', { class: 'row' }, h('button', { class: 'btn secondary', onclick: step2 }, '‹ Cadrage'),
        S.grid ? h('button', { class: 'btn', onclick: runOcr }, 'Lire les intitulés (OCR)') : h('button', { class: 'btn', onclick: () => { S.fields = []; step4(); } }, 'Saisir à la main')));
  };

  const runOcr = async () => {
    const cells = scan.headerCells(S.grid, S.mode);
    busy('Lecture des intitulés…');
    const bar = h('progress', { max: cells.length, value: 0 }); put(bar);
    let labels;
    try { labels = await scan.ocrCells(S.norm, S.w, cells, i => { bar.value = i; }); }
    catch (err) { toast(err.message); labels = cells.map(() => ''); }
    S.fields = labels.map((l, i) => scan.inferField(l, i)).filter(f => !f.skip);
    step4();
  };

  const step4 = () => {
    clear(app);
    const name = h('input', { type: 'text', placeholder: 'Nom de la fiche (ex : Service X – surveillance)', value: S.name, 'aria-label': 'Nom de la fiche', oninput: e => { S.name = e.target.value; } });
    put(
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

// ---------- Mode corps médical : réception des bilans ----------
async function medicalHome() {
  setHeader('Suivi hospitalier · Corps médical', false);
  const recs = (await db.all('received')).sort((x, y) => y.updated - x.updated);
  const list = h('div', { class: 'cards' }, recs.map(r => h('a', { class: 'card patient', href: `#/r/${encodeURIComponent(r.id)}` },
    h('strong', {}, r.name), h('span', {}, r.template),
    h('small', {}, `${r.rows.length} saisie(s) · reçu le ${fmtDateLong(r.updated)}`))));
  if (!recs.length) list.append(h('p', { class: 'empty' }, 'Aucun bilan reçu. Scannez le QR code affiché sur le téléphone du patient.'));
  put(h('p', { class: 'lead' }, 'Recevez les bilans transmis par les patients (QR code), sans réseau. Les données restent sur cet appareil.'),
    link('#/suivi', '📊 Tableau de suivi des patients', 'btn big'),
    link('#/receive', '📥 Recevoir un bilan (scanner)', 'btn secondary'),
    h('h2', {}, 'Bilans reçus'), list,
    dossiersLink(), backupLink(),
    link('#/share', '📲 Partager l’application (QR)', 'btn secondary'),
    recs.length ? h('details', { class: 'danger-zone' }, h('summary', {}, 'Purge'),
      h('button', { class: 'btn danger', onclick: () => confirmDo('Supprimer DÉFINITIVEMENT tous les bilans reçus sur cet appareil ?', async () => { await db.purgeReceived(); toast('Bilans supprimés'); render(); }) }, 'Effacer tous les bilans reçus')) : null);
}

function receiveView() {
  setHeader('Recevoir un bilan', true);
  const session = new rx.Session();
  const video = h('video', { class: 'cam', playsinline: '', muted: '' });
  const status = h('p', { class: 'lead' }, 'Cadrez le QR code affiché sur le téléphone du patient.');
  const chips = h('div', { class: 'chips parts' });
  const finishBtn = h('button', { class: 'btn', disabled: true, onclick: () => finish() }, '✓ Terminer et enregistrer');
  let lastBad = '', done = false;

  const refresh = () => {
    chips.replaceChildren(...(session.total > 1 ? Array.from({ length: session.total }, (_, i) =>
      h('span', { class: 'chip' + (session.parts.has(i + 1) ? ' last' : '') }, `${session.parts.has(i + 1) ? '✓' : '·'} ${i + 1}`)) : []));
    finishBtn.disabled = session.count === 0;
    status.textContent = session.total > 1 ? `Codes reçus : ${session.count} / ${session.total}. Scannez les suivants (dans n’importe quel ordre).` : 'Cadrez le QR code affiché sur le téléphone du patient.';
  };
  async function finish() {
    if (done || !session.count) return;
    done = true; if (stopCamera) { stopCamera(); stopCamera = null; }
    const id = await rx.saveReceived(session);
    if (navigator.vibrate) navigator.vibrate(80);
    toast(session.complete ? 'Bilan reçu ✓' : `Bilan enregistré (${session.count}/${session.total} codes)`);
    location.hash = `#/r/${encodeURIComponent(id)}`;
  }
  const handle = text => {
    if (done) return;
    const list = rx.parseMany(text);
    if (!list.length) { if (text !== lastBad) { lastBad = text; toast('Ce code n’est pas un bilan de suivi'); } return; }
    for (const j of list) {
      const r = session.add(j);
      if (r === 'other' && text !== lastBad) { lastBad = text; toast('Code d’un autre patient : terminez d’abord ce bilan'); }
      if (r === 'ok' && navigator.vibrate) navigator.vibrate(40);
    }
    refresh();
    if (session.complete) finish();
  };
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true, id: 'qr-photo', onchange: async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const t = await rx.decodeImageFile(f); t ? handle(t) : toast('Aucun QR code lisible sur cette photo'); } catch { toast('Image illisible'); }
  } });
  const pasteBox = h('textarea', { rows: 4, placeholder: 'Collez ici le texte du bilan (partagé par le patient)', 'aria-label': 'Texte du bilan' });
  const pasteWrap = h('div', { class: 'stack', hidden: true }, pasteBox,
    h('button', { class: 'btn secondary', onclick: () => { handle(pasteBox.value); pasteBox.value = ''; } }, 'Importer ce texte'));
  put(video, status, chips,
    h('div', { class: 'row' }, h('label', { class: 'btn secondary', for: 'qr-photo' }, '🖼 Photo du QR'), file,
      h('button', { class: 'btn secondary', onclick: () => { pasteWrap.hidden = !pasteWrap.hidden; } }, '📋 Coller le texte'), finishBtn),
    pasteWrap);
  refresh();
  if (!navigator.mediaDevices?.getUserMedia) { video.hidden = true; status.textContent = 'Caméra indisponible : utilisez « Photo du QR » ou « Coller le texte ».'; return; }
  rx.startScanner(video, handle, err => {
    video.hidden = true;
    status.textContent = err?.name === 'NotAllowedError' ? 'Accès à la caméra refusé : autorisez-le dans les réglages, ou utilisez « Photo du QR ».' : 'Caméra indisponible : utilisez « Photo du QR » ou « Coller le texte ».';
  }).then(stop => { if (done) stop(); else stopCamera = stop; });
}

async function receivedView(rawId) {
  const id = decodeURIComponent(rawId);
  const rec = await db.get('received', id);
  if (!rec) { location.hash = '#/'; return; }
  setHeader(rec.name, true);
  const fields = rx.receivedFields(rec), all = rx.receivedEntries(rec);
  const st = { hours: 0, hide: true };
  const holder = h('div');
  const draw = () => { holder.replaceChildren(buildTable(fields, filterPeriod(all, st.hours), { hideEmpty: st.hide })); };
  const label = () => PERIODS.find(x => x.h === st.hours).label;
  const hide = h('input', { type: 'checkbox', checked: true, onchange: e => { st.hide = e.target.checked; draw(); } });
  draw();
  put(h('p', { class: 'lead' }, `${rec.template} · ${rec.rows.length} saisie(s)${rec.generated ? ' · bilan du ' + rec.generated + ' (UTC)' : ''}`),
    periodPicker(st.hours, v => { st.hours = v; draw(); }),
    h('label', { class: 'check' }, hide, ' Masquer les colonnes vides'),
    holder,
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: async () => { const r = await exportPdf({ name: rec.name, service: '' }, { name: rec.template }, st.hide ? fields.filter(f => filterPeriod(all, st.hours).some(e => e.values[f.key] != null)) : fields, filterPeriod(all, st.hours), label()); if (r === 'downloaded') toast('PDF enregistré'); } }, '📄 Exporter en PDF'),
      link('#/receive', '📥 Recevoir d’autres codes', 'btn secondary')),
    h('details', { class: 'danger-zone' }, h('summary', {}, 'Supprimer ce bilan'),
      h('button', { class: 'btn danger', onclick: () => confirmDo(`Supprimer définitivement le bilan de ${rec.name} de cet appareil ?`, async () => { await db.del('received', id); toast('Bilan supprimé'); location.hash = '#/'; }) }, 'Supprimer ce bilan')));
}

// ---------- Sauvegarde / restauration ----------
async function backupView() {
  setHeader('Sauvegarde & restauration', true);
  const { lastBackup } = bk.backupState();
  const pass = h('input', { type: 'password', placeholder: 'Mot de passe (facultatif, recommandé)', autocomplete: 'new-password', 'aria-label': 'Mot de passe de chiffrement' });
  const saveBtn = h('button', { class: 'btn big', onclick: async () => {
    saveBtn.disabled = true;
    try {
      const { blob, name, counts } = await bk.createBackup(pass.value);
      const r = await bk.saveBlob(blob, name);
      if (r !== 'cancelled') { bk.markBackedUp(); toast(r === 'downloaded' ? `Sauvegarde téléchargée (${counts.patients} patient(s), ${counts.entries} saisie(s))` : 'Sauvegarde enregistrée ✓'); render(); }
    } catch (e) { toast('Échec de la sauvegarde : ' + e.message); }
    saveBtn.disabled = false;
  } }, '💾 Créer une sauvegarde');

  // restauration
  const rpass = h('input', { type: 'password', placeholder: 'Mot de passe de la sauvegarde', autocomplete: 'off', 'aria-label': 'Mot de passe' });
  const rpassWrap = h('label', { hidden: true }, 'Cette sauvegarde est chiffrée', rpass);
  const info = h('p', { class: 'lead' });
  const modeSel = h('select', { 'aria-label': 'Mode de restauration' },
    h('option', { value: 'merge' }, 'Fusionner avec les données de cet appareil (recommandé)'),
    h('option', { value: 'replace' }, 'Remplacer toutes les données de cet appareil'));
  const goBtn = h('button', { class: 'btn', disabled: true }, '♻ Restaurer');
  let file = null, loaded = null;
  const analyse = async () => {
    loaded = null; goBtn.disabled = true;
    if (!file) return;
    try {
      const r = await bk.readBackup(file, rpass.value);
      if (r.encrypted) { rpassWrap.hidden = false; info.textContent = 'Fichier chiffré : saisissez le mot de passe puis touchez « Lire le fichier ».'; readBtn.hidden = false; return; }
      rpassWrap.hidden = true; readBtn.hidden = true; loaded = r;
      info.textContent = `Sauvegarde du ${fmtDateLong(r.exportedAt)} : ${r.counts.patients} patient(s), ${r.counts.entries} saisie(s), ${r.counts.templates} fiche(s) perso, ${r.counts.received} bilan(s) reçu(s).`;
      goBtn.disabled = false;
    } catch (e) { info.textContent = e.message; info.classList.add('error'); return; }
    info.classList.remove('error');
  };
  const readBtn = h('button', { class: 'btn secondary', hidden: true, onclick: analyse }, 'Lire le fichier');
  const input = h('input', { type: 'file', accept: '.json,application/json', id: 'bk-file', hidden: true, onchange: e => { file = e.target.files[0] || null; rpass.value = ''; info.classList.remove('error'); analyse(); } });
  goBtn.addEventListener('click', async () => {
    if (!loaded) return;
    const replace = modeSel.value === 'replace';
    if (replace && !confirm('Remplacer TOUTES les données de cet appareil par celles de la sauvegarde ? Les données actuelles seront perdues.')) return;
    try { await bk.restore(loaded.data, replace); toast('Données restaurées ✓'); location.hash = '#/'; } catch (e) { toast('Échec de la restauration : ' + e.message); }
  });
  put(h('p', { class: 'lead' }, lastBackup ? `Dernière sauvegarde : ${fmtDateLong(lastBackup)}.` : 'Aucune sauvegarde faite sur cet appareil.'),
    h('section', { class: 'group' }, h('h3', {}, '1. Sauvegarder'),
      h('p', { class: 'hint' }, 'Crée un fichier avec tous vos patients, saisies, fiches et bilans reçus. Choisissez ensuite où le ranger : Google Drive, Fichiers / iCloud, clé USB, e-mail… Le fichier contient des données de santé : chiffrez-le avec un mot de passe (impossible à récupérer s’il est oublié).'),
      h('label', {}, 'Chiffrement', pass), saveBtn),
    h('section', { class: 'group' }, h('h3', {}, '2. Restaurer'),
      h('p', { class: 'hint' }, 'Choisissez un fichier de sauvegarde (depuis Drive, Fichiers, une clé USB…).'),
      input, h('label', { class: 'btn secondary', for: 'bk-file' }, '📂 Choisir un fichier de sauvegarde'),
      info, rpassWrap, readBtn, h('label', {}, 'Mode', modeSel), goBtn));
}

// ---------- Tableau de suivi multi-patients (corps médical) ----------
const ago = ms => { const m = Math.round(ms / 60000); return m < 1 ? 'à l’instant' : m < 60 ? `il y a ${m} min` : m < 2880 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
// Retard de saisie : vert = à jour, orange = au-delà du délai attendu, rouge = plus de 2× le délai
function lateness(last, hours, now = Date.now()) {
  if (!last) return { lvl: 3, dot: '⚪', txt: 'Aucune saisie' };
  const age = now - last, lim = hours * 3600000;
  const lvl = age <= lim ? 0 : age <= 2 * lim ? 1 : 2;
  return { lvl, dot: ['🟢', '🟠', '🔴'][lvl], txt: `Dernière saisie ${ago(age)}` };
}

// Valeurs hors seuil (dernière valeur connue de chaque champ surveillé)
async function breaches(p, entries) {
  const th = p.thresholds || {}, out = [];
  const fields = templateFields(await getTemplate(p.templateId));
  const sorted = [...entries].sort((a, b) => b.ts - a.ts);
  for (const [k, { min, max }] of Object.entries(th)) {
    const f = fields.find(x => x.key === k), e = sorted.find(x => typeof x.values[k] === 'number');
    if (!f || !e) continue;
    const v = e.values[k];
    if (max != null && v > max) out.push(`${f.short || f.label} ${v} > ${max} (${fmtDate(e.ts)})`);
    else if (min != null && v < min) out.push(`${f.short || f.label} ${v} < ${min} (${fmtDate(e.ts)})`);
  }
  return out;
}

async function seuilsView(pid) {
  const p = await db.get('patients', pid);
  if (!p) { location.hash = '#/'; return; }
  setHeader(p.name + ' · Seuils', true);
  const fields = templateFields(await getTemplate(p.templateId)).filter(f => f.type === 'number' || f.type === 'scale');
  const th = { ...(p.thresholds || {}) };
  const rows = fields.map(f => {
    const num = (k, ph) => h('input', { type: 'text', inputmode: 'decimal', placeholder: ph, 'aria-label': `${f.label} ${ph}`, value: th[f.key]?.[k] ?? '', oninput: e => {
      const v = e.target.value.replace(',', '.').trim(), cur = th[f.key] || {};
      cur[k] = v === '' || isNaN(+v) ? null : +v;
      if (cur.min == null && cur.max == null) delete th[f.key]; else th[f.key] = cur;
    } });
    return h('div', { class: 'card' }, h('strong', {}, f.label + (f.unit ? ` (${f.unit})` : '')), h('div', { class: 'row' }, num('min', 'Alerte si en dessous de'), num('max', 'Alerte si au-dessus de')));
  });
  put(h('p', { class: 'lead' }, 'Réglés sur cet appareil. Une valeur hors seuil passe le patient en 🔴 dans le tableau de suivi (d’après la dernière valeur saisie).'),
    h('div', { class: 'cards' }, rows.length ? rows : h('p', { class: 'empty' }, 'Cette fiche n’a pas de champ numérique.')),
    h('button', { class: 'btn big', type: 'button', onclick: async () => { p.thresholds = th; await db.put('patients', p); toast('Seuils enregistrés ✓'); location.hash = `#/p/${pid}`; } }, 'Enregistrer'));
}

async function suiviView() {
  setHeader('Tableau de suivi', true);
  const shared = (await db.all('patients')).filter(p => p.share);
  const received = await db.all('received');
  const rows = [];
  for (const p of shared) {
    const es = await db.allEntriesOf(p.id), last = Math.max(0, ...es.map(e => e.ts));
    const th = await sync.thread(p), hrs = p.alertHours || 6;
    const lastReply = th.all.filter(m => m.kind === 'reply').pop();
    const br = await breaches(p, es), late = lateness(last, hrs);
    if (br.length) { late.lvl = 2; late.dot = '🔴'; }
    rows.push({ key: p.id, name: p.name, href: `#/p/${p.id}`, hours: hrs, late, br, pending: th.pending, lastReply, p });
  }
  for (const r of received) {
    const last = Math.max(0, ...rx.receivedEntries(r).map(e => e.ts));
    rows.push({ key: 'r' + r.id, name: r.name, href: `#/r/${encodeURIComponent(r.id)}`, hours: 24, late: lateness(last, 24), bilan: true });
  }
  rows.sort((a, b) => (a.late.lvl === 3 ? -1 : b.late.lvl === 3 ? 1 : b.late.lvl - a.late.lvl) || a.name.localeCompare(b.name));
  const syncAll = h('button', { class: 'btn big', type: 'button', disabled: !shared.some(p => p.share.folder), onclick: () => busy(syncAll, async () => {
    let fail = 0; for (const p of shared.filter(x => x.share.folder)) { try { await sync.syncNow(p); } catch (e) { fail++; console.error(e); } }
    toast(fail ? `${fail} dossier(s) non synchronisé(s)` : 'Tout est synchronisé ✓'); render();
  }) }, '🔄 Tout synchroniser (Drive)');
  const scanBtn = link('#/scansync', '📷 Recevoir par QR (sans réseau)', 'btn secondary');
  const card = r => h('div', { class: 'card status l' + r.late.lvl },
    h('a', { href: r.href, class: 'sname' }, h('strong', {}, `${r.late.dot} ${r.name}`), r.bilan ? h('small', {}, ' · bilan reçu') : null),
    h('span', {}, r.late.txt + (r.bilan ? '' : ` · attendu toutes les ${r.hours} h`)),
    ...(r.br || []).map(b => h('small', { class: 'alertmsg' }, '⚠ ' + b)),
    r.pending ? h('small', {}, `💬 Demande de ${r.pending.by} ${ago(Date.now() - r.pending.ts)} : en attente de réponse`) : null,
    r.lastReply && !r.pending ? h('small', { class: r.lastReply.choice === 'help' ? 'alertmsg' : '' }, `${sync.REPLIES[r.lastReply.choice] || 'Réponse'} · ${r.lastReply.by} ${ago(Date.now() - r.lastReply.ts)}`) : null,
    r.p ? h('div', { class: 'row' },
      h('label', { class: 'inline' }, 'Délai (h)', h('select', { 'aria-label': 'Délai de saisie attendu en heures', onchange: async e => { r.p.alertHours = +e.target.value; await db.put('patients', r.p); render(); } },
        [1, 2, 4, 6, 8, 12, 24, 48].map(v => h('option', { value: v, selected: v === r.hours }, v + ' h')))),
      sync.can(r.p, 'ask') ? link(`#/p/${r.key}/messages`, '💬 Nouvelles', 'btn secondary small') : null,
      link(`#/p/${r.key}/seuils`, '🔔 Seuils', 'btn secondary small')) : null);
  put(h('p', { class: 'lead' }, 'Tous vos patients en un coup d’œil, du plus en retard au plus à jour. 🟢 à jour · 🟠 retard · 🔴 grand retard (plus de 2× le délai attendu) ou valeur hors seuil.'),
    syncAll, link('#/scansync', '📷 Recevoir par QR (sans réseau)', 'btn secondary'),
    h('div', { class: 'cards' }, rows.length ? rows.map(card) : h('p', { class: 'empty' }, 'Aucun patient suivi. Rejoignez un dossier partagé ou scannez un bilan.')));
}

// ---------- Messagerie « tout va bien ? » ----------
async function messagesView(pid) {
  const p = await db.get('patients', pid);
  if (!p?.share) { location.hash = `#/p/${pid}`; return; }
  setHeader(p.name + ' · Messages', true);
  const th = await sync.thread(p);
  const canAsk = await sync.canAsk(p);
  const note = h('textarea', { rows: 2, placeholder: 'Message (facultatif)', 'aria-label': 'Message', class: 'note' });
  const done = (ok) => { toast(ok ? 'Envoyé ✓' : 'Enregistré : partira à la prochaine synchronisation ou au prochain échange par QR'); render(); };
  const msgs = h('ul', { class: 'recent' }, th.all.length ? th.all.map(m => h('li', {}, h('div', { class: 'ro' + (m.choice === 'help' ? ' alertmsg' : '') },
    h('b', {}, `${m.mine ? 'Moi' : m.by}`), ` · ${fmtDateLong(m.ts)}`, h('br'),
    m.kind === 'ask' ? `💬 ${m.text}` : `${sync.REPLIES[m.choice] || ''}${m.text ? ' — ' + m.text : ''}`))) : h('li', { class: 'empty' }, 'Aucun message.'));
  const blocks = [];
  if (th.pending && sync.can(p, 'write') && !th.pending.mine) {
    const b = c => { const btn = h('button', { class: 'btn big' + (c === 'ok' ? '' : ' secondary'), type: 'button', onclick: () => busy(btn, async () => done(await sync.reply(p, th.pending.id, c, note.value.trim()))) }, sync.REPLIES[c]); return btn; };
    blocks.push(h('h2', {}, `${th.pending.by} demande : « ${th.pending.text} »`), note, ...Object.keys(sync.REPLIES).map(b));
  } else if (th.pending) blocks.push(h('p', { class: 'hint' }, 'Demande envoyée : en attente de réponse.'));
  if (sync.can(p, 'ask') && !th.pending) {
    const askBtn = h('button', { class: 'btn big', type: 'button', disabled: !canAsk.ok, onclick: () => busy(askBtn, async () => done(await sync.ask(p, note.value.trim()))) }, '💬 Demander des nouvelles');
    blocks.push(note, askBtn, canAsk.ok ? h('p', { class: 'hint' }, 'Un message court, sans notification : la personne le voit à l’ouverture de l’application.') : h('p', { class: 'hint' }, canAsk.why));
  }
  put(h('p', { class: 'hint' }, '⚠ Ce n’est pas un canal d’urgence. En cas d’urgence : appelez le 15 ou le 112.'),
    ...blocks, h('h2', {}, 'Échanges'), msgs,
    h('button', { class: 'btn secondary', type: 'button', onclick: e => busy(e.currentTarget, async () => { await sync.syncNow(p); render(); }) }, '🔄 Actualiser'));
}

// ---------- Échange par QR code, sans réseau ----------
async function qrSyncView(pid) {
  const p = await db.get('patients', pid);
  if (!p?.share) { location.hash = `#/p/${pid}`; return; }
  setHeader(p.name + ' · Échange QR', true);
  const st = { what: 'sec', hours: 24, i: 0, codes: [], auto: null };
  const box = h('div', { class: 'qrbox' }), info = h('p', { class: 'lead' }), nav = h('div', { class: 'row' });
  stopCamera = () => clearInterval(st.auto);
  const draw = () => {
    box.innerHTML = '';
    const cur = st.codes[st.i];
    const wrap = h('div', { class: 'qr' }); wrap.innerHTML = qrSvg(cur); // SVG généré localement
    box.append(wrap);
    info.textContent = `${st.what === 'sec' ? `Ma section (${st.count} saisie(s))` : 'Invitation'} · code ${st.i + 1} / ${st.codes.length}`;
    nav.replaceChildren(
      h('button', { class: 'btn secondary', disabled: st.i === 0, onclick: () => { st.i--; draw(); } }, '‹ Précédent'),
      h('button', { class: 'btn secondary', disabled: st.i >= st.codes.length - 1, onclick: () => { st.i++; draw(); } }, 'Suivant ›'));
  };
  const load = async () => {
    clearInterval(st.auto); st.auto = null; st.i = 0;
    if (st.what === 'sec') { const r = await qs.sectionCodes(p, st.hours); st.codes = r.codes; st.count = r.count; }
    else st.codes = await qs.inviteCodes(p);
    draw();
  };
  const tabs = h('div', { class: 'opts period', role: 'group', 'aria-label': 'Contenu' },
    [['sec', 'Ma section'], ['inv', 'Invitation']].map(([k, t]) => h('button', { type: 'button', class: 'opt' + (k === st.what ? ' on' : ''), onclick: e => {
      tabs.querySelectorAll('.opt').forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); st.what = k; periodWrap.hidden = k !== 'sec'; load();
    } }, t)));
  const periodWrap = h('div', {}, periodPicker(st.hours, v => { st.hours = v; load(); }));
  const autoBtn = h('button', { class: 'btn secondary', type: 'button', onclick: () => {
    if (st.auto) { clearInterval(st.auto); st.auto = null; autoBtn.textContent = '▶ Défilement automatique'; return; }
    autoBtn.textContent = '⏸ Arrêter le défilement';
    st.auto = setInterval(() => { st.i = (st.i + 1) % st.codes.length; draw(); }, 1600);
  } }, '▶ Défilement automatique');
  put(h('p', { class: 'lead' }, 'Sans réseau, deux appareils se mettent à jour en se scannant. Montrez vos codes à l’autre appareil (« Recevoir par QR »), puis scannez les siens.'),
    tabs, periodWrap, box, info, nav, autoBtn,
    h('p', { class: 'hint' }, st.what === 'inv' ? '' : 'La période limite le nombre de codes : l’autre appareil ajoute ces saisies aux précédentes.'),
    h('p', { class: 'hint' }, p.share.pass ? '🔒 Codes chiffrés avec la phrase secrète du dossier. L’invitation, elle, n’est pas chiffrée (nom du patient) : montrez-la en personne et ne la photographiez pas.' : 'Codes non chiffrés : pensez à définir une phrase secrète pour les dossiers sensibles.'),
    link('#/scansync', '📷 Recevoir par QR', 'btn'),
    h('button', { class: 'btn secondary', type: 'button', onclick: async () => {
      const txt = st.codes.join('\n');
      try { if (navigator.share) { await navigator.share({ text: txt, title: 'Dossier ' + p.name }); return; } } catch (e) { if (e.name === 'AbortError') return; }
      try { await navigator.clipboard.writeText(txt); toast('Codes copiés'); } catch { toast('Copie impossible'); }
    } }, '↗ Partager en texte (message)'));
  await load();
}

async function scanSyncView() {
  setHeader('Recevoir par QR', true);
  const patients = (await db.all('patients')).filter(p => p.share);
  const rcv = new qs.Receiver();
  const video = h('video', { class: 'cam', playsinline: '', muted: '' });
  const status = h('p', { class: 'lead' }, 'Cadrez le QR code affiché sur l’autre appareil (« Échanger par QR »).');
  const chips = h('div', { class: 'chips parts' }), result = h('div', { class: 'stack' });
  let busyNow = false, finished = false;
  const refresh = () => {
    chips.replaceChildren(...(rcv.total > 1 ? Array.from({ length: rcv.total }, (_, i) => h('span', { class: 'chip' + (rcv.parts.has(i + 1) ? ' last' : '') }, `${rcv.parts.has(i + 1) ? '✓' : '·'} ${i + 1}`)) : []));
    status.textContent = rcv.total > 1 ? `Codes reçus : ${rcv.count} / ${rcv.total}. Scannez les suivants, dans n’importe quel ordre.` : 'Cadrez le QR code affiché sur l’autre appareil.';
  };
  const finish = async () => {
    if (busyNow || finished) return; busyNow = true;
    try {
      const r = await qs.open(rcv, patients);
      finished = true; if (stopCamera) { stopCamera(); stopCamera = null; } video.hidden = true;
      if (navigator.vibrate) navigator.vibrate(80);
      if (r.kind === 'sec') { toast(r.stale ? 'Déjà à jour' : `Section de ${r.name} reçue ✓ (${r.added} nouvelle(s) saisie(s))`); location.hash = `#/p/${r.patient.id}`; return; }
      // invitation : choisir son nom et son rôle
      const name = h('input', { type: 'text', placeholder: 'Votre nom (ex : Dr Martin)', 'aria-label': 'Votre nom', value: sync.me().name });
      const role = h('select', { 'aria-label': 'Mon rôle' }, ['parent', 'soignant', 'lecture'].map(x => h('option', { value: x }, sync.ROLES[x].label)));
      const pass = r.data.enc ? h('input', { type: 'password', placeholder: 'Phrase secrète du dossier', 'aria-label': 'Phrase secrète', autocomplete: 'off' }) : null;
      const ok = h('button', { class: 'btn big', type: 'button', onclick: () => busy(ok, async () => {
        if (!name.value.trim()) { name.focus(); throw new Error('Indiquez votre nom.'); }
        const p = await qs.acceptInvite(r.data, name.value.trim(), role.value, pass?.value || '');
        toast('Dossier rejoint ✓'); location.hash = `#/p/${p.id}/qrsync`;
      }) }, 'Rejoindre ce dossier');
      clear(result);
      result.append(h('h2', {}, `Invitation : ${r.data.patient.name}`), h('label', {}, 'Mon nom', name), h('label', {}, 'Mon rôle', role), pass ? h('label', {}, 'Phrase secrète', pass) : null, ok);
    } catch (e) { rcv.parts.clear(); rcv.total = 0; rcv.sid = null; refresh(); toast(e.message); } finally { busyNow = false; }
  };
  const handle = text => {
    if (finished) return;
    const res = rcv.add(text);
    if (res === 'bad') return;
    if (res === 'other') toast('Code d’un autre échange : terminez d’abord celui-ci');
    if (res === 'ok' && navigator.vibrate) navigator.vibrate(40);
    refresh();
    if (rcv.complete) finish();
  };
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true, id: 'qr-photo2', onchange: async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const t = await rx.decodeImageFile(f); t ? handle(t) : toast('Aucun QR code lisible sur cette photo'); } catch { toast('Image illisible'); }
  } });
  const pasteBox = h('textarea', { rows: 4, class: 'note', placeholder: 'Collez ici les codes reçus en texte (SJ1|…)', 'aria-label': 'Codes en texte' });
  const pasteWrap = h('div', { class: 'stack', hidden: true }, pasteBox, h('button', { class: 'btn secondary', onclick: () => { handle(pasteBox.value); pasteBox.value = ''; } }, 'Importer ces codes'));
  put(video, status, chips, result,
    h('div', { class: 'row' }, h('label', { class: 'btn secondary', for: 'qr-photo2' }, '🖼 Photo du QR'), file, h('button', { class: 'btn secondary', onclick: () => { pasteWrap.hidden = !pasteWrap.hidden; } }, '📋 Coller le texte')), pasteWrap);
  if (!navigator.mediaDevices?.getUserMedia) { video.hidden = true; status.textContent = 'Caméra indisponible : utilisez « Photo du QR » ou « Coller le texte ».'; return; }
  rx.startScanner(video, handle, err => {
    video.hidden = true;
    status.textContent = err?.name === 'NotAllowedError' ? 'Accès à la caméra refusé : autorisez-le dans les réglages, ou utilisez « Photo du QR ».' : 'Caméra indisponible : utilisez « Photo du QR » ou « Coller le texte ».';
  }).then(stop => { if (finished) stop(); else stopCamera = stop; });
}

// ---------- Dossiers partagés (Google Drive) ----------
const busy = async (btn, fn) => {
  const old = btn.textContent; btn.disabled = true; btn.textContent = '⏳ …';
  try { await fn(); } catch (e) { console.error(e); toast(e.message || 'Erreur'); } finally { btn.disabled = false; btn.textContent = old; }
};

async function dossiersView() {
  setHeader('Dossiers partagés', true);
  const patients = (await db.all('patients')).sort((a, b) => a.name.localeCompare(b.name));
  const shared = patients.filter(p => p.share), local = patients.filter(p => !p.share);
  const cid = h('input', { type: 'text', placeholder: 'xxxx.apps.googleusercontent.com', 'aria-label': 'Identifiant client Google', value: (() => { try { return localStorage.getItem('gClientId') || ''; } catch { return ''; } })() });
  const myName = h('input', { type: 'text', placeholder: 'Votre nom (ex : Dr Martin, Maman de Léa)', 'aria-label': 'Votre nom', value: sync.me().name });
  const needName = () => { if (!myName.value.trim()) { myName.focus(); throw new Error('Indiquez votre nom (visible des autres membres).'); } if (!hasClientId() && !cid.value.trim()) { cid.focus(); throw new Error('Renseignez d’abord l’identifiant client Google.'); } setClientId(cid.value || (hasClientId() ? localStorage.getItem('gClientId') : '')); };

  const folder = h('input', { type: 'text', placeholder: 'Collez le lien du dossier Drive partagé', 'aria-label': 'Lien du dossier Drive' });
  const role = h('select', { 'aria-label': 'Mon rôle' }, ['parent', 'soignant', 'lecture'].map(r => h('option', { value: r }, sync.ROLES[r].label)));
  const pass = h('input', { type: 'password', placeholder: 'Phrase secrète du dossier (si chiffré)', 'aria-label': 'Phrase secrète', autocomplete: 'off' });
  const pass2 = h('input', { type: 'password', placeholder: 'Phrase secrète (recommandé) : chiffre les fichiers', 'aria-label': 'Phrase secrète', autocomplete: 'off' });
  const joinBtn = h('button', { class: 'btn big', type: 'button', onclick: () => busy(joinBtn, async () => {
    needName();
    const p = await sync.joinShare(folder.value, myName.value.trim(), role.value, pass.value);
    toast('Dossier rejoint ✓'); location.hash = `#/p/${p.id}`;
  }) }, 'Rejoindre ce dossier');

  const pick = h('select', { 'aria-label': 'Patient à partager' }, local.map(p => h('option', { value: p.id }, p.name)));
  const folder2 = h('input', { type: 'text', placeholder: 'Lien du dossier Drive (créé et partagé par vous)', 'aria-label': 'Lien du dossier Drive' });
  const shareBtn = h('button', { class: 'btn big', type: 'button', onclick: () => busy(shareBtn, async () => {
    needName();
    const p = local.find(x => x.id === pick.value); if (!p) throw new Error('Aucun patient à partager.');
    await sync.createShare(p, folder2.value, myName.value.trim(), pass2.value);
    toast('Patient partagé ✓'); location.hash = `#/p/${p.id}`;
  }) }, 'Partager ce patient');

  const pick2 = h('select', { 'aria-label': 'Patient à partager par QR' }, local.map(p => h('option', { value: p.id }, p.name)));
  const pass3 = h('input', { type: 'password', placeholder: 'Chiffre les codes QR (recommandé)', 'aria-label': 'Phrase secrète', autocomplete: 'off' });
  const qrBtn = h('button', { class: 'btn', type: 'button', onclick: () => busy(qrBtn, async () => {
    if (!myName.value.trim()) { myName.focus(); throw new Error('Indiquez votre nom (visible des autres membres).'); }
    const p = local.find(x => x.id === pick2.value); if (!p) throw new Error('Aucun patient à partager.');
    await sync.createLocalShare(p, myName.value.trim(), pass3.value);
    toast('Partage créé : montrez l’invitation QR'); location.hash = `#/p/${p.id}/qrsync`;
  }) }, 'Créer un partage par QR');
  put(
    h('p', { class: 'lead' }, 'Un même dossier patient pour plusieurs personnes (parents, médecin, orthophoniste…). Chacun écrit dans sa propre section ; tout le monde voit les sections des autres, à jour après synchronisation.'),
    h('h2', {}, 'Mes dossiers partagés'),
    h('div', { class: 'cards' }, shared.length ? shared.map(p => h('a', { class: 'card patient', href: `#/p/${p.id}` }, h('strong', {}, p.name), h('span', {}, `👥 ${sync.ROLES[p.share.role].label} · ${p.share.memberName}`),
      h('small', {}, !p.share.folder ? 'Échange par QR' : p.share.syncedAt ? `Synchronisé le ${fmtDateLong(p.share.syncedAt)}` : 'Jamais synchronisé'))) : h('p', { class: 'empty' }, 'Aucun dossier partagé.')),
    h('h2', {}, '1. Réglages (une fois)'),
    h('label', {}, 'Mon nom', myName),
    h('label', {}, 'Identifiant client Google (OAuth)', cid),
    hasClientId() ? null : h('p', { class: 'hint' }, 'À créer une fois dans Google Cloud Console : APIs → Google Drive API activée, puis Identifiants → ID client OAuth « Application Web », origine JavaScript autorisée = l’adresse de cette application. En test, ajoutez les comptes Google des membres comme « utilisateurs test ».'),
    h('h2', {}, '2. Rejoindre un dossier partagé'),
    h('p', { class: 'hint' }, 'On vous a invité (Éditeur ou Lecteur) sur un dossier Google Drive : collez son lien.'),
    h('label', {}, 'Dossier Drive', folder), h('label', {}, 'Mon rôle', role), h('label', {}, 'Phrase secrète', pass), joinBtn,
    h('h2', {}, '3. Partager un de mes patients'),
    h('p', { class: 'hint' }, 'Créez un dossier vide dans Google Drive, partagez-le avec les autres membres (Éditeur pour ceux qui saisissent, Lecteur pour les autres), puis collez son lien.'),
    local.length ? [h('label', {}, 'Patient', pick), h('label', {}, 'Dossier Drive', folder2), h('label', {}, 'Phrase secrète (chiffrement de bout en bout)', pass2), h('p', { class: 'hint' }, 'Communiquez-la aux membres par un autre canal que Drive. Perdue, elle ne se récupère pas.'), shareBtn] : h('p', { class: 'empty' }, 'Aucun patient local à partager.'),
    h('h2', {}, '4. Sans réseau : par QR code'),
    h('p', { class: 'hint' }, 'Pas d’Internet ni de Drive ? Les appareils s’échangent leurs sections en se scannant, comme pour Drive : chacun garde la sienne.'),
    local.length ? [h('label', {}, 'Patient', pick2), h('label', {}, 'Phrase secrète (facultative)', pass3), qrBtn] : null,
    link('#/scansync', '📷 Scanner une invitation ou une section', 'btn secondary'),
    h('details', { class: 'danger-zone' }, h('summary', {}, 'Confidentialité & droits'),
      h('p', {}, 'Les saisies du dossier partagé sont stockées dans Google Drive. Avec une phrase secrète elles sont chiffrées de bout en bout (AES-256) : Google ne voit que des fichiers illisibles. Sans phrase secrète, ce sont des fichiers JSON lisibles. Les droits réels sont ceux du partage Drive (Éditeur / Lecteur) : l’application s’y conforme et passe en lecture seule si l’écriture est refusée. Les rôles de l’application règlent ce que chacun peut faire dans l’interface.')));
}

async function syncView(pid) {
  const p = await db.get('patients', pid);
  if (!p?.share) { location.hash = `#/p/${pid}`; return; }
  setHeader(p.name + ' · Partage', true);
  const remote = await db.remoteOf(pid), mine = await db.entriesOf(pid);
  const status = h('p', { class: 'lead' }, !p.share.folder ? 'Partage par QR code (sans réseau)' : p.share.syncedAt ? `Dernière synchronisation : ${fmtDateLong(p.share.syncedAt)}` : 'Jamais synchronisé');
  const syncBtn = p.share.folder ? h('button', { class: 'btn big', type: 'button', onclick: () => busy(syncBtn, async () => {
    const r = await sync.syncNow(p); toast(`Synchronisé ✓ (${r.members} membre(s))`); render();
  }) }, '🔄 Synchroniser maintenant') : h('p', { class: 'hint' }, 'Dossier sans Drive : les sections s’échangent par QR code.');
  const members = h('ul', { class: 'recent' },
    h('li', {}, h('div', { class: 'ro' }, h('b', {}, `${p.share.memberName} (moi)`), ` · ${sync.ROLES[p.share.role].label} · ${mine.length} saisie(s)`)),
    remote.map(r => h('li', {}, h('div', { class: 'ro' }, h('b', {}, r.name), ` · ${sync.ROLES[r.role]?.label || '—'} · ${r.entries.length} saisie(s) 🔒`))));

  // Pièces communes : nom, service, fiche → verrou d'édition (une seule personne à la fois)
  const common = h('div', { class: 'stack' });
  if (sync.can(p, 'common')) {
    const editBtn = h('button', { class: 'btn secondary', type: 'button', onclick: () => busy(editBtn, async () => {
      const lock = await sync.acquireLock(p);
      if (!lock.ok) throw new Error(`${lock.by} modifie la fiche commune en ce moment (jusqu’à ${new Date(lock.until).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}). Réessayez plus tard.`);
      const tpls = await allTemplates();
      const name = h('input', { type: 'text', value: p.name, 'aria-label': 'Nom' }), service = h('input', { type: 'text', value: p.service || '', 'aria-label': 'Service' });
      const sel = h('select', { 'aria-label': 'Fiche de suivi' }, tpls.map(t => h('option', { value: t.id, selected: t.id === p.templateId }, t.name)));
      const ok = h('button', { class: 'btn', type: 'button', onclick: () => busy(ok, async () => { await sync.commitCommon(p, { name: name.value.trim() || p.name, service: service.value.trim(), templateId: sel.value }); toast('Fiche commune enregistrée ✓'); render(); }) }, 'Enregistrer pour tous');
      const cancel = h('button', { class: 'btn secondary', type: 'button', onclick: () => busy(cancel, async () => { await sync.releaseLock(p); render(); }) }, 'Annuler (libérer le verrou)');
      common.replaceChildren(h('p', { class: 'hint' }, '🔒 Vous avez le verrou (5 min) : les autres ne peuvent pas modifier cette fiche pendant ce temps.'), h('label', {}, 'Patient', name), h('label', {}, 'Service', service), h('label', {}, 'Fiche de suivi', sel), ok, cancel);
    }) }, '✎ Modifier la fiche commune (nom, service, modèle)');
    common.append(editBtn);
  } else common.append(h('p', { class: 'hint' }, 'Votre rôle ne permet pas de modifier la fiche commune.'));

  put(status, syncBtn, link(`#/p/${pid}/qrsync`, '▦ Échanger par QR code (sans réseau)', 'btn secondary'),
    h('h2', {}, 'Membres du dossier'), members,
    h('p', { class: 'hint' }, 'Vous ne modifiez que vos propres saisies ; celles des autres (🔒) sont en lecture seule. Synchronisez pour envoyer les vôtres et recevoir celles des autres.'),
    h('h2', {}, 'Fiche commune'), common,
    h('details', { class: 'danger-zone' }, h('summary', {}, 'Quitter le partage'),
      h('button', { class: 'btn danger', onclick: () => confirmDo('Arrêter le partage sur cet appareil ? Vos saisies restent ici, celles des autres sont retirées. Le dossier Drive n’est pas supprimé.', async () => { await sync.leaveShare(p, false); toast('Partage arrêté'); location.hash = `#/p/${pid}`; }) }, 'Quitter ce dossier partagé')));
}

// ---------- Partage de l'application par QR code ----------
function shareView() {
  setHeader('Partager l’application', true);
  const url = location.href.split('#')[0].replace(/index\.html$/, '');
  const wrap = h('div', { class: 'qr' }); wrap.innerHTML = qrSvg(url, { ecc: 'M' }); // SVG généré localement
  put(h('p', { class: 'lead' }, 'Faites scanner ce code avec l’appareil photo du téléphone : il ouvre l’application. À faire une fois avec du réseau ; ensuite elle fonctionne sans connexion.'),
    h('div', { class: 'qrbox' }, wrap),
    h('p', { class: 'raw' }, url),
    h('ol', { class: 'steps' },
      h('li', {}, 'iPhone : ouvrir dans Safari, puis Partager → Sur l’écran d’accueil.'),
      h('li', {}, 'Android : ouvrir dans Chrome, puis menu ⋮ → Installer l’application.'),
      h('li', {}, 'Ouvrir l’application installée, puis Scanner une fiche pour télécharger l’OCR (Wi-Fi conseillé, ~14 Mo).')),
    h('button', { class: 'btn secondary', onclick: async () => {
      try { if (navigator.share) { await navigator.share({ url, title: 'Suivi hospitalier' }); return; } } catch (e) { if (e.name === 'AbortError') return; }
      try { await navigator.clipboard.writeText(url); toast('Lien copié'); } catch { toast('Copie impossible'); }
    } }, '↗ Partager le lien'));
}

// ---------- Synchronisation automatique ----------
// Sans fenêtre de connexion : uniquement si un jeton Google valide existe (première synchronisation faite à la main
// dans la session). Au retour sur l'app, au retour du réseau, après une saisie, puis toutes les 5 minutes.
let autoBusy = false;
async function autoSync() {
  if (autoBusy || document.hidden || !navigator.onLine || !hasToken()) return;
  autoBusy = true;
  try {
    const shared = (await db.all('patients')).filter(p => p.share?.folder);
    for (const p of shared) { try { await sync.syncNow(p); } catch (e) { console.warn('auto-sync', e.message); } }
    const path = location.hash.replace(/^#\/?/, '');
    if (shared.length && /^(suivi)?$|^p\/[^/]+$|^p\/[^/]+\/messages$/.test(path) && !app.contains(document.activeElement?.closest?.('input,textarea,select'))) await render();
  } finally { autoBusy = false; }
}
document.addEventListener('visibilitychange', autoSync);
window.addEventListener('online', autoSync);
setInterval(autoSync, 5 * 60000);
setTimeout(autoSync, 1500);

// ---------- Démarrage ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
requestPersistence();
window.addEventListener('online', () => document.body.classList.remove('offline'));
window.addEventListener('offline', () => document.body.classList.add('offline'));
if (!navigator.onLine) document.body.classList.add('offline');
render();
