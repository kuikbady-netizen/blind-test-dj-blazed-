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

## Limites de ce prototype

- Les sessions actives sont gardées en mémoire par le serveur : elles sont partagées entre les appareils, mais disparaissent si le serveur redémarre.
- Les joueurs actifs sont détectés par un signal de présence périodique ; un joueur absent est retiré de la liste après environ une minute.
- Le DJ diffuse le son depuis son propre logiciel. L’application ne téléverse, ne stocke, ne lit ni ne diffuse de musique.
