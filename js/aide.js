// Guide d'utilisation intégré (fonctionne hors-ligne). Texte seul : le rendu est dans app.js.
// quick = guide express affiché ouvert en tête de page ; sections = rubriques repliables.
export const QUICK = {
  title: 'Suivi sans réseau : 2 scans, un seul code',
  intro: 'Le patient choisit un code. Le soignant le saisit une seule fois, puis il suffit de se scanner.',
  steps: [
    'Patient : Menu → Dossiers partagés → « 4. Sans réseau ». Choisir le patient, saisir son nom et un code (la phrase secrète), puis « Créer un partage par QR ». Donner le code au soignant de vive voix.',
    'Patient : sur « Échanger par QR », onglet « Ma section » : le QR code s’affiche, avec les dernières saisies. Il contient aussi le nom du patient et sa fiche.',
    'Soignant (1er scan) : « Recevoir par QR », cadrer le code. À la première fois seulement : indiquer son nom, son rôle et le code du patient. Le patient est ajouté avec ses saisies.',
    'Soignant (2e scan, sens inverse) : sur la fiche du patient → « ▦ Échanger par QR » → « Ma section ». Le patient le scanne : il reçoit les saisies et la demande « tout va bien ? » du soignant.',
    'Ensuite, à chaque rencontre : rien à retaper. Le patient ouvre son QR, le soignant le scanne (et inversement). Les saisies s’ajoutent, sans doublon.',
  ],
  tip: 'Le QR est recalculé à chaque ouverture : il faut l’afficher à l’écran, un QR imprimé ne se met pas à jour. Sans caméra : « Partager en texte » envoie les codes par message, « Coller le texte » les importe.',
};

export const QUICK_DRIVE = {
  title: 'Un seul QR code, puis tout par Drive',
  intro: 'Avec Internet, le soignant scanne un QR fixe une seule fois ; ensuite les mises à jour arrivent seules.',
  steps: [
    'Patient ou propriétaire : partager le dossier avec Drive (Dossiers partagés → « 3. Partager un de mes patients »), avec une phrase secrète.',
    'Fiche du patient → « 👥 Dossier partagé » → « 🚪 QR d’accès (étiquette de porte) ». Saisir un texte neutre (« Chambre 12 »), puis « Imprimer l’étiquette ». Ce QR ne change jamais.',
    'Soignant : Menu → Dossiers partagés → « Scanner… » (ou « Recevoir par QR »), cadrer l’étiquette, saisir son nom, son rôle et le code du patient (une seule fois).',
    'Le dossier s’ouvre et se synchronise. Ensuite, plus aucun scan : les saisies et messages circulent par Drive.',
  ],
  tip: 'Sans phrase secrète, le QR révèle le nom du patient et le lien du dossier à quiconque le scanne : définissez-en toujours une avant d’imprimer. Le soignant doit aussi avoir accès au dossier Drive (partage Google).',
};

