import qrcode from '../vendor/qrcode.mjs';

// La bibliothèque encode en ISO-8859-1 par défaut : on force l'UTF-8 (accents, °, ½…)
qrcode.stringToBytes = s => Array.from(new TextEncoder().encode(s));

export function qrSvg(text, { ecc = 'L' } = {}) {
  const qr = qrcode(0, ecc);
  qr.addData(text, 'Byte');
  qr.make();
  return qr.createSvgTag({ scalable: true, margin: 4, cellSize: 4 });
}
