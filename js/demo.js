// Démonstration intégrée à l'aide : QR codes d'exemple (données 100 % fictives), générés à l'ouverture,
// sans rien écrire dans la base de l'utilisateur. « Essayer » passe par le même chemin qu'un scan.
import { pack, toCodes } from './qrsync.js';
import * as ug from './urgence.js';
import { BUILTIN_TEMPLATES, templateFields } from './modules.js';
import { qrPayloads } from './export.js';

export const DEMO_PASS = 'demo2026';
const SALT = btoa('demo-salt-16byte'); // 16 octets : sel fixe, uniquement pour la démonstration

export async function demoItems(appUrl) {
  const now = Date.now(), H = 3600000;
  const f = { ...ug.blank(), name: 'Léa Martin (exemple)', birth: '2018-03-12', blood: 'O+', allergies: 'pénicilline, arachide', meds: 'insuline (pompe)', conditions: 'diabète de type 1', devices: 'pompe à insuline',
    contacts: [{ n: 'Sophie Martin', r: 'mère', t: '06 00 00 00 01' }, { n: 'Marc Martin', r: 'père', t: '06 00 00 00 02' }, { n: '', t: '', r: '' }],
    trust: { n: 'Sophie Martin', r: 'mère', t: '06 00 00 00 01' }, directives: 'Sans objet (mineure)', doctor: 'Dr Dupont', doctorTel: '05 00 00 00 03', note: 'Parle français' };
  const tg = BUILTIN_TEMPLATES.find(x => x.id === 'tpl-general'), fields = templateFields(tg);
  const bilan = qrPayloads({ id: 'x', name: 'Léa M. (exemple)' }, tg, fields,
    [[-6, 37.8, 110], [-3, 38.6, 124], [-1, 39.1, 132]].map(([dh, temp, fc], i) => ({ id: 'b' + i, ts: now + dh * H, values: { temp, fc } })), { includeName: true })[0];
  const sec = { k: 'sec', pid: 'demo-lea', pt: { id: 'demo-lea', name: 'Léa M. (démo)', service: 'Pédiatrie', templateId: 'tpl-pediatrie' }, tpl: null, m: { id: 'demo-maman', name: 'Maman (démo)', role: 'parent' }, u: now, full: true,
    e: [[-5, 37.9], [-2, 38.7], [-0.5, 39.2]].map(([dh, temp], i) => ({ id: 'd' + i, patientId: 'demo-lea', ts: now + dh * H, values: { temp } })), g: [] };
  const inv = { k: 'inv', patient: { id: 'demo-tom', name: 'Tom B. (démo)', service: '', templateId: 'tpl-general' }, tpl: null, salt: null, enc: false };
  const secCode = toCodes(await pack(sec, { pass: DEMO_PASS, salt: SALT }))[0], invCode = toCodes(await pack(inv, null))[0];
  return [
    { id: 'install', title: 'Installer l’application', text: appUrl, scan: 'Appareil photo du téléphone', what: 'Un lien vers l’application, à ouvrir puis à ajouter à l’écran d’accueil.', res: 'Le téléphone propose d’ouvrir l’adresse de l’application.' },
    { id: 'urgence', title: 'Fiche d’urgence', text: ug.payload(f), pre: true, scan: 'Appareil photo du téléphone, sans application', what: 'Les informations vitales en texte lisible : c’est le QR de la carte de portefeuille.', res: 'Le téléphone affiche le texte : identité, allergies, traitements, personnes à prévenir.' },
    { id: 'bilan', title: 'Bilan d’un patient', text: bilan, pre: true, scan: 'Appareil photo, ou « Recevoir un bilan » (mode Hôpital)', what: 'Trois saisies de température et de fréquence cardiaque, envoyées par le patient au soignant.', res: 'Le téléphone affiche le bilan en texte.' },
    { id: 'section', title: 'Section chiffrée d’un dossier', text: secCode, tryIt: true, scan: 'Application : « Recevoir par QR »', what: `Les saisies de « Léa M. (démo) », chiffrées. Code à saisir une seule fois : ${DEMO_PASS}.`, res: 'L’application demande votre nom, votre rôle et le code, puis ajoute le patient avec 3 saisies de température (supprimable ensuite).' },
    { id: 'invitation', title: 'Invitation à un dossier', text: invCode, tryIt: true, scan: 'Application : « Recevoir par QR »', what: 'Invitation pour rejoindre « Tom B. (démo) », sans phrase secrète.', res: 'L’application demande votre nom et votre rôle, puis ouvre le dossier partagé (supprimable ensuite).' },
  ];
}
