// Dossiers partagés : synchronisation d'un patient entre plusieurs personnes.
//
// Principe « une section par auteur » : dans le dossier partagé, chaque membre n'écrit QUE dans son propre fichier
// (m-<id>.json = ses saisies). Les autres le lisent en lecture seule → aucun conflit d'écriture, plusieurs
// corps médicaux et les deux parents travaillent en même temps sans se gêner.
// Pièces communes (identité du patient, fiche de suivi) : fichier dossier.json protégé par un verrou d'édition
// (lock.json, durée limitée) → une seule personne les modifie à la fois.
//
// Le stockage est un « fournisseur » interchangeable (list/read/write) : Google Drive aujourd'hui (drive.js),
// une API PostgreSQL demain, sans toucher au reste de l'application.
import { db } from './db.js';
import { uid } from './dom.js';
import { drive, folderId } from './drive.js';

const providers = { drive };
export const ROLES = {
  owner: { label: 'Propriétaire', write: true, common: true },
  parent: { label: 'Parent', write: true, common: true },
  soignant: { label: 'Soignant', write: true, common: false },
  lecture: { label: 'Lecture seule', write: false, common: false },
};
export const can = (p, what) => !p?.share || !!ROLES[p.share.role]?.[what];
const LOCK_MS = 5 * 60000;

// Identité de cet appareil (mémorisée)
export const me = () => {
  try {
    let id = localStorage.getItem('memberId');
    if (!id) { id = uid().slice(0, 8); localStorage.setItem('memberId', id); }
    return { id, name: localStorage.getItem('memberName') || '' };
  } catch { return { id: 'local', name: '' }; }
};
export const setMyName = n => { try { localStorage.setItem('memberName', n.trim()); } catch { /* ignoré */ } };

const prov = p => providers[p.share.provider] || drive;
const myFile = p => `m-${p.share.memberId}.json`;

async function files(p) {
  const list = await prov(p).list(p.share.folder);
  const by = {}; list.forEach(f => { by[f.name] = f; });
  return { list, by };
}

// Publie MA section (mes saisies uniquement)
async function publish(p, by) {
  const entries = await db.entriesOf(p.id);
  const doc = { v: 1, patientId: p.id, member: { id: p.share.memberId, name: p.share.memberName, role: p.share.role }, updated: Date.now(), entries };
  await prov(p).write(p.share.folder, myFile(p), doc, by[myFile(p)]?.id);
}

// Récupère les sections des autres membres + les pièces communes
async function pull(p, by, list) {
  const known = new Map((await db.remoteOf(p.id)).map(r => [r.id, r]));
  const seen = new Set();
  for (const f of list) {
    if (!/^m-[\w-]+\.json$/.test(f.name) || f.name === myFile(p)) continue;
    const id = `${p.id}:${f.name}`; seen.add(id);
    if (known.get(id)?.modified >= f.modified) continue;
    const doc = await prov(p).read(f.id);
    await db.put('remote', { id, patientId: p.id, memberId: doc.member?.id, name: doc.member?.name || 'Anonyme', role: doc.member?.role, entries: Array.isArray(doc.entries) ? doc.entries : [], modified: f.modified });
  }
  for (const [id] of known) if (!seen.has(id)) await db.del('remote', id); // membre retiré du dossier
  if (by['dossier.json'] && (p.share.commonAt || 0) < by['dossier.json'].modified) {
    const d = await prov(p).read(by['dossier.json'].id);
    if (d.template && d.template.custom && !(await db.get('templates', d.template.id))) await db.put('templates', d.template);
    Object.assign(p, { name: d.patient.name, service: d.patient.service, templateId: d.patient.templateId });
    p.share.commonAt = by['dossier.json'].modified;
    await db.put('patients', p);
  }
}

// Synchronisation complète : publier ma section, puis récupérer celle des autres
export async function syncNow(p) {
  let { list, by } = await files(p);
  if (can(p, 'write')) { try { await publish(p, by); ({ list, by } = await files(p)); } catch (e) { if (e.status !== 403) throw e; p.share.role = 'lecture'; } }
  await pull(p, by, list);
  p.share.syncedAt = Date.now();
  await db.put('patients', p);
  return { members: list.filter(f => f.name.startsWith('m-')).length };
}

async function writeCommon(p, by) {
  const template = p.templateId.startsWith('cus-') ? await db.get('templates', p.templateId) : null;
  const doc = { v: 1, patient: { id: p.id, name: p.name, service: p.service, templateId: p.templateId }, template };
  await prov(p).write(p.share.folder, 'dossier.json', doc, by['dossier.json']?.id);
}

// Crée le partage d'un patient existant (le créateur devient propriétaire)
export async function createShare(p, folderInput, memberName, providerKey = 'drive') {
  setMyName(memberName);
  p.share = { provider: providerKey, folder: folderId(folderInput), role: 'owner', memberId: me().id, memberName };
  await drive.ready();
  const { by } = await files(p);
  if (by['dossier.json']) throw new Error('Ce dossier Drive contient déjà un dossier partagé : utilisez « Rejoindre ».');
  await writeCommon(p, by);
  await db.put('patients', p);
  return syncNow(p);
}

// Rejoint un dossier partagé existant
export async function joinShare(folderInput, memberName, role, providerKey = 'drive') {
  setMyName(memberName);
  const share = { provider: providerKey, folder: folderId(folderInput), role, memberId: me().id, memberName };
  await drive.ready();
  const { by } = await files({ share });
  if (!by['dossier.json']) throw new Error('Aucun dossier partagé trouvé dans ce dossier Drive.');
  const d = await providers[providerKey].read(by['dossier.json'].id);
  if (d.template?.custom && !(await db.get('templates', d.template.id))) await db.put('templates', d.template);
  const existing = await db.get('patients', d.patient.id);
  const p = { ...(existing || {}), ...d.patient, created: existing?.created || Date.now(), updated: Date.now(), share };
  await db.put('patients', p);
  await syncNow(p);
  return p;
}

export async function leaveShare(p, removeData) {
  delete p.share;
  await db.put('patients', p);
  for (const r of await db.remoteOf(p.id)) await db.del('remote', r.id);
  if (removeData) await db.purgePatient(p.id);
}

// ----- Verrou d'édition des pièces communes (fiche d'identité, modèle de fiche) -----
export async function acquireLock(p) {
  const { by } = await files(p);
  const lock = by['lock.json'] ? await prov(p).read(by['lock.json'].id) : null;
  if (lock && lock.until > Date.now() && lock.holder !== p.share.memberId) return { ok: false, by: lock.name, until: lock.until };
  const id = await prov(p).write(p.share.folder, 'lock.json', { holder: p.share.memberId, name: p.share.memberName, until: Date.now() + LOCK_MS }, by['lock.json']?.id);
  // relecture : si quelqu'un a pris le verrou entre-temps (écritures simultanées), on cède
  const check = await prov(p).read(id);
  return check.holder === p.share.memberId ? { ok: true } : { ok: false, by: check.name, until: check.until };
}
export async function commitCommon(p, patch) {
  Object.assign(p, patch, { updated: Date.now() });
  const { by } = await files(p);
  await writeCommon(p, by);
  if (by['lock.json']) await prov(p).write(p.share.folder, 'lock.json', { holder: null, name: '', until: 0 }, by['lock.json'].id);
  await db.put('patients', p);
}
export async function releaseLock(p) {
  const { by } = await files(p);
  if (by['lock.json']) await prov(p).write(p.share.folder, 'lock.json', { holder: null, name: '', until: 0 }, by['lock.json'].id);
}
