// Sauvegarde / restauration : un fichier JSON (chiffrable par mot de passe, AES-GCM 256 + PBKDF2) que l'utilisateur
// range où il veut (Drive, Fichiers, iCloud, clé USB, mail…) via la feuille de partage ou le téléchargement.
// Aucune donnée ne part vers un service tiers depuis l'application.
import { db } from './db.js';

const APP = 'suivi-hospitalier', ITER = 250000;
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function key(pass, salt, iter) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export const counts = d => ({ patients: d.patients?.length || 0, entries: d.entries?.length || 0, templates: d.templates?.length || 0, received: d.received?.length || 0, emergency: d.emergency?.length || 0 });

export async function createBackup(pass) {
  const data = await db.dump();
  const plain = { app: APP, v: 1, exportedAt: new Date().toISOString(), counts: counts(data), data };
  let out = plain;
  if (pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(pass, salt, ITER), new TextEncoder().encode(JSON.stringify(plain))));
    out = { app: APP, v: 1, enc: 'AES-GCM', kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), iv: b64(iv), exportedAt: plain.exportedAt, ct: b64(ct) };
  }
  const p = n => String(n).padStart(2, '0'), d = new Date();
  const name = `suivi-sauvegarde-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${pass ? '-chiffree' : ''}.json`;
  return { blob: new Blob([JSON.stringify(out)], { type: 'application/json' }), name, counts: plain.counts };
}

// Lit un fichier : retourne { encrypted:true } s'il faut un mot de passe, sinon le contenu validé
export async function readBackup(file, pass) {
  let j;
  try { j = JSON.parse(await file.text()); } catch { throw new Error('Ce fichier n’est pas une sauvegarde valide.'); }
  if (j?.app !== APP) throw new Error('Ce fichier n’est pas une sauvegarde de cette application.');
  if (j.enc) {
    if (!pass) return { encrypted: true };
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(j.iv) }, await key(pass, unb64(j.salt), j.iter || ITER), unb64(j.ct));
      j = JSON.parse(new TextDecoder().decode(pt));
    } catch { throw new Error('Mot de passe incorrect (ou fichier abîmé).'); }
  }
  if (!j.data || typeof j.data !== 'object') throw new Error('Sauvegarde vide ou illisible.');
  return { encrypted: false, exportedAt: j.exportedAt, data: j.data, counts: counts(j.data) };
}

export async function restore(data, replace) { await db.load(data, replace); markBackedUp(); }

// Rappel de sauvegarde
const get = k => { try { return +localStorage.getItem(k) || 0; } catch { return 0; } };
export const markBackedUp = () => { try { localStorage.setItem('lastBackup', String(Date.now())); } catch { /* ignoré */ } };
export const backupState = () => ({ lastBackup: get('lastBackup'), lastChange: get('lastChange') });

// Feuille de partage (Fichiers, Drive, AirDrop, mail…) ou téléchargement
export async function saveBlob(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return 'shared'; }
  } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}
