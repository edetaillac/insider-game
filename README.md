# insider-game

## Setup

Prérequis : Node 22 ou plus.

```
npm ci
npm run dev        # rechargement à chaud (node --watch)
npm start          # production
npm test
npm run typecheck
npm run lint
```

Ou avec Docker :

```
docker compose up -d
```

L'application répond sur le port 8080 par défaut. Les joueurs ouvrent l'adresse de la machine qui héberge le serveur sur leur téléphone (même réseau ou tunnel), tapent leur prénom et rejoignent. Le premier arrivé est l'hôte : il lance la partie, peut retirer un joueur et relancer une manche.

Variables d'environnement :

- `PORT` : port d'écoute (8080)
- `MIN_PLAYERS` : joueurs minimum pour lancer (4, mettre 2 pour tester seul avec deux navigateurs)
- `TRAITOR_OPTIONAL` : variante "il n'y a pas de Traître" (`true`, mettre `false` pour la désactiver)
- `TIMER_MS` : durée du sablier en millisecondes (300000)
- `WORDS_FILE` : liste de mots, un par ligne (`words/famille.csv`)

L'état de la partie et les identités sont en mémoire : un redémarrage du serveur renvoie tout le monde à l'écran d'accueil.

## Jouer

Une manche sur téléphone se déroule ainsi :

1. Chacun ouvre l'adresse, tape son prénom, rejoint. Le premier arrivé est l'hôte et lance la partie quand tout le monde est là
2. Chacun découvre son rôle en retournant sa carte, qui se recache seule. Le Maître du jeu est annoncé à tous, il choisit le mot ou en tire un au hasard
3. Tout le monde retourne la même carte "Le mot" en même temps : le Maître et le Traître y lisent le mot, les Citoyens une phrase neutre. La carte se recache après cinq secondes pour tous, rien ne trahit qui a vraiment lu
4. Le Maître ou l'hôte lance le chrono de cinq minutes. Questions fermées, réponses oui, non, je ne sais pas. Si le temps s'écoule, tout le monde perd
5. Quand le mot est trouvé, le Maître désigne le trouveur. Discussion, puis premier vote : le trouveur est-il le Traître ? Majorité stricte, la partie s'arrête si elle est atteinte
6. Sinon second vote : qui est le Traître ? Le plus pointé révèle son rôle, le trouveur départage une égalité. Avec la variante, on peut pointer "Pas de Traître"

Règles détaillées et décisions de gameplay : `docs/adr/0001-regles-du-jeu.md`.

## Développement

Le moteur de jeu pur vit dans `src/engine/` (`createGame`, `apply`, `view`). `src/server/` l'adapte au transport socket.io, `public/js/` est le client sans framework. Un seul événement `state` porte tout ce qu'un joueur a le droit de voir.

- Règles implémentées : `docs/adr/0001-regles-du-jeu.md`
- Conception du moteur : `docs/specs/2026-09-17-moteur-de-jeu-design.md`
- Conception du branchement : `docs/specs/2026-09-17-branchement-design.md`
- Décisions d'architecture : `docs/comite-2026-09-17-architecture-cible.md`
- Checklist avant une partie sur téléphone : `docs/checklist-mobile.md`
- Audit initial : `docs/audit-2026-09-17.md`

## Screenshots of Insider Game

![Alt text](/screenshots/01-welcome.png?raw=true "Welcome screen")
![Alt text](/screenshots/02-waiting.png?raw=true "Waiting screen")
![Alt text](/screenshots/03-role.png?raw=true "Role random affectation screen")
![Alt text](/screenshots/04-word.png?raw=true "Word choice screen")
![Alt text](/screenshots/05-reveal-word.png?raw=true "About to reveal word screen")
![Alt text](/screenshots/06-word-revealed.png?raw=true "Word revealed screen")
![Alt text](/screenshots/07-starting-game.png?raw=true "About to start the game screen")
![Alt text](/screenshots/08-game-started.png?raw=true "Game in progress screen")
![Alt text](/screenshots/09-found-word.png?raw=true "Found word screen")
![Alt text](/screenshots/10-vote1.png?raw=true "Vote 1 screen")
![Alt text](/screenshots/11-vote1-result.png?raw=true "Vote 1 results screen")
![Alt text](/screenshots/12-vote2.png?raw=true "Vote 2 screen")
![Alt text](/screenshots/13-result.png?raw=true "Final results screen")
![Alt text](/screenshots/14-admin.png?raw=true "Admin screen")

## Techno

- Node 22, ESM
- Express 5 (coquille et statiques)
- Socket.io 4
- Client vanilla, Bootstrap 4