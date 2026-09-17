# insider-game

## Setup

Prérequis : Node 22 ou plus.

```
npm ci
npm run dev        # rechargement à chaud (node --watch)
npm start          # production
npm run lint
```

Ou avec Docker :

```
docker compose up -d
```

L'application répond sur le port 8080 par défaut (`localhost:8080`).

Variables d'environnement :

- `PORT` : port d'écoute (défaut 8080)
- `SESSION_SECRET` : secret des sessions. Sans valeur, un secret aléatoire est généré au démarrage et les sessions sont perdues au redémarrage, ce qui est acceptable puisque l'état de la partie est en mémoire

Le jeu est pensé pour être joué sur téléphone. Les joueurs se connectent à l'adresse de la machine qui héberge le serveur, sur le même réseau ou via un tunnel.

État du projet et pistes de refonte : voir `docs/audit-2026-09-17.md`.

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
- Express 5
- Socket.io 4
- EJS