// Bibliothèque de modules (groupes de champs) et de modèles standards.
// Types de champ : number, bp (tension), choice, multi, scale, bool, text

const OUI_NON = ['Oui', 'Non'];

export const MODULES = {
  vitals: {
    name: 'Constantes vitales', icon: '🩺',
    fields: [
      { key: 'temp', short: 'T°', label: 'Température', type: 'number', unit: '°C', min: 34, max: 42, step: 0.1, def: 37, quick: [36.5, 37, 37.5, 38, 38.5, 39] },
      { key: 'ta', short: 'TA', label: 'Tension artérielle', type: 'bp', unit: 'mmHg', def: [120, 80] },
      { key: 'fc', short: 'FC', label: 'Fréquence cardiaque', type: 'number', unit: 'bpm', min: 20, max: 250, step: 1, def: 80, quick: [60, 70, 80, 90, 100, 120] },
      { key: 'spo2', short: 'SpO2', label: 'Saturation (SpO₂)', type: 'number', unit: '%', min: 50, max: 100, step: 1, def: 97, quick: [92, 95, 96, 97, 98, 100] },
      { key: 'fr', short: 'FR', label: 'Fréq. respiratoire', type: 'number', unit: '/min', min: 5, max: 70, step: 1, def: 16, quick: [12, 16, 20, 24, 30] },
      { key: 'gly', short: 'Glyc', label: 'Glycémie capillaire', type: 'number', unit: 'g/L', min: 0.2, max: 6, step: 0.1, def: 1, quick: [0.7, 1, 1.2, 1.5, 2] },
    ],
  },
  io: {
    name: 'Alimentation & Transit', icon: '🍽️',
    fields: [
      { key: 'hydra', short: 'Hydra', label: 'Hydratation (entrées)', type: 'number', unit: 'ml', min: 0, max: 3000, step: 50, def: 100, quick: [50, 100, 150, 200, 250, 500] },
      { key: 'repas', short: 'Repas', label: 'Repas pris', type: 'choice', options: ['Rien', '¼', '½', '¾', 'Tout'] },
      { key: 'diur', short: 'Diurèse', label: 'Diurèse', type: 'number', unit: 'ml', min: 0, max: 3000, step: 50, def: 100, quick: [50, 100, 200, 300, 500] },
      { key: 'transit', short: 'Selles', label: 'Transit (Bristol)', type: 'choice', options: ['Aucune', '1', '2', '3', '4', '5', '6', '7'], hint: 'Bristol 1 = dur … 7 = liquide' },
      { key: 'vomi', short: 'Vomi', label: 'Vomissements', type: 'choice', options: ['Non', '1', '2', '3+'] },
      { key: 'stomie', short: 'Stomie', label: 'Stomie / drainage', type: 'number', unit: 'ml', min: 0, max: 3000, step: 10, def: 50, quick: [20, 50, 100, 200] },
    ],
  },
  pain: {
    name: 'Évaluation de la douleur', icon: '😣',
    fields: [
      { key: 'eva', short: 'EVA', label: 'Douleur EVA (0-10)', type: 'scale', max: 10 },
      { key: 'algo', short: 'Algo+', label: 'Algoplus (0-5)', type: 'scale', max: 5 },
      { key: 'dloc', short: 'Siège', label: 'Localisation', type: 'choice', options: ['Tête', 'Thorax', 'Abdomen', 'Dos', 'Bras', 'Jambe', 'Plaie', 'Autre'] },
      { key: 'dtype', short: 'Type', label: 'Type de douleur', type: 'choice', options: ['Brûlure', 'Piqûre', 'Crampe', 'Pulsatile', 'Étau', 'Autre'] },
    ],
  },
  care: {
    name: 'Traitements & Soins', icon: '💊',
    fields: [
      { key: 'med', short: 'Médic.', label: 'Médicament donné', type: 'text' },
      { key: 'dose', short: 'Dose', label: 'Dose', type: 'text' },
      { key: 'voie', short: 'Voie', label: 'Voie', type: 'choice', options: ['Orale', 'IV', 'SC', 'IM', 'Inhalée', 'Rectale', 'Locale'] },
      { key: 'pans', short: 'Pans.', label: 'Pansement', type: 'choice', options: ['Non', 'Vérifié', 'Refait', 'Renforcé'] },
      { key: 'inj', short: 'Inj.', label: 'Injection', type: 'text' },
      { key: 'soin', short: 'Soin', label: 'Soin spécifique', type: 'text' },
    ],
  },
  bio: {
    name: 'Biométrie & Évolution', icon: '⚖️',
    fields: [
      { key: 'poids', short: 'Poids', label: 'Poids', type: 'number', unit: 'kg', min: 1, max: 300, step: 0.1, def: 60 },
      { key: 'peri', short: 'PA cm', label: 'Périmètre abdominal', type: 'number', unit: 'cm', min: 30, max: 200, step: 1, def: 90 },
      { key: 'drain', short: 'Drain', label: 'Drainage', type: 'number', unit: 'ml', min: 0, max: 3000, step: 10, def: 50, quick: [20, 50, 100, 200] },
      { key: 'sang', short: 'Saign.', label: 'Saignements', type: 'choice', options: ['Aucun', 'Minimes', 'Modérés', 'Abondants'] },
    ],
  },
  mater: {
    name: 'Maternité / Néonatologie', icon: '👶',
    fields: [
      { key: 'tetee', short: 'Tétée', label: 'Tétée / allaitement', type: 'number', unit: 'min', min: 0, max: 90, step: 5, def: 15, quick: [5, 10, 15, 20, 30] },
      { key: 'cote', short: 'Côté', label: 'Côté de tétée', type: 'choice', options: ['Gauche', 'Droit', 'Les deux'] },
      { key: 'bib', short: 'Biberon', label: 'Biberon', type: 'number', unit: 'ml', min: 0, max: 300, step: 5, def: 60, quick: [20, 30, 45, 60, 90, 120] },
      { key: 'mict', short: 'Mict.', label: 'Miction bébé', type: 'choice', options: OUI_NON },
      { key: 'selbb', short: 'Selles bb', label: 'Selles bébé', type: 'choice', options: ['Aucune', 'Méconium', 'Jaune', 'Verdâtre', 'Liquide'] },
      { key: 'poidsbb', short: 'Poids bb', label: 'Poids bébé', type: 'number', unit: 'g', min: 500, max: 6000, step: 10, def: 3200 },
      { key: 'lochies', short: 'Lochies', label: 'Maman : lochies', type: 'choice', options: ['Rares', 'Normales', 'Abondantes', 'Caillots'] },
      { key: 'involut', short: 'Involut.', label: 'Maman : involution utérine', type: 'choice', options: ['Normale', 'Lente', 'À surveiller'] },
      { key: 'cicat', short: 'Cicat.', label: 'Maman : cicatrice / périnée', type: 'choice', options: ['RAS', 'Douloureux', 'Œdème', 'Écoulement'] },
    ],
  },
};

