// Annuaire des établissements (FINESS) : logique de recherche, sans DOM.
// Les données sont dans library/finess/<département>.json, chargées à la demande (un seul département à la fois).

// Régions → codes de département FINESS (2A/2B pour la Corse, 9A… pour l'outre-mer)
export const REGIONS = [
  ['Auvergne-Rhône-Alpes', ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74']],
  ['Bourgogne-Franche-Comté', ['21', '25', '39', '58', '70', '71', '89', '90']],
  ['Bretagne', ['22', '29', '35', '56']],
  ['Centre-Val de Loire', ['18', '28', '36', '37', '41', '45']],
  ['Corse', ['2A', '2B']],
  ['Grand Est', ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88']],
  ['Hauts-de-France', ['02', '59', '60', '62', '80']],
  ['Île-de-France', ['75', '77', '78', '91', '92', '93', '94', '95']],
  ['Normandie', ['14', '27', '50', '61', '76']],
  ['Nouvelle-Aquitaine', ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87']],
  ['Occitanie', ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82']],
  ['Pays de la Loire', ['44', '49', '53', '72', '85']],
  ['Provence-Alpes-Côte d’Azur', ['04', '05', '06', '13', '83', '84']],
  ['Guadeloupe', ['9A']], ['Martinique', ['9B']], ['Guyane', ['9C']], ['La Réunion', ['9D']], ['Mayotte', ['9F']],
  ['Autres outre-mer', ['9E', '9J']],
];

// Code postal (même partiel) → fichiers de département à charger
export function deptsForCp(cp) {
  if (!/^\d{2}/.test(cp)) return [];
  const p2 = cp.slice(0, 2);
  if (p2 === '20') return ['2A', '2B'];
  if (p2 === '97' || p2 === '98') {
    if (cp.length < 3) return [];
    return { 971: ['9A'], 972: ['9B'], 973: ['9C'], 974: ['9D'], 975: ['9E'], 976: ['9F'], 977: ['9A', '9D'], 978: ['9A', '9D'], 986: ['9J'] }[cp.slice(0, 3)] || [];
  }
  return [p2];
}

let catalog, aliases = {}; const cache = new Map();
export async function loadCatalog() {
  if (!catalog) {
    catalog = await (await fetch('library/finess/index.json')).json();
    // Noms usuels (facultatif) : n° FINESS -> noms connus des équipes mais absents du fichier officiel
    try { aliases = (await (await fetch('library/finess-alias.json')).json()).alias || {}; } catch { aliases = {}; }
  }
  return catalog;
}
export async function loadDept(code) {
  if (!cache.has(code)) {
    const res = await fetch(`library/finess/${code}.json`);
    if (!res.ok) throw new Error('Département indisponible');
    cache.set(code, (await res.json()).map(([id, nom, adresse, cp, ville, tel, type]) => ({ id, nom, adresse, cp, ville, tel, type })));
  }
  return cache.get(code);
}

// Normalisation : sans accents ni casse, « saint » → « st » (comme dans FINESS), ponctuation ignorée
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\bsaint(e?)\b/g, 'st$1').replace(/[^a-z0-9]+/g, ' ').trim();
// Mots trop génériques pour départager des établissements (FINESS écrit « HOP », « CL », « CH »… à la place) : ignorés tant qu'il reste un mot précis
const GENERIC = new Set(['hopital', 'hopitaux', 'hop', 'clinique', 'cl', 'centre', 'ctr', 'hospitalier', 'ch', 'chu', 'chr', 'chi', 'groupe', 'de', 'du', 'des', 'la', 'le', 'les', 'd', 'l', 'et', 'a', 'au', 'aux', 'en']);
export function queryWords(q) {
  const all = norm(q).split(' ').filter(Boolean);
  const precise = all.filter(w => !GENERIC.has(w));
  return precise.length ? precise : all;
}

// Filtre : code postal (préfixe), type de structure, texte libre (nom, nom usuel, ville, adresse).
// Si la recherche ne correspond qu'à un nom usuel, la structure est renvoyée sous ce nom (nom officiel conservé dans `officiel`).
// Les structures dont le NOM correspond passent avant celles qui ne correspondent que par la ville ou l'adresse.
export function filterEtabs(list, { cp = '', type = '', q = '' } = {}) {
  const words = queryWords(q), typed = norm(q).split(' ').filter(Boolean);
  const hit = text => { const t = norm(text); return words.every(w => t.includes(w)); };
  // pertinence : mots saisis retrouvés dans le nom (y compris « hôpital »), puis hôpitaux/cliniques avant le reste
  const score = e => { const t = norm(e.nom); return typed.filter(w => t.includes(w)).length * 2 + (e.type === 'hop' ? 1 : 0); };
  const out = [];
  for (const e of list) {
    if ((cp && !e.cp.startsWith(cp)) || (type && e.type !== type)) continue;
    if (!words.length) { out.push({ e, rank: 0 }); continue; }
    if (hit(e.nom)) { out.push({ e, rank: 0 }); continue; }
    const a = (aliases[e.id] || []).find(n => hit(n));
    if (a) { out.push({ e: { ...e, nom: a, officiel: e.nom }, rank: 0 }); continue; }
    if (hit(`${e.nom} ${e.ville} ${e.adresse}`)) out.push({ e, rank: 1 });
  }
  return out.sort((x, y) => x.rank - y.rank || score(y.e) - score(x.e)).map(x => x.e);
}

// Nom d'établissement utilisé pour ranger les fiches
export const orgName = e => e.ville ? `${e.nom} – ${niceCity(e.ville)}` : e.nom;
export const niceCity = v => v.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
