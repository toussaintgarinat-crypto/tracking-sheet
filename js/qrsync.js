// Échange de dossiers partagés SANS RÉSEAU, par QR code (ou texte collé).
// Même principe que Drive : chaque personne montre SA section (ses saisies + ses messages) ; l'autre appareil la scanne
// et la range en lecture seule. Deux téléphones qui se scannent mutuellement sont à jour l'un de l'autre.
// Contenu : JSON → compressé (deflate) → chiffré (AES-GCM) si le dossier a une phrase secrète → base64 → découpé en codes.
import { db } from './db.js';
import { uid } from './dom.js';
import { me, key, b64, unb64, setMyName } from './sync.js';

const CHUNK = 650; // caractères par code : reste lisible sur un écran de téléphone
const HEAD = 'SJ1';

async function deflate(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function inflate(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

// octet 0 : bit0 = chiffré, bit1 = compressé, bit2 = sel de la phrase secrète joint (16 octets), puis iv + données.
// Le sel joint permet à un appareil qui ne connaît pas encore le dossier de le déchiffrer avec la seule phrase secrète.
export async function pack(obj, share) {
  let bytes = new TextEncoder().encode(JSON.stringify(obj)), flags = 0, head = [];
  const z = await deflate(bytes); if (z && z.length < bytes.length) { bytes = z; flags |= 2; }
  if (share?.pass) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(share.pass, share.salt), bytes));
    bytes = new Uint8Array([...iv, ...ct]); flags |= 1 | 4; head = [...unb64(share.salt)];
  }
  return b64(new Uint8Array([flags, ...head, ...bytes]));
}
export const saltOf = text => { const a = unb64(text); return a[0] & 4 ? b64(a.subarray(1, 17)) : null; };
export async function unpack(text, share) {
  const all = unb64(text), flags = all[0]; let off = 1, salt = share?.salt;
  if (flags & 4) { salt = b64(all.subarray(1, 17)); off = 17; }
  let bytes = all.subarray(off);
  if (flags & 1) {
    if (!share?.pass) throw new Error('Ce code est chiffré : la phrase secrète du dossier est requise.');
    try { bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, await key(share.pass, salt), bytes.subarray(12))); }
    catch { throw new Error('Phrase secrète incorrecte (ou code abîmé).'); }
  }
  if (flags & 2) bytes = await inflate(bytes);
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function toCodes(packed) {
  const sid = uid().slice(0, 4), n = Math.max(1, Math.ceil(packed.length / CHUNK)), out = [];
  for (let i = 0; i < n; i++) out.push(`${HEAD}|${sid}|${i + 1}|${n}|${packed.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  return out;
}

// Ma section : saisies (sur la période ; hours = 0 → tout) + tous mes messages
export async function sectionCodes(p, hours) {
  const from = hours ? Date.now() - hours * 3600000 : 0;
  const entries = (await db.entriesOf(p.id)).filter(e => e.ts >= from);
  const tpl = p.templateId.startsWith('cus-') ? await db.get('templates', p.templateId) : null;
  const obj = { k: 'sec', pid: p.id, pt: { id: p.id, name: p.name, service: p.service, templateId: p.templateId }, tpl, m: { id: p.share.memberId, name: p.share.memberName, role: p.share.role }, u: Date.now(), full: !hours, e: entries, g: p.msgs || [] };
  return { codes: toCodes(await pack(obj, p.share)), count: entries.length };
}
// Invitation : identité du patient + fiche perso (jamais la phrase secrète)
export async function inviteCodes(p) {
  const tpl = p.templateId.startsWith('cus-') ? await db.get('templates', p.templateId) : null;
  const obj = { k: 'inv', patient: { id: p.id, name: p.name, service: p.service, templateId: p.templateId }, tpl, salt: p.share.salt || null, enc: !!p.share.pass };
  return toCodes(await pack(obj, null));
}

// Rassemble les codes reçus (n'importe quel ordre, doublons ignorés)
export class Receiver {
  constructor() { this.sid = null; this.total = 0; this.parts = new Map(); }
  add(text) {
    let res = 'bad';
    for (const line of String(text).split(/\s+/)) {
      const m = /^SJ1\|(\w+)\|(\d+)\|(\d+)\|([A-Za-z0-9+/=]+)$/.exec(line.trim());
      if (!m) continue;
      const [, sid, i, n, data] = m;
      if (this.sid && this.sid !== sid) { res = 'other'; continue; }
      this.sid = sid; this.total = +n;
      if (this.parts.has(+i)) { if (res === 'bad') res = 'dup'; continue; }
      this.parts.set(+i, data); res = 'ok';
    }
    return res;
  }
  get complete() { return this.total > 0 && this.parts.size === this.total; }
  get count() { return this.parts.size; }
  packed() { return [...this.parts.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]).join(''); }
}

// Lit un message complet. Retourne :
//  { kind:'sec' }      section d'un dossier que j'ai déjà → rangée
//  { kind:'inv', data } invitation à confirmer
//  { kind:'new', obj }  section d'un patient inconnu (non chiffrée) → à confirmer (nom, rôle)
//  { kind:'needcode', packed } section chiffrée d'un patient inconnu → demander la phrase secrète (une seule fois)
export async function open(receiver, patients) {
  const packed = receiver.packed();
  let flags; try { flags = unb64(packed)[0]; } catch { throw new Error('Code illisible.'); }
  if (!(flags & 1)) {
    const o = await unpack(packed, null);
    if (o.k === 'inv') return { kind: 'inv', data: o };
    if (o.k !== 'sec') throw new Error('Ce code n’est pas un échange de dossier.');
    return patients.some(p => p.id === o.pid) ? { kind: 'sec', ...(await applySection(o, patients)) } : { kind: 'new', obj: o };
  }
  // chiffré : phrase déjà mémorisée pour l'un de mes dossiers ?
  for (const p of patients) {
    try { const o = await unpack(packed, p.share); if (o.k === 'sec' && o.pid === p.id) return { kind: 'sec', ...(await applySection(o, patients)) }; } catch { /* autre dossier */ }
  }
  if (!saltOf(packed)) throw new Error('Aucun de vos dossiers partagés ne correspond à ce code.');
  return { kind: 'needcode', packed };
}

// Premier scan d'un patient chiffré : la phrase secrète (saisie une seule fois) est mémorisée sur l'appareil
export async function openWithCode(packed, pass) {
  const obj = await unpack(packed, { pass });
  if (obj.k !== 'sec') throw new Error('Ce code n’est pas un échange de dossier.');
  return { obj, pass, salt: saltOf(packed) };
}

// Crée le dossier local d'un patient découvert par scan, puis range sa section
export async function acceptNew(obj, memberName, role, pass, salt) {
  setMyName(memberName);
  if (obj.tpl?.custom && !(await db.get('templates', obj.tpl.id))) await db.put('templates', obj.tpl);
  const existing = await db.get('patients', obj.pt.id);
  const share = { provider: 'qr', role, memberId: me().id, memberName, ...(pass ? { pass, salt } : {}) };
  const p = { ...(existing || {}), ...obj.pt, created: existing?.created || Date.now(), updated: Date.now(), share };
  await db.put('patients', p);
  return { patient: p, ...(await applySection(obj, [p])) };
}

async function applySection(o, patients) {
  const p = patients.find(x => x.id === o.pid);
  if (!p) throw new Error('Ce code concerne un dossier que vous n’avez pas : rejoignez-le d’abord avec l’invitation.');
  if (o.m.id === p.share.memberId) throw new Error('C’est votre propre section.');
  const id = `${p.id}:m-${o.m.id}.json`, old = await db.get('remote', id);
  if (old && (old.updated || 0) > o.u) return { patient: p, name: o.m.name, added: 0, stale: true };
  const byId = new Map(o.full ? [] : (old?.entries || []).map(e => [e.id, e]));
  let added = 0; for (const e of o.e) { if (!byId.has(e.id)) added++; byId.set(e.id, e); }
  await db.put('remote', { id, patientId: p.id, memberId: o.m.id, name: o.m.name, role: o.m.role, entries: [...byId.values()], messages: o.g || [], modified: 0, updated: o.u, src: 'qr' });
  return { patient: p, name: o.m.name, added };
}

// Rejoint un dossier à partir d'une invitation scannée
export async function acceptInvite(inv, memberName, role, pass) {
  if (inv.enc && !pass) throw new Error('Ce dossier est chiffré : saisissez la phrase secrète donnée par le propriétaire.');
  setMyName(memberName);
  if (inv.tpl?.custom && !(await db.get('templates', inv.tpl.id))) await db.put('templates', inv.tpl);
  const existing = await db.get('patients', inv.patient.id);
  const share = { provider: 'qr', role, memberId: me().id, memberName, ...(inv.enc ? { pass, salt: inv.salt } : {}) };
  const p = { ...(existing || {}), ...inv.patient, created: existing?.created || Date.now(), updated: Date.now(), share };
  await db.put('patients', p);
  return p;
}
