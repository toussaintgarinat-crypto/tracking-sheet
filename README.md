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

## Trois modes : patient, libéral, hôpital

Sélecteur en haut de l'accueil (mémorisé sur l'appareil).

- **Patient** : saisie, tableau, PDF, et **Transmettre au soignant** (QR codes du bilan).
- **Libéral** : accueil du professionnel de cabinet : bannière « patients à regarder », tableau de suivi, suivre un patient par QR, dossiers partagés (Drive ou QR).
- **Hôpital (corps médical)** : **Recevoir un bilan** scanne les QR avec la caméra (ou « Photo du QR », ou « Coller le texte »).
  Un bilan en plusieurs codes se reconstitue dans n'importe quel ordre ; les doublons sont ignorés ; les bilans
  reçus sont conservés sur l'appareil du soignant (liste, tableau, PDF, suppression). Un bilan sans nom n'est
  jamais fusionné avec un autre. Lecteur QR : `vendor/jsQR.js`, hors-ligne.

## Sauvegarde et restauration

Écran **Sauvegarde & restauration** : crée un fichier `.json` (patients, saisies, fiches perso, bilans reçus),
chiffrable par mot de passe (AES-GCM 256, clé PBKDF2-SHA256 250 000 itérations ; mot de passe non récupérable).
Le fichier est remis à la feuille de partage du système (Drive, Fichiers/iCloud, clé USB, e-mail…) ou téléchargé.
La restauration relit ce fichier, en mode **fusion** (par défaut, sans doublons) ou **remplacement**.
Une bannière rappelle de sauvegarder quand des données ont changé depuis la dernière sauvegarde.
Aucun envoi automatique vers un cloud tiers (RGPD) : c'est l'utilisateur qui choisit où ranger le fichier.

## Dossiers partagés (Google Drive)

Écran **Dossiers partagés** : un même patient partagé entre plusieurs personnes (parents, médecin, orthophoniste…).

- **Une section par auteur** : chaque membre n'écrit que dans son fichier `m-<id>.json` du dossier Drive ; les autres
  le voient en lecture seule (🔒, avec le nom de l'auteur). Aucun conflit d'écriture, tout le monde travaille en parallèle.
- **Pièces communes** (nom, service, modèle de fiche) : `dossier.json` protégé par un **verrou d'édition** de 5 min
  (`lock.json`) : une seule personne les modifie à la fois. Le verrou est « au mieux » (Drive n'offre pas d'écriture atomique).
- **Rôles** : Propriétaire, Parent (saisie + fiche commune), Soignant (saisie), Lecture seule. Les droits réels sont ceux
  du partage Drive (Éditeur/Lecteur) : si l'écriture est refusée, l'app passe en lecture seule.
- **Mise en route** : créer un ID client OAuth « Application Web » dans Google Cloud (Drive API activée), le coller dans
  l'écran ; créer un dossier Drive, le partager avec les membres, coller son lien. Portée `drive` (la portée `drive.file`
  ne voit pas les fichiers créés par les autres membres) ; en mode test Google, ajouter les comptes en « utilisateurs test ».
- **Synchronisation manuelle** (bouton) ; fonctionne hors-ligne en local, se synchronise ensuite. Fichiers JSON **non chiffrés** dans le Drive.
- **Évolution PostgreSQL** : `js/sync.js` ne parle qu'à un fournisseur `{list, read, write}` (`js/drive.js`) ; une API
  PostgreSQL implémente la même interface sans toucher au reste.

### Tableau de suivi et messagerie (corps médical)

- **Tableau de suivi** (`#/suivi`) : tous les patients (dossiers partagés + bilans reçus) triés du plus en retard au plus à jour.
  Voyant selon le **retard de saisie** : 🟢 dans le délai attendu, 🟠 au-delà, 🔴 au-delà de 2× ; délai réglable par patient (1 à 48 h, 6 h par défaut).
- **« Tout va bien ? »** : tout soignant du dossier peut demander des nouvelles ; la personne répond en un tap
  (👍 / 🤔 / 🆘). Garde-fous : une demande en attente à la fois, 4 h minimum entre deux demandes, rien entre 22 h et 7 h.
  Pas de notification push (sans serveur) : le message s'affiche à l'ouverture de l'app. Pas un canal d'urgence (15 / 112).