export const BUILTIN_TEMPLATES = [
  { id: 'tpl-general', name: 'Constantes générales', desc: 'Surveillance de base, tout service', modules: ['vitals', 'pain'] },
  { id: 'tpl-pediatrie', name: 'Pédiatrie', desc: 'Constantes, alimentation/transit, douleur, poids', modules: ['vitals', 'io', 'pain', 'bio'] },
  { id: 'tpl-maternite', name: 'Maternité / Néonatologie', desc: 'Nourrisson et suites de couches', modules: ['mater', 'vitals', 'pain'] },
  { id: 'tpl-chirurgie', name: 'Chirurgie', desc: 'Constantes, douleur, drains, pansements, traitements', modules: ['vitals', 'pain', 'io', 'bio', 'care'] },
  { id: 'tpl-geriatrie', name: 'Gériatrie', desc: 'Constantes, hydratation, Algoplus, traitements', modules: ['vitals', 'io', 'pain', 'care', 'bio'] },
  { id: 'tpl-oncologie', name: 'Oncologie', desc: 'Constantes, douleur, alimentation, traitements', modules: ['vitals', 'pain', 'io', 'care'] },
  { id: 'tpl-continus', name: 'Soins continus', desc: 'Constantes rapprochées, entrées/sorties, soins', modules: ['vitals', 'io', 'bio', 'care'] },
];

// Champs d'un modèle (résolus depuis les modules si besoin)
export function templateFields(t) {
  if (t.fields) return t.fields;
  return t.modules.flatMap(id => {
    const m = MODULES[id];
    return m.fields.map(f => ({ ...f, group: m.name }));
  });
}

export function resolveModules(ids) {
  return ids.flatMap(id => MODULES[id].fields.map(f => ({ ...f, group: MODULES[id].name })));
}

// Valeur -> texte d'affichage
export function fmtValue(f, v) {
  if (v == null || v === '') return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  return String(v);
}
