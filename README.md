# Suivi hospitalier hors-ligne (PWA)

Application web progressive de suivi hospitalier (constantes, transit, douleur, traitements, maternité…),
**100 % hors-ligne** et **sans serveur** : toutes les données restent dans le navigateur (IndexedDB).

## Lancer

Aucune étape de build. Servir le dossier en HTTP(S) (le service worker exige `localhost` ou HTTPS) :

```bash
python3 -m http.server 8123   # puis ouvrir http://localhost:8123
```

Au premier chargement, le service worker met l'app en cache ; l'écran « Scanner » télécharge aussi l'OCR
(~14 Mo) pour qu'il fonctionne ensuite sans réseau. Installable sur iOS (Safari → Partager → Sur l'écran
d'accueil) et Android (Chrome).

## Fonctionnalités par phase

| Phase | Contenu | Code |
|---|---|---|
| 1 – Moteur & PWA | Formulaires dynamiques (nombre, tension, choix, échelle 0-10, oui/non, texte), horodatage auto modifiable, valeurs fréquentes + dernière valeur, sauvegarde immédiate, multi-patients, purge, service worker offline-first | `js/engine.js`, `js/db.js`, `sw.js` |
| 2 – Scan de fiche | Photo → recadrage 4 coins + redressement de perspective, correction d'inclinaison, contraste, détection du tableau (lignes/colonnes), OCR local des intitulés (Tesseract.js, français), inférence du type de saisie, écran de relecture éditable | `js/scan.js` |
| 3 – Modèles | 6 modules (constantes, alimentation/transit, douleur, traitements, biométrie, maternité) ; 7 modèles : Général, Pédiatrie, Maternité/Néonat., Chirurgie, Gériatrie, Oncologie, Soins continus ; composition libre | `js/modules.js` |
| 4 – QR & export | QR « data-embedded » (JSON compact UTF-8, découpé en plusieurs codes autonomes, période 6/12/24/48 h ou tout), tableau chronologique, impression / PDF (A4 paysage) | `js/export.js`, `js/qr.js` |

## Format du QR code

Chaque code est un JSON autonome lisible par n'importe quel lecteur :

```json
{"v":1,"p":"Léa M.","f":"Pédiatrie","g":"2026-11-04 11:12","n":"1/2",
 "k":{"T°":"Température (°C)","FC":"Fréquence cardiaque (bpm)"},
 "r":[{"d":"04/11 11:12","T°":38,"FC":100}]}
```

`p` patient (désactivable), `f` fiche, `g` génération, `n` n° de code, `k` légende des abréviations, `r` saisies.

## Limites connues

- Le redressement part d'une estimation des 4 coins, à ajuster à la main ; la détection de grille suppose un tableau
  à traits continus. Les cases vides ou les en-têtes manuscrits peuvent donner un OCR approximatif : l'écran de
  relecture sert à corriger intitulés et types avant création de la fiche.
- Les photos ne sont jamais conservées : seule la structure (intitulés/types) est enregistrée.
- L'export PDF passe par la boîte d'impression du navigateur (« Enregistrer au format PDF »).
- iOS peut purger le stockage d'un site peu utilisé : installer l'app sur l'écran d'accueil réduit ce risque.
- Application d'aide à la saisie : ne remplace pas le dossier patient officiel.

## Licences tierces (dossier `vendor/`)

`qrcode-generator` (MIT), `tesseract.js` et `tesseract.js-core` (Apache-2.0), données de langue française Tesseract (Apache-2.0).
