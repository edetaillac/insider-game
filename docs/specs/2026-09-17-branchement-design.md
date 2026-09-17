---
date: 2026-09-17
contexte: Spécification du chantier 2, branchement du moteur pur (docs/specs/2026-09-17-moteur-de-jeu-design.md) au serveur socket.io et au téléphone. Validée section par section avec Manu. Décisions d'architecture dans docs/comite-2026-09-17-architecture-cible.md, règles dans docs/adr/0001-regles-du-jeu.md
statut: validé
---

# Branchement du moteur, serveur et client

## TL;DR

Une seule table, identité par token, un événement `state` unique calculé par `view(game, playerId)`, un client vanilla `render(view)` sans jQuery, même look qu'aujourd'hui. Le moteur `src/engine/` ne change pas. La page admin, la session Express et les trois vues EJS de 2020 disparaissent. Quatre tests d'intégration socket, une checklist mobile manuelle. Le jeu redevient jouable sur téléphone à la fin de ce chantier, avec les règles de l'ADR.

## Périmètre

Inclus : adaptateur serveur, transport socket.io, flux de join par token, diffusion par joueur, chrono serveur, client single page (join, écrans par phase, cartes à retourner, chrono, sons, Wake Lock), tests d'intégration, checklist mobile, nettoyage des fichiers de 2020.

Exclus : refonte visuelle et sortie de Bootstrap, rooms et code de partie, variantes "carte retournée si personne n'a trouvé" et "regard avant confrontation", HTTPS et exposition Internet, persistance, transfert d'hôte.

## Vocabulaire

Hôte : le premier joueur qui rejoint, il pilote le lobby (`isHost`). Le mot "chef de jeu" disparaît. Maître du jeu, Traître, Citoyen : libellés d'affichage des rôles `master`, `insider`, `common`. "Pas de Traître" : libellé de la carte du centre, fourni par le moteur (`CENTER_LABEL`).

## Serveur

### Flux de join

Une seule page servie sur `/`. Au chargement, le client lit `insider.token` dans localStorage et se connecte avec `io({ auth: { token } })`.

- Token connu : le serveur attache le socket au joueur et lui envoie son `state`
- Token absent ou inconnu : le serveur émet `needJoin`, le client affiche le formulaire (un champ prénom, un bouton Rejoindre)
- Le client émet `join { name }`. Le serveur applique `addPlayer { id: randomUUID(), name, isHost }` avec `isHost = true` si la table n'a aucun joueur, génère un token opaque (`randomBytes(16).toString('hex')`), l'associe au joueur, répond `joined { token }`, attache le socket, diffuse. En cas d'échec du moteur (nom vide, doublon, table pleine, mauvaise phase), le serveur répond `joinFailed { error, message }` et le client affiche le message sous le champ
- Le client stocke le token et ne le renvoie que dans `auth` à la connexion

Le serveur ne fait jamais confiance à un identifiant de joueur venu du client, sauf en tant qu'argument d'une commande (le `finderId` de `wordFound`, le `candidate` d'un vote, l'`id` d'un `kick`), que le moteur valide.

### Adaptateur `src/server/table.js`

`createTable({ settings, words, now = Date.now, random })` renvoie un objet avec :

- `game` : l'état courant du moteur (lecture seule de l'extérieur)
- `join(name) -> { ok: true, token, playerId } | { ok: false, error, message }`
- `resolve(token) -> playerId | null`
- `connect(playerId, socketId)` et `disconnect(playerId, socketId)` : tiennent `sockets: Map<playerId, Set<socketId>>`, renvoient vrai si la présence du joueur a changé
- `dispatch(playerId, command) -> Result` : pose `actor = playerId`, traduit `kick` en `removePlayer` serveur (hôte seulement, jamais sur lui-même, sinon `FORBIDDEN`), appelle `apply`, met à jour `game`, gère le chrono, renvoie le résultat du moteur
- `snapshot(playerId) -> { view, online: playerId[], serverTime }` : `view(game, playerId)`, la liste des joueurs ayant au moins un socket, et `now()`
- `onChange(listener)` : le listener est appelé après chaque transition acceptée et chaque changement de présence
- `close()` : annule le chrono

