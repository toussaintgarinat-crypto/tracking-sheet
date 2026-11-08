// Moteur de formulaires dynamiques : génère les contrôles tactiles à partir d'une définition de champ.
import { h } from './dom.js';

const dec = step => { const s = String(step || 1); return s.includes('.') ? s.split('.')[1].length : 0; };
const parse = s => { const n = parseFloat(String(s).replace(',', '.')); return Number.isNaN(n) ? null : n; };

function numberInput(f, value, set, last, initial) {
  const d = dec(f.step);
  const step = f.step || 1;
  const input = h('input', {
    type: 'text', inputmode: d ? 'decimal' : 'numeric', value: value ?? '',
    placeholder: f.unit || '', 'aria-label': f.label, autocomplete: 'off',
  });
  const apply = n => { set(n); };
  input.addEventListener('input', () => apply(parse(input.value)));
  const put = n => { n = +n.toFixed(d); input.value = n; apply(n); };
  const bump = dir => {
    const cur = parse(input.value);
    if (cur == null) put(initial ?? last ?? f.def ?? 0);
    else put(cur + dir * step);
  };
  const quick = [...(f.quick || [])];
  if (last != null && !quick.includes(last)) quick.unshift(last);
  const chips = quick.map(q => h('button', { type: 'button', class: 'chip' + (q === last ? ' last' : ''), title: q === last ? 'Dernière valeur' : '', onclick: () => put(q) }, String(q)));
  const stepper = h('div', { class: 'stepper' },
    h('button', { type: 'button', class: 'step', 'aria-label': 'Moins', onclick: () => bump(-1) }, '−'),
    input,
    h('button', { type: 'button', class: 'step', 'aria-label': 'Plus', onclick: () => bump(1) }, '+'),
    f.unit ? h('span', { class: 'unit' }, f.unit) : null);
  return h('div', { class: 'num' }, stepper, chips.length ? h('div', { class: 'chips' }, chips) : null);
}

function bpInput(f, value, set, last) {
  const [s0, d0] = String(value || '').split('/').map(parse);
  const st = { s: s0 ?? null, d: d0 ?? null };
  const emit = () => set(st.s != null && st.d != null ? `${st.s}/${st.d}` : (st.s != null ? String(st.s) : null));
  const [ls, ld] = String(last || '').split('/').map(parse);
  const mk = (k, label, def, lastv, quick) => h('div', { class: 'bp-part' }, h('small', {}, label),
    numberInput({ ...f, label, unit: '', step: 1, quick }, st[k], v => { st[k] = v; emit(); }, lastv, def));
  return h('div', { class: 'bp' },
    mk('s', 'Systolique', f.def?.[0] ?? 120, ls, [100, 110, 120, 130, 140]),
    h('span', { class: 'slash' }, '/'),
    mk('d', 'Diastolique', f.def?.[1] ?? 80, ld, [60, 70, 80, 90]),
    h('span', { class: 'unit' }, f.unit));
}

function choiceInput(f, value, set) {
  const btns = f.options.map(o => h('button', {
    type: 'button', class: 'opt' + (value === o ? ' on' : ''), 'aria-pressed': value === o,
    onclick: e => {
      const on = btns.find(b => b.classList.contains('on'));
      const was = e.currentTarget.classList.contains('on');
      btns.forEach(b => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); });
      if (!was) { e.currentTarget.classList.add('on'); e.currentTarget.setAttribute('aria-pressed', 'true'); set(o); } else set(null);
      void on;
    },
  }, o));
  return h('div', { class: 'opts' }, btns);
}

function multiInput(f, value, set) {
  // anciennes saisies (choix unique) : une chaîne devient une liste d'un élément
  const cur = new Set(Array.isArray(value) ? value : value ? [value] : []);
  const btns = f.options.map(o => h('button', {
    type: 'button', 'data-opt': o, class: 'opt' + (cur.has(o) ? ' on' : ''), 'aria-pressed': String(cur.has(o)),
    onclick: () => {
      if (cur.has(o)) cur.delete(o);
      else {
        // « Aucune » (f.exclusive) exclut les autres choix, et inversement
        if (f.exclusive) { if (o === f.exclusive) cur.clear(); else cur.delete(f.exclusive); }
        cur.add(o);
      }
      for (const b of btns) { const on = cur.has(b.dataset.opt); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }
      set(cur.size ? [...cur] : null);
    },
  }, o));
  return h('div', { class: 'opts' }, btns);
}

function scaleInput(f, value, set) {
  const max = f.max ?? 10;
  const btns = [];
  for (let i = 0; i <= max; i++) {
    const hue = 120 - (i / max) * 120; // vert -> rouge
    btns.push(h('button', {
      type: 'button', class: 'sc' + (value === i ? ' on' : ''), style: `--hue:${hue}`, 'aria-pressed': value === i,
      onclick: e => {
        const was = e.currentTarget.classList.contains('on');
        btns.forEach(b => b.classList.remove('on'));
        if (!was) { e.currentTarget.classList.add('on'); set(i); } else set(null);
      },
    }, String(i)));
  }
  return h('div', { class: 'scale' }, btns);
}