export const SECTIONS = [
  { id: 'start', icon: '🚀', title: 'Démarrer', items: [
    'L’application est une PWA : elle s’installe sur l’écran d’accueil (iPhone : Safari → Partager → Sur l’écran d’accueil ; Android : Chrome → menu ⋮ → Installer l’application) et fonctionne sans réseau.',
    'Deux modes, au sommet de l’accueil : « 🧑 Patient » pour saisir son suivi, « 🩺 Corps médical » pour suivre plusieurs patients et recevoir des bilans.',
    'Vos données restent sur l’appareil. Seuls les dossiers que vous choisissez de partager (Drive ou QR) en sortent.',
    'Partout, « ‹ Retour » remonte d’un niveau et « 🏠 Menu principal » ramène à l’accueil.',
  ] },
  { id: 'saisie', icon: '✍️', title: 'Saisir un suivi', items: [
    'Accueil → « ＋ Nouveau patient » : nom ou initiales, service, modèle de fiche (Général, Pédiatrie, Maternité, Chirurgie, Gériatrie, Oncologie, Soins continus, ou une fiche à vous).',
    'Fiche du patient → « ＋ Nouvelle saisie » : la date et l’heure sont remplies, modifiables. Si la tâche a été faite plus tôt, « −15 min », « −1 h »… décalent l’heure.',
    'Chaque champ propose des valeurs fréquentes et rappelle la dernière valeur. Touchez « Enregistrer » : la saisie est conservée immédiatement.',
    'Pour corriger : touchez une saisie dans « Dernières saisies » ou le ✎ du tableau. On peut changer la valeur, l’heure, ou supprimer la saisie.',
  ] },
  { id: 'export', icon: '📄', title: 'Tableau, PDF et impression', items: [
    '« 📊 Tableau » affiche toutes les saisies dans l’ordre du temps. Choisissez la période (6 h, 12 h, 24 h, 48 h, tout) et masquez les colonnes vides.',
    '« 📄 Exporter en PDF » ou « 🖨 Imprimer » produit une feuille A4 paysage de la période choisie.',
    '« ▦ Transmettre au soignant » affiche le bilan en QR code(s) : tout lecteur de QR l’affiche en texte, sans connexion.',
  ] },
  { id: 'fiches', icon: '📋', title: 'Fiches : modèles, composition, scan papier', items: [
    '« 📋 Modèles de fiches » liste les modèles. « Composer une fiche » assemble des modules (constantes, alimentation/transit, douleur, traitements, biométrie, maternité) et vous laisse ajuster les champs.',
    '« 📷 Scanner une fiche papier » : photographiez la fiche, ajustez les 4 coins, l’application détecte le tableau et lit les intitulés (OCR local, à télécharger une fois avec du réseau, ~14 Mo). Relisez et corrigez avant d’enregistrer : la photo n’est jamais conservée.',
  ] },
  { id: 'medical', icon: '🩺', title: 'Mode corps médical', items: [
    '« 📊 Tableau de suivi des patients » : tous vos patients (dossiers partagés + bilans reçus), du plus en retard au plus à jour. 🟢 dans le délai attendu, 🟠 en retard, 🔴 grand retard (plus de 2 fois le délai) ou valeur hors seuil.',
    'Le délai attendu se règle par patient (1 à 48 h, 6 h par défaut). « 🔔 Seuils » fixe un minimum/maximum par champ numérique (par exemple T° au-dessus de 38,5). Les seuils sont propres à votre appareil.',
    '« 📥 Recevoir un bilan » scanne les QR codes d’un patient (caméra, photo ou texte collé). Un bilan en plusieurs codes se reconstitue dans n’importe quel ordre ; les doublons sont ignorés.',
  ] },
  { id: 'partage', icon: '👥', title: 'Dossiers partagés avec Google Drive', items: [
    'Un même patient pour plusieurs personnes : parents, médecin, orthophoniste… Chacun écrit uniquement dans sa propre section ; les sections des autres sont visibles en lecture seule (🔒) avec le nom de l’auteur. Personne n’écrase le travail d’un autre.',
    'Réglages une fois : votre nom et l’identifiant client Google (créé dans Google Cloud : Drive API activée, ID client OAuth « Application Web », comptes en « utilisateurs test »).',
    'Partager un patient : créez un dossier vide dans Drive, partagez-le (Éditeur pour ceux qui saisissent, Lecteur pour les autres), collez son lien dans « 3. Partager un de mes patients », ajoutez une phrase secrète.',
    'Rejoindre : « 2. Rejoindre un dossier partagé », collez le lien, choisissez votre rôle, saisissez la phrase secrète.',
    '« 🔄 Synchroniser maintenant » envoie vos saisies et récupère celles des autres. Ensuite la synchronisation est automatique (ouverture, retour du réseau, toutes les 5 min).',
    'Fiche commune (nom, service, modèle) : « ✎ Modifier la fiche commune » prend un verrou de 5 minutes ; une seule personne la modifie à la fois, les autres voient qui l’a prise.',
    'Rôles : Propriétaire et Parent (saisie + fiche commune), Soignant (saisie, demande de nouvelles), Lecture seule. Les droits réels sont ceux du partage Drive.',
  ] },
  { id: 'messages', icon: '💬', title: 'Demander des nouvelles', items: [
    'Un soignant touche « 💬 Nouvelles » : un message court part vers le dossier. Les parents voient une bannière à l’ouverture et répondent en un tap : « 👍 Ça va », « 🤔 Pas top, à surveiller » ou « 🆘 Besoin qu’on me rappelle » (mot facultatif).',
    'Garde-fous : une seule demande en attente par patient, 4 h minimum entre deux demandes, aucune demande entre 22 h et 7 h.',
    'Pas de notification sur le téléphone : le message se voit à l’ouverture de l’application. Ce n’est pas un canal d’urgence : en cas d’urgence, appelez le 15 ou le 112.',
  ] },
  { id: 'sauvegarde', icon: '💾', title: 'Sauvegarde et restauration', items: [
    'Menu → « 💾 Sauvegarde & restauration » crée un fichier .json (patients, saisies, fiches perso, bilans reçus), chiffrable par mot de passe. Rangez-le où vous voulez (Drive, Fichiers, clé USB, e-mail).',
    'Restaurer en « fusion » (par défaut, sans doublons) ou en « remplacement ». Une bannière orange rappelle de sauvegarder quand des données ont changé.',
    'Mot de passe ou phrase secrète perdus : aucune récupération possible.',
  ] },
  { id: 'securite', icon: '🔒', title: 'Confidentialité et sécurité', items: [
    'Rien n’est envoyé à un serveur, sauf les dossiers que vous partagez. Avec une phrase secrète, les fichiers Drive et les codes QR sont chiffrés de bout en bout (AES-256) : Google ne voit que des fichiers illisibles.',
    'Sans phrase secrète, les fichiers partagés sont lisibles par quiconque a accès au dossier Drive. Choisissez-en une pour toute donnée de santé, et transmettez-la par un autre canal que Drive.',
    'Purge : fiche du patient → « Sortie d’hospitalisation / purge », ou Menu → « Confidentialité & purge ».',
    'Application d’aide à la saisie : elle ne remplace pas le dossier patient officiel.',
  ] },
  { id: 'depannage', icon: '🛠️', title: 'Dépannage', items: [
    'Version pas à jour : fermez complètement l’application puis rouvrez-la ; au besoin, videz les données du site (après une sauvegarde).',
    'Caméra refusée : autorisez-la dans les réglages du navigateur, ou utilisez « Photo du QR » / « Coller le texte ».',
    '« Accès refusé » sur Drive : vous n’avez que le droit Lecteur sur le dossier ; l’application passe alors en lecture seule.',
    '« Phrase secrète incorrecte » : vérifiez les majuscules et les espaces, ou redemandez-la au propriétaire.',
    'Rien ne se synchronise : une première synchronisation manuelle est nécessaire à chaque session pour la connexion Google ; vérifiez aussi le réseau.',
    'iOS peut vider le stockage d’un site peu utilisé : installez l’application sur l’écran d’accueil et sauvegardez régulièrement.',
  ] },
];
