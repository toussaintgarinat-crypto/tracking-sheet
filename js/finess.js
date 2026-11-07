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

let catalog; const cache = new Map();
export async function loadCatalog() {
  return catalog ||= await (await fetch('library/finess/index.json')).json();
}
export async function loadDept(code) {
  if (!cache.has(code)) {
    const res = await fetch(`library/finess/${code}.json`);
    if (!res.ok) throw new Error('Département indisponible');
    cache.set(code, (await res.json()).map(([id, nom, adresse, cp, ville, tel, type]) => ({ id, nom, adresse, cp, ville, tel, type })));
  }
  return cache.get(code);
}

const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Filtre : code postal (préfixe), type de structure, texte libre (nom, ville, adresse)
export function filterEtabs(list, { cp = '', type = '', q = '' } = {}) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  return list.filter(e => (!cp || e.cp.startsWith(cp)) && (!type || e.type === type)
    && words.every(w => norm(`${e.nom} ${e.ville} ${e.adresse}`).includes(w)));
}

// Nom d'établissement utilisé pour ranger les fiches
export const orgName = e => `${e.nom} – ${niceCity(e.ville)}`;
export const niceCity = v => v.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
