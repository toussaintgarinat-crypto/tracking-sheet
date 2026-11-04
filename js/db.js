// Persistance locale : IndexedDB (aucune donnée ne quitte l'appareil)
const DB_NAME = 'suivi-hospitalier';
const DB_VERSION = 2;
let dbp;
// repère « il y a des changements non sauvegardés » (rappel de sauvegarde)
const touch = () => { try { localStorage.setItem('lastChange', String(Date.now())); } catch { /* ignoré */ } };

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = req.result;
      if (e.oldVersion < 1) {
        db.createObjectStore('patients', { keyPath: 'id' });
        const en = db.createObjectStore('entries', { keyPath: 'id' });
        en.createIndex('patientId', 'patientId');
        db.createObjectStore('templates', { keyPath: 'id' });
      }
      if (e.oldVersion < 2) db.createObjectStore('received', { keyPath: 'id' }); // bilans reçus (mode corps médical)
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    let result;
    Promise.resolve(fn(t)).then(r => { result = r; }, reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const wrap = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const db = {
  all: store => tx(store, 'readonly', t => wrap(t.objectStore(store).getAll())),
  get: (store, id) => tx(store, 'readonly', t => wrap(t.objectStore(store).get(id))),
  put: (store, obj) => { touch(); return tx(store, 'readwrite', t => wrap(t.objectStore(store).put(obj))); },
  del: (store, id) => { touch(); return tx(store, 'readwrite', t => wrap(t.objectStore(store).delete(id))); },
  // import/export en bloc (sauvegarde)
  async dump() {
    const out = {};
    for (const s of ['patients', 'entries', 'templates', 'received']) out[s] = await db.all(s);
    return out;
  },
  async load(data, replace) {
    touch();
    const stores = ['patients', 'entries', 'templates', 'received'];
    await tx(stores, 'readwrite', t => {
      for (const s of stores) {
        const os = t.objectStore(s);
        if (replace) os.clear();
        (data[s] || []).forEach(o => os.put(o));
      }
    });
  },
  entriesOf: pid => tx('entries', 'readonly', t => wrap(t.objectStore('entries').index('patientId').getAll(pid))),

  // Purge définitive d'un patient et de tout son historique
  async purgePatient(pid) {
    touch();
    await tx(['entries', 'patients'], 'readwrite', async t => {
      const idx = t.objectStore('entries').index('patientId');
      const keys = await wrap(idx.getAllKeys(pid));
      keys.forEach(k => t.objectStore('entries').delete(k));
      t.objectStore('patients').delete(pid);
    });
  },
  // Purge totale (patients, saisies, modèles personnalisés)
  async purgeAll() {
    touch();
    await tx(['entries', 'patients', 'templates', 'received'], 'readwrite', t => {
      ['entries', 'patients', 'templates', 'received'].forEach(s => t.objectStore(s).clear());
    });
  },
  purgeReceived: () => { touch(); return tx('received', 'readwrite', t => wrap(t.objectStore('received').clear())); },
};

export async function requestPersistence() {
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch { /* ignoré */ }
}
