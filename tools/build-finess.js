// Génère l'annuaire des établissements (un fichier par département) à partir du fichier FINESS officiel.
// Source : « Extraction Finess des Etablissements » (data.gouv.fr, Licence Ouverte / Etalab), CSV « etalab-cs1100502 ».
// Usage : node tools/build-finess.js chemin/vers/etalab-cs1100502-stock-….csv
const fs = require('fs'), path = require('path');
const src = process.argv[2];
if (!src) { console.error('Usage: node tools/build-finess.js <fichier-finess.csv>'); process.exit(1); }

// Types de structure proposés dans le filtre (id court -> libellé), et catégories FINESS (categagretab) qui s'y rattachent.
const TYPES = [
  ['hop', 'Hôpitaux, CHU, CH, cliniques', ['1101', '1102', '1106', '1109', '1110', '2205']],
  ['psy', 'Psychiatrie / santé mentale', ['1103', '1111']],
  ['onc', 'Cancérologie', ['1104']],
  ['ssr', 'Soins de suite et réadaptation', ['1107']],
  ['dom', 'Dialyse, soins et hospitalisation à domicile', ['1201', '1203']],
  ['sante', 'Autres établissements de santé', ['1205', '3405', '3406', '3407']],
  ['cds', 'Centres de santé, dispensaires, PMI', ['2201', '2202', '2204', '2206']],
  ['lib', 'Exercice libéral, maisons de santé', ['2103']],
  ['bio', 'Laboratoires, transfusion', ['3101', '3401']],
  ['pharma', 'Pharmacies, matériel médical', ['3201']],
  ['ehpad', 'EHPAD, personnes âgées', ['4401', '4402', '4404']],
  ['handi', 'Handicap (enfants et adultes)', ['4101', '4102', '4103', '4104', '4105', '4106', '4107', '4301', '4302', '4303', '4304', '4305', '4609']],
  ['enf', 'Enfance, protection de l’enfance', ['4501', '4502', '4504', '4505']],
  ['soc', 'Social, précarité, hébergement', ['4601', '4602', '4603', '4604', '4605', '4606', '4607', '4608']],
  ['autre', 'Autres (prévention, formation, secours…)', []],
];
const groupOf = {};
for (const [id, , codes] of TYPES) for (const c of codes) groupOf[c] = id;

// Découpage d'une ligne CSV « ; » avec champs entre guillemets (guillemet doublé = guillemet littéral)
function splitLine(l) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) { if (c === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ';') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
}
const lines = fs.readFileSync(src, 'utf8').split(/\r?\n/);
const rows = lines.map(splitLine).filter(r => r[0] === 'structureet' && r.length >= 22);
const byDept = {}, deptLabel = {};
const clean = s => (s || '').replace(/\s+/g, ' ').trim();
for (const r of rows) {
  const dept = r[13];
  deptLabel[dept] ||= clean(r[14]);
  const m = /^(\d{5})\s+(.*)$/.exec(clean(r[15]));
  const cp = m ? m[1] : '', ville = m ? m[2].replace(/\s+CEDEX(\s+\d+)?$/i, '') : clean(r[15]);
  const adresse = clean([r[7], r[8], r[9]].join(' '));
  const nom = clean(r[3]) || clean(r[4]);
  const tel = clean(r[16]).replace(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5');
  (byDept[dept] ||= []).push([r[1], nom, adresse, cp, ville, tel, groupOf[r[20]] || 'autre']);
}
const out = path.join(__dirname, '..', 'library', 'finess');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const depts = {};
for (const [d, list] of Object.entries(byDept)) {
  list.sort((a, b) => a[3].localeCompare(b[3]) || a[1].localeCompare(b[1]));
  fs.writeFileSync(path.join(out, `${d}.json`), JSON.stringify(list));
  depts[d] = { n: list.length, l: deptLabel[d] };
}
const stamp = (lines[0].split(';')[3] || '').trim();
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({ v: 1, source: 'FINESS – data.gouv.fr (Licence Ouverte Etalab)', stamp, types: TYPES.map(([id, label]) => ({ id, label })), depts }));
console.log(`${rows.length} établissements, ${Object.keys(depts).length} départements`);
