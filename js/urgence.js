// Fiche d'urgence : informations vitales dans un QR code en TEXTE LISIBLE par n'importe quel lecteur (caméra du téléphone),
// sans application ni réseau, pour un accident. Volontairement NON chiffré : en urgence, personne ne connaît de code.
export const BLOODS = ['', 'O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'Inconnu'];
export const MAX_BYTES = 900; // au-delà, le QR devient trop dense pour une carte de portefeuille

export const blank = () => ({ id: '', label: '', name: '', birth: '', blood: '', allergies: '', meds: '', conditions: '', devices: '',
  contacts: [{ n: '', t: '', r: '' }, { n: '', t: '', r: '' }, { n: '', t: '', r: '' }], doctor: '', doctorTel: '', trust: { n: '', t: '', r: '' }, directives: '', note: '' });

const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const fmtBirth = b => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : clean(b); };

// Lignes du texte du QR (même texte affiché sur la carte)
export function lines(f) {
  const out = [];
  const add = (k, v) => { v = clean(v); if (v) out.push(`${k}: ${v}`); };
  out.push(`URGENCE MEDICALE - ${clean(f.name) || 'Nom non renseigné'}`);
  add('Né(e) le', fmtBirth(f.birth)); add('Groupe sanguin', f.blood);
  add('ALLERGIES', f.allergies); add('TRAITEMENTS', f.meds); add('ANTECEDENTS', f.conditions); add('DISPOSITIFS', f.devices);
  const cs = f.contacts.filter(c => clean(c.n) || clean(c.t)).map(c => [clean(c.n), clean(c.r) && `(${clean(c.r)})`, clean(c.t)].filter(Boolean).join(' '));
  if (cs.length) out.push('A PREVENIR: ' + cs.join(' ; '));
  const tr = f.trust || {}; if (clean(tr.n) || clean(tr.t)) out.push('PERSONNE DE CONFIANCE: ' + [clean(tr.n), clean(tr.r) && `(${clean(tr.r)})`, clean(tr.t)].filter(Boolean).join(' '));
  add('DIRECTIVES ANTICIPEES', f.directives);
  add('Medecin', [clean(f.doctor), clean(f.doctorTel)].filter(Boolean).join(' ')); add('Note', f.note);
  return out;
}
export const payload = f => lines(f).join('\n');
export const bytes = f => new TextEncoder().encode(payload(f)).length;
export const isEmergency = text => /^URGENCE MEDICALE/.test(String(text).trim());