- **Seuils d'alerte** (`#/p/<id>/seuils`) : min/max par champ numérique, réglés sur l'appareil du soignant ; une valeur hors seuil passe le patient en 🔴.
- **Synchronisation automatique** : au retour sur l'app, au retour du réseau, après une saisie et toutes les 5 min, dès qu'une
  première synchronisation manuelle a donné un jeton Google valide (conservé pour la session de l'onglet seulement).
- **Chiffrement de bout en bout** (phrase secrète du dossier, AES-GCM 256 + PBKDF2) : Google Drive ne voit que des fichiers illisibles.
  La phrase se transmet hors Drive ; perdue, les données sont irrécupérables.

### Échange sans réseau par QR code

Quand il n'y a pas d'Internet, les dossiers partagés se synchronisent **en se scannant** (`js/qrsync.js`) : même principe que Drive,
chacun montre SA section (saisies + messages), l'autre appareil la range en lecture seule.

- **Partage sans Drive** : Dossiers partagés → « 4. Sans réseau » (nom + phrase secrète facultative), puis **Échanger par QR**.
- **Deux scans, un seul code** : le QR « Ma section » est autonome (nom du patient, fiche, sel de chiffrement). Un soignant qui ne connaît pas encore
  le patient le scanne, saisit **une seule fois** son nom, son rôle et le code choisi par le patient (mémorisé sur l'appareil) ; ensuite il suffit de
  se scanner (2e scan en sens inverse pour renvoyer ses saisies / la demande de nouvelles). Le QR est recalculé à l'affichage : un QR imprimé ne se met pas à jour.
- **Invitation** (facultative, onglet « Invitation ») : l'autre appareil la scanne, choisit son nom et son rôle, saisit la phrase secrète.
- **Ma section** : période 6 h → Tout. Les saisies reçues s'ajoutent aux précédentes (sans doublon) ; deux appareils qui se
  scannent mutuellement sont à jour. Plusieurs codes : défilement automatique, ordre de scan libre, doublons ignorés.
- Contenu compressé puis chiffré (AES-GCM) si le dossier a une phrase secrète. Repli : partager/coller les codes en texte.
- Compatible avec Drive : un dossier peut recevoir des sections par QR **et** par Drive (Drive prime pour un même membre).
- Limite : l'invitation n'est pas chiffrée (elle contient le nom du patient) : à montrer en personne.

### QR d'accès Drive (étiquette de porte)

Fiche patient → Dossier partagé → **🚪 QR d'accès** : un QR **fixe** (lien du dossier Drive + identité du patient, chiffré par la phrase secrète),
imprimable pour la porte d'une chambre (texte d'étiquette neutre, sans nom de patient). Le soignant le scanne **une seule fois** (nom, rôle, code du
patient), puis les mises à jour passent par Drive sans autre scan. Sans phrase secrète, le QR n'est que compressé (pas protégé) : l'écran l'indique.
L'accès réel reste contrôlé par le partage Google Drive.

## Fiche d'urgence (QR portefeuille)

Menu → **🆘 Ma fiche d'urgence** (`js/urgence.js`) : informations vitales (identité, groupe sanguin, allergies, traitements, antécédents, dispositifs,
personnes à prévenir, personne de confiance, directives anticipées, médecin) dans un QR code en **texte lisible par tout lecteur**, sans app ni réseau. Plusieurs fiches possibles (proches).
Impression : carte format portefeuille (85,6 × 54 mm) + fiche complète à afficher chez soi. **Volontairement non chiffré** (il doit rester lisible en
urgence) : seul l'essentiel y figure (limite 900 octets). Stockée localement, incluse dans la sauvegarde. En mode soignant, « Recevoir un bilan » la reconnaît et l'affiche.

## Aide intégrée

Menu → **❓ Aide & guide d'utilisation** (`#/aide`, `js/aide.js`) : guide express « Partage sans réseau en 5 étapes » puis rubriques
(démarrer, saisie, export, fiches, corps médical, Drive, messages, sauvegarde, sécurité, dépannage). Hors-ligne, imprimable.

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

`qrcode-generator` (MIT), `jsQR` (Apache-2.0), `tesseract.js` et `tesseract.js-core` (Apache-2.0), données de langue française Tesseract (Apache-2.0).
