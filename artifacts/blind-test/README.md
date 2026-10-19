# Blind Test by DJ BLAZED

Application de blind test en direct pour les bars. Le DJ gère les manches et le classement ; les joueurs rejoignent la salle depuis leur téléphone.

## Lancer l’application

Dans Replit, lance le projet avec **Run**. Le serveur de l’application et l’API démarrent ensemble. Ouvre l’aperçu de **Blind Test by DJ BLAZED**.

## Tester une partie

1. Sur l’accueil, entre un nom de DJ puis sélectionne **Créer ma salle**.
2. Garde la régie ouverte. Pour simuler un joueur, ouvre l’adresse de l’application dans une autre fenêtre privée ou sur un second appareil, puis scanne le QR code ou entre le code de salle.
3. Choisis un pseudo côté joueur. La régie affiche les participants actifs.
4. Dans la régie, entre l’artiste et le titre qui seront joués, lance le morceau dans le logiciel DJ externe, puis démarre la manche dans l’application.
5. Le joueur envoie une seule réponse (artiste et titre) depuis son téléphone. Le serveur horodate chaque envoi et met le classement à jour.
6. Termine la manche dans la régie pour révéler le morceau, les réponses et leurs heures d’envoi. Démarre une nouvelle manche ou termine la session pour afficher le classement final.

Le premier joueur à répondre correctement reçoit 1 000 points. Les réponses correctes suivantes rapportent 100 points de moins, jusqu’au minimum de 100 points. Une réponse n’est acceptée qu’une fois par joueur et par manche.

## Stockage et fonctionnement en direct

- Les salles, les joueurs, les réponses et les scores sont stockés dans la base PostgreSQL du projet. Ils sont donc partagés entre les appareils, navigateurs, réseaux et instances de l’API, et ne disparaissent pas au redémarrage du serveur.
- L’aperçu de développement et l’application publiée utilisent des bases séparées. Pour une partie réelle, le DJ et les joueurs doivent ouvrir la même URL publiée. Le QR code reprend automatiquement l’adresse ouverte par le DJ.
- En développement, si le schéma de la base n’est pas encore installé, lance une fois `pnpm --filter @workspace/db run push`. Lors de la publication, Replit applique le schéma de développement à la base de production.
- La régie et les joueurs actualisent leur état environ chaque seconde. La liste des joueurs actifs utilise un signal de présence ; un joueur absent est retiré de cette liste après environ une minute. Son score reste au classement.
- Les salles créées avec l’ancienne version, qui ne les gardait qu’en mémoire, ne peuvent pas être récupérées après la mise à jour. Après avoir publié cette correction, crée une nouvelle salle et partage son nouveau code.
- Le DJ diffuse le son depuis son propre logiciel. L’application ne téléverse, ne stocke, ne lit ni ne diffuse de musique.