Chrono : après chaque transition, si `game.phase.name === 'playing'`, armer `setTimeout(() => dispatch('server', { type: 'timeout' }), deadline - now())` (borné à 0), sinon annuler le timer en cours. Le moteur reste juge (`NOT_YET` impossible en pratique, ignoré s'il survient). Course entre le tick et un clic du Maître : avant de traiter toute commande d'un joueur, si la phase est `playing` et `now() >= deadline`, l'adaptateur applique d'abord `timeout` ; la commande du joueur est alors refusée par le moteur (`WRONG_PHASE`).

Tokens en mémoire (`Map<token, playerId>`). Un joueur retiré (`removePlayer`) voit son token invalidé et ses sockets reçoivent `needJoin`.

### Transport `src/server/app.js`

`createApp({ settings, words })` renvoie `{ httpServer, io, table }`.

- Express : `GET /` rend la coquille EJS (`views/index.ejs` dans `views/layouts/layout.ejs`), `/static` sert `public/`. Plus de body-parser, plus de session, plus de routes de jeu
- socket.io : à la connexion, `token = socket.handshake.auth?.token`, `playerId = table.resolve(token)`. Si null : `socket.emit('needJoin')`. Sinon `table.connect`, `socket.emit('state', table.snapshot(playerId))`
- `join`, payload `{ name }` : `table.join(name)`, puis `joined { token }` ou `joinFailed { error, message }`, puis `connect` et `state`
- `command`, payload `{ type, ...args }`, avec ack : refus `FORBIDDEN` si le socket n'est pas attaché à un joueur ; sinon `ack(table.dispatch(playerId, payload))` où le résultat est réduit à `{ ok }` ou `{ ok: false, error, message }`, jamais l'état complet
- `disconnect` : `table.disconnect`
- Diffusion : sur `onChange`, pour chaque joueur ayant des sockets, `io.to(socketId).emit('state', table.snapshot(playerId))`. Jamais d'émission de l'état brut du moteur

Payloads entrants validés par forme avant `dispatch` : `type` est une chaîne parmi les commandes connues du client (`startRound`, `setWord`, `drawWord`, `startTimer`, `wordFound`, `closeDiscussion`, `vote1`, `vote2`, `tiebreak`, `reset`, `kick`), les champs attendus sont du bon type primitif, tout le reste est ignoré. Une commande inconnue reçoit `INVALID_ARGUMENT`.

### Entrée `app.js`

Lit l'environnement, charge la liste de mots, appelle `createApp`, écoute. Variables : `PORT` (8080), `MIN_PLAYERS` (4), `TRAITOR_OPTIONAL` (`true`, toute autre valeur que `false` vaut vrai), `TIMER_MS` (300000), `WORDS_FILE` (`words/famille.csv`). `SESSION_SECRET` disparaît.

### Accepté

État et tokens en mémoire, un redémarrage renvoie tout le monde au join. L'hôte ne se transfère pas et ne peut pas être retiré. Un joueur qui ferme l'app en cours de manche reste dans la partie (présence hors ligne, reprise par token) ; s'il ne revient pas, un vote ne se termine pas et l'hôte utilise "Retour au lobby" puis le retire. Réseau local ou tunnel, pas de HTTPS.

## Client

Modules ESM dans `public/js/`, chargés par `<script type="module">`, sans bundler. socket.io client servi par le serveur sur `/socket.io/socket.io.js`. Bootstrap 4 et les CSS actuels restent, jQuery disparaît.

- `client.js` : boot, connexion, écoute de `state`, `needJoin`, `joined`, `joinFailed`, envoi de `join` et `command` (avec ack, message d'erreur affiché en bandeau 3 secondes si `ok` est faux), stockage du token, décalage d'horloge `offset = serverTime - Date.now()` recalculé à chaque `state`
- `render.js` : `render(root, envelope, previous)`. Un `switch` sur `view.phase`, une fonction par écran qui renvoie une chaîne HTML construite avec `escapeHtml`. Le sous-arbre de `root` n'est remplacé que si `view.phase` ou `view.version` change avec un changement structurel (phase, liste des joueurs, candidats) ; les compteurs (votes reçus, présence, chrono) sont patchés en place par `data-bind`. Le chrono est un `setInterval` d'une seconde qui écrit `deadline - (Date.now() + offset)` et se coupe hors des phases `playing` et `discussion`
- `audio.js` : `unlock()` au premier geste (crée un `AudioContext`, précharge les cinq sons, demande le Wake Lock), `playFor(previousPhase, phase)` joue le son de la transition, `play().catch` silencieux. Le Wake Lock est redemandé sur `visibilitychange`
- `dom.js` : `escapeHtml`, `formatCountdown(ms)`, `$(selector)`

Cartes à retourner : le rôle (phase roles et suivantes) et le mot (Maître et Traître dès `word`) sont des éléments `<button class="card" aria-pressed>` dont le tap bascule `data-flipped`. État local au DOM, réinitialisé quand le sous-arbre est remplacé. Aucun timer d'affichage.

### Écrans par phase

L'écran se dérive de `view.phase`, `view.me`, `view.actions` et `view.candidates`. Une action n'est rendue que si son type est dans `view.actions`.

| Phase | Tous | Selon rôle ou droits |
|---|---|---|
| join (client seul) | champ prénom, bouton Rejoindre (débloque l'audio) | |
| lobby | liste des présents avec pastille (online), "En attente de l'hôte" | hôte : "Lancer la partie" (désactivé sous `MIN_PLAYERS`, raison affichée), croix pour retirer un joueur non hôte |
| roles | carte "Ton rôle" à retourner, "X est le Maître du jeu" (depuis `view.master`) | Maître : champ "Mot à faire deviner" + "Valider", bouton "Tirer un mot au hasard" |
| word | | Maître et Traître : carte du mot à retourner. Citoyens : "Le Maître et le Traître découvrent le mot". Maître ou hôte : "Lancer le chrono" |
| playing | chrono en très gros, rouge sous 30 secondes | Maître : carte du mot toujours accessible. Maître ou hôte : "Mot trouvé par..." puis liste des joueurs non Maître |
| discussion | "X a trouvé le mot", chrono indicatif | Maître ou hôte : "Passer au vote" |
| vote1 | "X a trouvé le mot. Est-ce le Traître ?", pouce haut et bas | après vote : "Ton vote est pris, n sur N ont voté" |
| vote2 | "Qui est le Traître ?", un bouton pleine largeur par candidat, "Pas de Traître" séparé en bas si présent | après vote : même compteur |
| tiebreak | "Égalité entre A et B" avec le nombre de voix (depuis `view.tallies`) | trouveur : un bouton par ex aequo. Autres : "X départage" |
| ended | phrase d'issue, le Traître nommé (ou "il n'y avait pas de Traître"), le mot, le dépouillement si présent | hôte : "Rejouer" (startRound), "Retour au lobby" (reset) |

Phrases d'issue : commonsWin "Les Citoyens gagnent", insiderWins "Le Traître gagne", allLose "Tout le monde perd" (avec "Le temps est écoulé" si la raison est timeout), allWin "Tout le monde gagne, il n'y avait pas de Traître".

Bandeau de reconnexion : quand le socket est déconnecté, un bandeau "Reconnexion..." s'affiche, il disparaît au prochain `state`.

## Fichiers

```
app.js                       entrée (env, CSV, createApp, listen)
src/server/table.js          createTable
src/server/app.js            createApp (Express coquille, static, socket.io)
views/layouts/layout.ejs     coquille, sans jQuery, avec <script type="module" src="/static/js/client.js">
views/index.ejs              conteneur #app et <template> optionnels
public/js/client.js, render.js, audio.js, dom.js
test/server/helpers.js       startServer(settings) sur port 0, connectClient(token?), waitFor(socket, event)
test/server/game.test.js     partie complète à 4 clients
test/server/guards.test.js   commande hors phase, socket non attaché, kick
test/server/reconnect.test.js
test/server/timeout.test.js
docs/checklist-mobile.md
```

Supprimés : `views/welcome.ejs`, `views/board.ejs`, `views/adminPlayer.ejs`, `public/js/timer.js`, `public/pdf/help.pdf`. Dépendance `express-session` retirée. `socket.io-client` ajouté en devDependency.

Le typecheck s'étend à `src/server/` (JSDoc, mêmes règles). `public/js/` n'est pas typé.

## Tests

Serveur réel sur port éphémère, clients `socket.io-client`, attentes par `waitFor(socket, 'state', predicate)` avec timeout de 2 secondes, jamais de sleep. Réglages injectés (`minPlayers: 4`, `timerMs` court pour le test de chrono, `traitorOptional: false` là où il faut un Traître parmi les joueurs).

1. Partie complète : 4 clients rejoignent, le premier est hôte. Chaque client reçoit un `state` après chaque transition. Après `setWord`, seuls le Maître et le Traître ont `view.word`. La partie va jusqu'à `ended` par le vote 2, tout le monde voit le mot, `result.insiderId` et le dépouillement. `online` liste les 4 joueurs
2. Gardes : un `vote1` en phase lobby reçoit l'ack `WRONG_PHASE` et aucun `state` n'est émis dans les 200 ms suivantes ; un socket sans token qui envoie `command` reçoit `FORBIDDEN` ; `kick` par un non hôte reçoit `FORBIDDEN`, `kick` de l'hôte par lui-même reçoit `FORBIDDEN`, `kick` d'un joueur par l'hôte le retire et son socket reçoit `needJoin`
3. Reconnexion : un client vote au vote 1, se déconnecte, se reconnecte avec son token, reçoit un `state` où `me.hasVoted` est vrai et la phase est inchangée ; un client avec un token inventé reçoit `needJoin`
4. Chrono : `timerMs: 300`, après `startTimer` tous les clients reçoivent un `state` en `ended` avec la raison `timeout` sans qu'aucun client n'ait envoyé de commande

Test unitaire léger sur `dom.js` (`formatCountdown`, `escapeHtml`) exécuté sous node.

## Checklist mobile (docs/checklist-mobile.md)

À passer sur un iPhone et un Android réels avant la première partie : le son sort après le premier tap ; l'écran ne se verrouille pas pendant le chrono ; un reload en pleine partie revient au bon écran ; un verrouillage puis déverrouillage revient au bon écran ; deux onglets du même téléphone comptent pour un joueur ; couper le réseau 10 secondes affiche le bandeau puis rattrape l'état.

## Critères de fin

- `npm test`, `npm run typecheck`, `npm run lint` verts, tests d'intégration inclus
- une partie complète jouable depuis deux navigateurs sur la machine de dev, avec `MIN_PLAYERS=2`
- `git grep -n jquery` ne renvoie rien hors `docs/` et `screenshots/`
- README mis à jour : flux de join, variables d'environnement, statut "branché"