function boolInput(f, value, set) {
  return choiceInput({ ...f, options: ['Oui', 'Non'] }, value === true ? 'Oui' : value === false ? 'Non' : null, v => set(v == null ? null : v === 'Oui'));
}

function textInput(f, value, set) {
  const input = h('input', { type: 'text', value: value ?? '', placeholder: f.label, 'aria-label': f.label, autocomplete: 'off' });
  input.addEventListener('input', () => set(input.value.trim() || null));
  return input;
}

// Construit le contrôle d'un champ. ctx = { last: valeur précédente }
export function fieldInput(f, value, set, last) {
  switch (f.type) {
    case 'number': return numberInput(f, value, set, last);
    case 'bp': return bpInput(f, value, set, last);
    case 'choice': return choiceInput(f, value, set);
    case 'multi': return multiInput(f, value, set);
    case 'scale': return scaleInput(f, value, set);
    case 'bool': return boolInput(f, value, set);
    default: return textInput(f, value, set);
  }
}

// Formulaire complet d'un modèle (champs groupés par module)
export function buildForm(fields, values, lastValues, onChange) {
  const root = h('div', { class: 'form' });
  let group, box;
  for (const f of fields) {
    if (f.group !== group || !box) {
      group = f.group;
      box = h('section', { class: 'group' }, group ? h('h3', {}, group) : null);
      root.append(box);
    }
    const set = v => { if (v == null || v === '') delete values[f.key]; else values[f.key] = v; onChange?.(); };
    box.append(h('div', { class: 'field' },
      h('label', {}, f.label, f.unit && f.type !== 'number' && f.type !== 'bp' ? ` (${f.unit})` : ''),
      f.hint ? h('small', { class: 'hint' }, f.hint) : null,
      fieldInput(f, values[f.key], set, lastValues[f.key])));
  }
  return root;
}

// ---------- Éditeur de champs (composition de fiche / relecture du scan) ----------
export const TYPE_LABELS = {
  number: 'Nombre', bp: 'Tension (sys/dia)', choice: 'Choix unique', multi: 'Choix multiples',
  scale: 'Échelle 0-10', bool: 'Oui / Non', text: 'Texte libre',
};

export function fieldsEditor(fields, onChange) {
  const root = h('div', { class: 'fed' });
  const render = () => {
    root.replaceChildren();
    fields.forEach((f, i) => {
      const row = h('div', { class: 'fed-row' });
      const label = h('input', { type: 'text', value: f.label, 'aria-label': 'Intitulé de la colonne', onchange: e => { f.label = e.target.value.trim() || f.label; f.short = f.label.slice(0, 8); onChange?.(); } });
      const type = h('select', { 'aria-label': 'Type', onchange: e => { f.type = e.target.value; if (needsOptions(f) && !f.options) f.options = ['Oui', 'Non']; if (f.type === 'scale') f.max = f.max || 10; onChange?.(); render(); } },
        Object.entries(TYPE_LABELS).map(([k, v]) => h('option', { value: k, selected: k === f.type }, v)));
      const unit = h('input', { type: 'text', class: 'small', placeholder: 'Unité', value: f.unit || '', 'aria-label': 'Unité', onchange: e => { f.unit = e.target.value.trim() || undefined; onChange?.(); } });
      const extra = needsOptions(f)
        ? h('input', { type: 'text', placeholder: 'Options séparées par des virgules', value: (f.options || []).join(', '), 'aria-label': 'Options', onchange: e => { f.options = e.target.value.split(',').map(s => s.trim()).filter(Boolean); onChange?.(); } })
        : null;
      row.append(
        h('div', { class: 'fed-main' }, label, type, f.type === 'number' || f.type === 'bp' ? unit : null),
        extra,
        h('div', { class: 'fed-btns' },
          h('button', { type: 'button', class: 'mini', 'aria-label': 'Monter', disabled: i === 0, onclick: () => { [fields[i - 1], fields[i]] = [fields[i], fields[i - 1]]; onChange?.(); render(); } }, '↑'),
          h('button', { type: 'button', class: 'mini', 'aria-label': 'Descendre', disabled: i === fields.length - 1, onclick: () => { [fields[i + 1], fields[i]] = [fields[i], fields[i + 1]]; onChange?.(); render(); } }, '↓'),
          h('button', { type: 'button', class: 'mini danger', 'aria-label': 'Supprimer', onclick: () => { fields.splice(i, 1); onChange?.(); render(); } }, '✕')));
      root.append(row);
    });
    root.append(h('button', { type: 'button', class: 'btn secondary', onclick: () => { fields.push(newField('Nouveau champ')); onChange?.(); render(); } }, '+ Ajouter un champ'));
  };
  render();
  root.refresh = render;
  return root;
}

const needsOptions = f => f.type === 'choice' || f.type === 'multi';

export function newField(label, type = 'text') {
  return { key: 'f_' + Math.random().toString(36).slice(2, 8), short: label.slice(0, 8), label, type };
}
