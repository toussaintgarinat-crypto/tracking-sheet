# Suivi partagé en cabinet libéral : fiche d'une page

**But.** Un professionnel de santé libéral (kiné, orthophoniste, infirmier, médecin…) suit ses patients entre les séances ;
le patient (ou ses parents) saisit son suivi, le professionnel voit tout dans un tableau. Sans serveur à installer.

## Parcours
1. **Le professionnel** crée un dossier vide dans Google Drive (un par patient), le partage au patient (Éditeur) et, au besoin,
   à un confrère (Lecteur ou Éditeur).
2. **L'application** (Menu → Dossiers partagés) : le professionnel partage le patient avec le lien du dossier et une phrase secrète.
3. **Le patient** ouvre l'application, choisit « Rejoindre un dossier partagé », colle le lien, saisit la phrase secrète
   (donnée de vive voix) et choisit son rôle.
4. **Au quotidien** : le patient saisit ; les données se synchronisent seules. Le professionnel suit le **tableau de suivi**
   (retards de saisie 🟢🟠🔴, seuils d'alerte) et envoie une demande « tout va bien ? » (réponse en un tap, 4 h minimum entre deux demandes).
5. **Sans réseau** : échange par QR code (voir « Aide » dans l'application).

## Prérequis
- Un compte Google pour chaque personne ; l'identifiant client Google de l'application (créé une fois, comptes de test ajoutés).
- Une phrase secrète par dossier, transmise hors Drive. Perdue, elle ne se récupère pas.
- Une connexion à chaque synchronisation (4G/5G suffit).

## Consentement et information du patient (à adapter avec votre DPO / votre ordre)
- Expliquer au patient quelles données sont saisies, où elles sont stockées, qui y a accès, comment arrêter (« Quitter ce dossier »).
- Recueillir son accord ; ne pas faire de l'application le dossier officiel : elle ne remplace pas le dossier patient ni Mon espace santé.

## Données de santé : hébergement
- Google Drive n'est **pas** un hébergeur certifié HDS. Le chiffrement avec phrase secrète (AES-256) rend les fichiers illisibles
  pour Google, mais ne règle pas forcément la question juridique. À valider avec la CNIL, votre ordre ou un DPO.
- **Phase de test** : données fictives ou patients consentants, quelques comptes.
- **Déploiement réel** : serveur PostgreSQL chez un hébergeur certifié HDS (l'application est prête : `js/sync.js` accepte un autre fournisseur de stockage).

## Limites actuelles
- Mode test Google : quelques dizaines de comptes ajoutés à la main ; au-delà, vérification de l'application par Google.
- Pas de notification sur le téléphone : une demande de nouvelles se voit à l'ouverture de l'application.
- Une première connexion Google est nécessaire à chaque session (accès valable environ 1 h).

## Check-list de test (2 téléphones)
- [ ] Le patient saisit une température ; le professionnel la voit après synchronisation.
- [ ] Un seuil dépassé passe le patient en 🔴 dans le tableau de suivi.
- [ ] Le professionnel envoie « Nouvelles » ; le patient voit la bannière et répond en un tap.
- [ ] Un compte en Lecteur ne peut pas saisir.
- [ ] Une mauvaise phrase secrète est refusée.
- [ ] Hors réseau : l'échange par QR code fonctionne dans les deux sens.
