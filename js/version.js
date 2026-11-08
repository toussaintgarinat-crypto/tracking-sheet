// Numéro de version affiché dans l'application + notes « Nouveautés » pour les utilisateurs.
// À chaque publication : ajouter une entrée EN TÊTE de NEWS, mettre VERSION à jour,
// et incrémenter VERSION dans sw.js (pour que les appareils récupèrent la nouvelle version).
export const VERSION = '1.6';

export const NEWS = [
  {
    v: '1.6', date: '2026-11-08', title: 'Maternité : selles multiples et courbe de poids',
    items: [
      '👶 Selles bébé : on peut maintenant choisir plusieurs types sur une même saisie (« Aucune » s’efface dès qu’on en choisit un autre). Les anciennes saisies restent lisibles.',
      '📈 Courbe du poids : sur la fiche d’un patient, le bouton « Courbe du poids » trace l’évolution des poids saisis (poids du bébé en grammes), avec l’écart depuis le premier poids, un point à toucher pour voir le détail et un tableau des valeurs.',
      '🗑 Sortie d’hospitalisation : le libellé « purge » devient « suppression », plus clair.',
    ],
    tip: 'La courbe apparaît dès qu’un poids a été saisi sur une fiche qui contient « Poids bébé » (ex. Maternité / Néonatologie).',
  },
  {
    v: '1.5', date: '2026-11-08', title: 'Correctif : plus d’écran vide au lancement',
    items: [
      '🛠 Sur certains téléphones, l’application pouvait rester sur un écran vide au lancement (une ancienne version ouverte dans un autre onglet bloquait les données). Elle affiche désormais un message clair avec un bouton « Réessayer », au lieu de rester muette.',
      '🔒 Vos données ne sont jamais effacées par ce problème.',
    ],
  },
  {
    v: '1.4', date: '2026-11-07', title: 'Une recherche d’établissement plus tolérante',
    items: [
      '🔎 La recherche comprend mieux les noms usuels : « Hôpital », « Centre hospitalier », « Saint »… n’empêchent plus de trouver l’établissement, même quand l’annuaire officiel écrit « HOP », « CH » ou « ST ».',
      '➕ « Mon établissement n’apparaît pas ? » : vous pouvez maintenant ajouter à la main un établissement absent de l’annuaire, avec le nom que vos équipes utilisent.',
    ],
  },
  {
    v: '1.3', date: '2026-11-07', title: 'Noms usuels des hôpitaux',
    items: [
      '🔎 Dans « Trouver mon établissement », on peut maintenant chercher un hôpital par le nom que les équipes utilisent (par exemple « Paule de Viguier »), même quand l’annuaire officiel le regroupe sous un autre nom.',
    ],
  },
  {
    v: '1.2', date: '2026-11-07', title: 'Mises à jour plus simples',
    items: [
      '🔄 Quand une nouvelle version est disponible, un bandeau « Nouvelle version disponible » apparaît en bas de l’écran : un tap suffit pour la prendre, sans fermer l’application ni passer par Safari.',
      '⚡ La vérification se fait toute seule à chaque retour dans l’application (avec du réseau). Vos données ne sont jamais touchées.',
    ],
  },
  {
    v: '1.1', date: '2026-11-07', title: 'Une fiche pour chaque hôpital',
    items: [
      '🏥 Fiches par établissement : chaque hôpital ou institut peut avoir ses propres fiches, pour que les équipes retrouvent celle qu’elles connaissent. Les fiches sont rangées par établissement.',
      '🔎 Trouver mon établissement : annuaire national (FINESS) de tous les hôpitaux, cliniques, centres de santé, EHPAD et structures médico-sociales. Recherche par code postal ou par région, filtre par type de structure.',
      '📚 Bibliothèque commune : des fiches prêtes à l’emploi par établissement. Seul l’établissement choisi est téléchargé, pour rester rapide, puis il fonctionne sans réseau.',
      '🆕 Nouveau patient : un menu « Établissement » n’affiche que les fiches de l’établissement choisi.',
      '✨ Numéro de version et cette page « Nouveautés ».',
    ],
    tip: 'Pour commencer : Menu → Modèles de fiches → « 🔎 Trouver mon établissement ».',
  },
  {
    v: '1.0', date: '2026-11-05', title: 'Première version complète',
    items: [
      '📋 Suivi hors-ligne : constantes, douleur, transit, traitements, maternité, avec tableau et export PDF.',
      '📷 Scan d’une fiche papier pour en faire une fiche numérique.',
      '▦ Échange par QR code, sans réseau, et dossiers partagés Google Drive chiffrés.',
      '🩺 Mode libéral, tableau de suivi, seuils d’alerte et demande de nouvelles.',
      '🆘 Fiche d’urgence (QR portefeuille), sauvegarde chiffrée, aide intégrée.',
    ],
  },
];

const KEY = 'seen-version';
export const hasUnseenNews = () => { try { return localStorage.getItem(KEY) !== VERSION; } catch { return false; } };
export const markNewsSeen = () => { try { localStorage.setItem(KEY, VERSION); } catch { /* stockage indisponible */ } };
