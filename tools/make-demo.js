// Génère les captures d'écran et les QR codes de démonstration du README (données 100 % fictives).
// Usage : python3 -m http.server 8123 &   puis   NODE_PATH=$(npm root -g) node tools/make-demo.js
// Variables : BASE (défaut http://localhost:8123/), APP_URL (adresse publique mise dans le QR « installer »).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.BASE || 'http://localhost:8123/';
const APP_URL = process.env.APP_URL || 'https://toussaintgarinat-crypto.github.io/tracking-sheet/';
const OUT = path.join(__dirname, '..', 'docs');

(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris', colorScheme: 'light' });
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(BASE); await pg.waitForTimeout(400);

  // ---------- Données fictives ----------
  await pg.evaluate(async () => {
    const { db } = await import('./js/db.js'); const sync = await import('./js/sync.js'); const ug = await import('./js/urgence.js');
    const now = Date.now(), H = 3600000, M = 60000, me = sync.me().id;
    sync.setMyName('Dr Moreau');
    const share = (role, extra = {}) => ({ provider: 'qr', role, memberId: me, memberName: 'Dr Moreau', ...extra });
    const salt = sync.newSalt();
    const ent = (pid, list) => Promise.all(list.map(([ago, values], i) => db.put('entries', { id: pid + i, patientId: pid, ts: now - ago, values })));
    const remote = (pid, mid, name, role, entries, messages = []) => db.put('remote', { id: `${pid}:m-${mid}.json`, patientId: pid, memberId: mid, name, role, entries: entries.map(([ago, values], i) => ({ id: mid + i, ts: now - ago, values })), messages, modified: 0, updated: now, src: 'qr' });

    // Léa : dossier partagé vu par un parent (messages en attente du pédiatre)
    await db.put('patients', { id: 'lea', name: 'Léa M.', service: 'Chambre 12', templateId: 'tpl-pediatrie', created: now - 3 * H, updated: now, share: { ...share('parent', { memberName: 'Maman de Léa', pass: 'demo2026', salt }) } });
    await ent('lea', [[5 * H, { temp: 37.6, fc: 104, spo2: 98, eva: 2 }], [3 * H + 20 * M, { temp: 38.2, fc: 112, spo2: 97, eva: 3 }], [70 * M, { temp: 38.6, fc: 118, spo2: 97, eva: 4 }]]);
    await remote('lea', 'drm', 'Dr Martin', 'soignant', [[4 * H, { temp: 37.9, fc: 108, spo2: 98 }]], [{ id: 'q1', ts: now - 25 * M, kind: 'ask', text: 'Comment va Léa depuis ce matin ?' }]);
    // Suivi libéral : le professionnel suit d'autres patients
    await db.put('patients', { id: 'tom', name: 'Tom B.', service: '', templateId: 'tpl-general', created: now - 30 * H, updated: now, share: share('soignant'), alertHours: 6 });
    await ent('tom', [[2 * H, { temp: 36.9, fc: 74, spo2: 99 }]]);
    await db.put('patients', { id: 'ines', name: 'Inès R.', service: '', templateId: 'tpl-general', created: now - 30 * H, updated: now, share: share('soignant'), alertHours: 6 });
    await ent('ines', [[8 * H, { temp: 37.1, fc: 80, spo2: 98 }]]);
    await db.put('patients', { id: 'paul', name: 'Paul D.', service: '', templateId: 'tpl-general', created: now - 30 * H, updated: now, share: share('owner', { provider: 'drive', folder: 'DEMOFOLDER0123456789', pass: 'demo2026', salt }), alertHours: 6, thresholds: { temp: { max: 38.5 } } });
    await ent('paul', [[90 * M, { temp: 39.4, fc: 118, spo2: 95 }]]);
    const t = await db.get('patients', 'tom'); t.msgs = [{ id: 'm1', ts: now - 5 * H, kind: 'ask', text: 'Tout va bien ?' }]; await db.put('patients', t);
    await remote('tom', 'papa', 'Papa de Tom', 'parent', [[2 * H, { temp: 36.9, fc: 74 }]], [{ id: 'r1', ts: now - 4 * H, kind: 'reply', to: 'm1', choice: 'ok', text: '' }]);
    // Fiche d'urgence
    await db.put('emergency', { ...ug.blank(), id: 'u1', label: 'Léa', name: 'Léa Martin (exemple)', birth: '2018-03-12', blood: 'O+', allergies: 'pénicilline, arachide', meds: 'insuline (pompe)', conditions: 'diabète de type 1', devices: 'pompe à insuline',
      contacts: [{ n: 'Sophie Martin', r: 'mère', t: '06 00 00 00 01' }, { n: 'Marc Martin', r: 'père', t: '06 00 00 00 02' }, { n: '', t: '', r: '' }],
      trust: { n: 'Sophie Martin', r: 'mère', t: '06 00 00 00 01' }, directives: 'Sans objet (mineure)', doctor: 'Dr Dupont', doctorTel: '05 00 00 00 03', note: 'Parle français', updated: now });
  });

  // pas de bannière « données non sauvegardées » sur les captures
  await pg.evaluate(() => localStorage.setItem('lastBackup', String(Date.now() + 3600000)));

  // ---------- Captures ----------
  const shot = async (name, hash, { mode = 'patient', wait = 700, click, full = false } = {}) => {
    await pg.evaluate(m => localStorage.setItem('mode', m), mode);
    await pg.goto(BASE + hash); await pg.reload(); await pg.waitForTimeout(wait);
    if (name.startsWith('10')) { await pg.locator('input[aria-label="Texte de l’étiquette"]').fill('Chambre 12'); await pg.waitForTimeout(200); }
    if (click) { await pg.getByText(click).first().click(); await pg.waitForTimeout(500); }
    await pg.screenshot({ path: path.join(OUT, 'screens', name + '.png'), fullPage: full });
  };
  await shot('01-accueil-patient', '#/');
  await shot('02-fiche-patient', '#/p/lea');
  await shot('03-saisie', '#/p/lea/new');
  await shot('04-tableau', '#/p/lea/table');
  await shot('05-messages-reponse', '#/p/lea/messages');
  await shot('06-echange-qr', '#/p/lea/qrsync', { wait: 1000 });
  await shot('07-accueil-liberal', '#/', { mode: 'liberal' });
  await shot('08-tableau-de-suivi', '#/suivi', { mode: 'liberal', wait: 900 });
  await shot('09-seuils', '#/p/paul/seuils', { mode: 'liberal' });
  await shot('10-qr-acces-porte', '#/p/paul/acces', { mode: 'liberal', wait: 900 });
  await shot('11-fiche-urgence', '#/urgence/u1/carte', { wait: 900 });
  await shot('12-dossiers-partages', '#/dossiers');
  await shot('13-aide', '#/aide');

  // ---------- QR codes de démonstration (PNG) ----------
  const qrs = await pg.evaluate(async APP_URL => {
    const { db } = await import('./js/db.js'); const sync = await import('./js/sync.js'); const qs = await import('./js/qrsync.js'); const ug = await import('./js/urgence.js');
    const { qrSvg } = await import('./js/qr.js'); const { BUILTIN_TEMPLATES, templateFields } = await import('./js/modules.js'); const ex = await import('./js/export.js');
    const now = Date.now(), H = 3600000, svg = (t, e = 'M') => qrSvg(t, { ecc: e });
    const f = { ...ug.blank(), ...(await db.get('emergency', 'u1')) }; const urg = ug.payload(f);
    const t = BUILTIN_TEMPLATES.find(x => x.id === 'tpl-general'), fields = templateFields(t);
    const bilan = ex.qrPayloads({ id: 'x', name: 'Léa M. (exemple)' }, t, fields, [[-6, 37.8, 110], [-3, 38.6, 124], [-1, 39.1, 132]].map(([dh, temp, fc], i) => ({ id: 'b' + i, ts: now + dh * H, values: { temp, fc } })), { includeName: true });
    // dossier de démonstration « Léa M. (démo) » partagé avec le code demo2026 (appareil jetable : base propre à ce navigateur)
    const p = { id: 'demo-lea', name: 'Léa M. (démo)', service: 'Pédiatrie', templateId: 'tpl-pediatrie', created: now, updated: now };
    await db.put('patients', p); await sync.createLocalShare(p, 'Maman (démo)', 'demo2026');
    for (const [i, [dh, temp]] of [[-5, 37.9], [-2, 38.7], [-0.5, 39.2]].entries()) await db.put('entries', { id: 'd' + i, patientId: p.id, ts: now + dh * H, values: { temp } });
    const sec = (await qs.sectionCodes(p, 24)).codes[0];
    const q = { id: 'demo-tom', name: 'Tom B. (démo)', service: '', templateId: 'tpl-general', created: now, updated: now };
    await db.put('patients', q); await sync.createLocalShare(q, 'Papa (démo)', '');
    const inv = (await qs.inviteCodes(q))[0];
    return [['01-installer', svg(APP_URL), APP_URL], ['02-fiche-urgence', svg(urg, urg.length > 450 ? 'L' : 'M'), urg], ['03-bilan-patient', svg(bilan[0], 'L'), bilan[0]], ['04-section-chiffree', svg(sec), sec], ['05-invitation', svg(inv), inv]];
  }, APP_URL);
  const qpg = await ctx.newPage();
  for (const [name, svg, text] of qrs) {
    await qpg.setContent(`<body style="margin:0;background:#fff"><div id="q" style="width:640px;height:640px;padding:0;background:#fff">${svg.replace('<svg', '<svg style="width:640px;height:640px;display:block"')}</div></body>`);
    await (await qpg.$('#q')).screenshot({ path: path.join(OUT, 'qr', name + '.png') });
    fs.writeFileSync(path.join(OUT, 'qr', name + '.txt'), text + '\n');
  }
  console.log('captures:', fs.readdirSync(path.join(OUT, 'screens')).length, '| qr:', qrs.length, '| erreurs:', errs);
  await br.close();
})();
