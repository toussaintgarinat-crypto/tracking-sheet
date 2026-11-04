// Fournisseur de stockage « Google Drive » pour les dossiers partagés.
// Chaque dossier patient = un dossier Drive partagé (Éditeur pour ceux qui écrivent, Lecteur sinon).
// Authentification : Google Identity Services (OAuth, jeton gardé en mémoire uniquement).
// Interface commune d'un fournisseur : ready(), list(folder), read(file), write(folder, name, obj, fileId?)
// → un futur fournisseur « PostgreSQL / API » implémente les mêmes 4 méthodes (voir sync.js).
const API = 'https://www.googleapis.com/drive/v3', UP = 'https://www.googleapis.com/upload/drive/v3';
const SCOPE = 'https://www.googleapis.com/auth/drive'; // voir README : drive.file ne voit pas les fichiers créés par les autres membres

let token = null, expires = 0, gisLoading = null;
const clientId = () => { try { return localStorage.getItem('gClientId') || ''; } catch { return ''; } };
export const setClientId = v => { try { localStorage.setItem('gClientId', v.trim()); } catch { /* ignoré */ } };
export const hasClientId = () => !!clientId();

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return gisLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = resolve; s.onerror = () => { gisLoading = null; reject(new Error('Connexion à Google impossible (réseau ?).')); };
    document.head.append(s);
  });
}

async function auth(interactive = true) {
  if (token && Date.now() < expires - 30000) return token;
  if (!clientId()) throw new Error('Identifiant client Google non renseigné (écran Dossiers partagés).');
  await loadGis();
  return new Promise((resolve, reject) => {
    const tc = google.accounts.oauth2.initTokenClient({
      client_id: clientId(), scope: SCOPE, prompt: interactive ? '' : 'none',
      callback: r => {
        if (r.error) return reject(new Error('Autorisation Google refusée : ' + r.error));
        token = r.access_token; expires = Date.now() + (r.expires_in || 3600) * 1000; resolve(token);
      },
      error_callback: e => reject(new Error('Autorisation Google impossible : ' + (e.type || e.message || 'annulée'))),
    });
    tc.requestAccessToken();
  });
}

async function call(url, opts = {}) {
  const t = await auth();
  const res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } });
  if (res.status === 401) { token = null; throw new Error('Session Google expirée, réessayez.'); }
  if (res.status === 403 || res.status === 404) {
    const e = new Error(res.status === 403 ? 'Accès refusé : vous n’avez pas les droits d’écriture sur ce dossier Drive.' : 'Dossier ou fichier introuvable (lien incorrect, ou non partagé avec ce compte Google).');
    e.status = res.status; throw e;
  }
  if (!res.ok) throw new Error('Erreur Google Drive ' + res.status);
  return res;
}

export const folderId = input => {
  const m = String(input).match(/\/folders\/([\w-]{10,})/) || String(input).match(/[?&]id=([\w-]{10,})/) || String(input).trim().match(/^([\w-]{10,})$/);
  if (!m) throw new Error('Lien de dossier Drive non reconnu.');
  return m[1];
};

export const drive = {
  name: 'Google Drive',
  ready: () => auth(true).then(() => true),
  async list(folder) {
    const out = []; let page = '';
    do {
      const q = encodeURIComponent(`'${folder}' in parents and trashed=false`);
      const j = await (await call(`${API}/files?q=${q}&fields=nextPageToken,files(id,name,modifiedTime)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true${page ? '&pageToken=' + page : ''}`)).json();
      out.push(...j.files.map(f => ({ id: f.id, name: f.name, modified: Date.parse(f.modifiedTime) })));
      page = j.nextPageToken;
    } while (page);
    return out;
  },
  read: async file => (await call(`${API}/files/${file}?alt=media&supportsAllDrives=true`)).json(),
  async write(folder, name, obj, fileId) {
    const body = JSON.stringify(obj);
    if (fileId) {
      const r = await call(`${UP}/files/${fileId}?uploadType=media&supportsAllDrives=true`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      return (await r.json()).id;
    }
    const b = 'b' + Math.random().toString(36).slice(2);
    const multipart = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folder] })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
    const r = await call(`${UP}/files?uploadType=multipart&supportsAllDrives=true`, { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: multipart });
    return (await r.json()).id;
  },
};
