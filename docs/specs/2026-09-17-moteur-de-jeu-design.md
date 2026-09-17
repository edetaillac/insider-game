---
date: 2026-09-17
contexte: Spécification du moteur de jeu pur (étape 1 du comité du 17/09), validée section par section avec Manu. Règles selon docs/adr/0001-regles-du-jeu.md. Le branchement (adaptateur socket, client render(view)) fait l'objet du chantier suivant
statut: validé
---

# Moteur de jeu insider-game

## TL;DR

Un module pur `src/engine/` sans I/O : `createGame`, `apply(game, command, deps)` et `view(game, playerId)`. L'état est immuable, la machine d'états est le réducteur lui-même, les bulletins vivent dans la phase, le fantôme devient une carte du centre, le hasard et l'horloge sont injectés. JSDoc vérifié par `tsc --checkJs`, tests `node:test`, aucune dépendance de production ajoutée. Rien n'est branché dans ce chantier : master reste jouable à l'identique.

## Périmètre

Inclus : le moteur, ses types, ses tests, le typecheck, les scripts npm.

Exclus, chantier suivant : adaptateur socket dans app.js, événement `state` unique, client `render(view)`, identité par token, smoke script versionné. Exclus plus tard : variante "carte retournée si personne n'a trouvé", regard du trouveur avant la confrontation, sablier configurable en UI.

## Vocabulaire

Les rôles internes sont `master`, `insider`, `common`. Les libellés français (Maître du jeu, Traître, Citoyen) sont un sujet d'affichage, hors moteur. L'hôte (`isHost`) est le joueur qui pilote le lobby, ex "admin" ou "chef de jeu". Le Maître du jeu est un rôle tiré au sort à chaque manche.

## État

```js
/** @typedef {'master'|'insider'|'common'} Role */
/** @typedef {string} PlayerId */               // opaque, attribué par le serveur
/** @typedef {PlayerId|'center'} CandidateId */  // 'center' = la carte du centre (ex fantôme)

/** @typedef {{
 *   version: number,                            // +1 à chaque transition acceptée
 *   settings: { traitorOptional: boolean, timerMs: number, minPlayers: number, maxPlayers: number },
 *   players: Array<{ id: PlayerId, name: string, isHost: boolean }>,   // ordre d'arrivée
 *   roles: Record<PlayerId, Role> | null,        // null en lobby
 *   centerCard: Role | null,                     // carte retirée au centre (variante), null sinon
 *   word: string | null,
 *   phase: Phase
 * }} Game */

/** @typedef {
 *   { name: 'lobby' }
 * | { name: 'roles' }
 * | { name: 'word' }
 * | { name: 'playing', startedAt: number, deadline: number }
 * | { name: 'discussion', finderId: PlayerId, startedAt: number, deadline: number }
 * | { name: 'vote1', finderId: PlayerId, ballots: Record<PlayerId, boolean> }
 * | { name: 'vote2', finderId: PlayerId, ballots: Record<PlayerId, CandidateId> }
 * | { name: 'tiebreak', finderId: PlayerId, tied: CandidateId[], tallies: Record<CandidateId, number> }
 * | { name: 'ended', outcome: 'commonsWin'|'insiderWins'|'allLose'|'allWin',
 *     reason: 'timeout'|'vote1'|'vote2'|'tiebreak',
 *     finderId: PlayerId|null, tallies: Record<CandidateId, number>|null, pointed: CandidateId|null }
 * } Phase */
```

Défauts de `createGame(settings)` : `traitorOptional: true`, `timerMs: 300000`, `minPlayers: 4`, `maxPlayers: 8`. Avec la variante active, `maxPlayers` effectif est 7 (livret).

Invariants garantis par la structure : un bulletin ne peut exister qu'en phase de vote ; les décomptes sont toujours dérivés des bulletins ; la carte du centre n'est jamais un joueur ; l'ordre des joueurs est l'ordre d'arrivée ; l'état est immuable (toute transition renvoie un nouvel objet, l'ancien n'est pas muté).

## Commandes

```js
/** apply(game, command, deps) -> { ok: true, game: Game } | { ok: false, error: string } */
// deps = { rng: () => number, now: () => number, words: string[] }
```

Chaque commande porte `type` et `actor` (PlayerId posé par le serveur). Les commandes serveur (`addPlayer`, `removePlayer`, `timeout`) portent `actor: 'server'`. Ordre des vérifications : phase, acteur, arguments. Toute erreur renvoie `{ ok: false, error }` avec un code stable (`WRONG_PHASE`, `FORBIDDEN`, `INVALID_ARGUMENT`, `TOO_FEW_PLAYERS`, `TOO_MANY_PLAYERS`, `DUPLICATE_NAME`, `NOT_YET`) et l'état d'entrée intact.

| Commande | Phase source | Qui | Effet |
|---|---|---|---|
| `addPlayer {id, name, isHost}` | lobby, ended | serveur | ajoute le joueur, nom non vide (après trim) et unique, refuse au-delà de `maxPlayers` |
| `removePlayer {id}` | lobby, ended | serveur | retire le joueur |
| `startRound` | lobby, ended | hôte | tire les rôles et la carte du centre, `word` à null, `roles`. Refuse sous `minPlayers` |
| `setWord {word}` | roles | Maître | mot saisi non vide, `word` |
| `drawWord` | roles | Maître | mot tiré dans `deps.words` via rng, `word` |
| `startTimer` | word | Maître ou hôte | `playing`, `startedAt = now`, `deadline = now + timerMs` |
| `wordFound {finderId}` | playing | Maître ou hôte | `discussion`, finderId doit être un joueur non Maître, `deadline = now + (now - playing.startedAt)` |
| `timeout` | playing | serveur, si `now >= deadline` sinon `NOT_YET` | `ended` allLose, raison timeout |
| `closeDiscussion` | discussion | Maître ou hôte | `vote1`, bulletins vides |
| `vote1 {value: boolean}` | vote1 | tout joueur | pose ou remplace son bulletin. Quand tous ont voté, résolution |
| `vote2 {candidate}` | vote2 | tout joueur | idem. Candidat valide : joueur non Maître, ou `center` si variante active |
| `tiebreak {candidate}` | tiebreak | trouveur | candidat parmi `tied`, résolution |
| `reset` | toute phase | hôte | `lobby`, joueurs conservés, `roles`, `centerCard`, `word` à null |

Tirage de `startRound` : `roles` reçoit un `master` parmi tous les joueurs. Sans variante, un `insider` parmi les autres, le reste `common`, `centerCard = null`. Avec variante : on constitue n-1 cartes (1 insider, n-2 common), on en retire une au hasard vers `centerCard`, on la remplace par une `common`, on distribue aux n-1 non Maîtres. Probabilité que le centre soit l'insider : 1/(n-1).

## Résolutions

Vote 1 (D3). Tous les joueurs votent, Maître et trouveur inclus. Résolution quand `Object.keys(ballots).length === players.length`. Si le nombre de `true` est strictement supérieur à `players.length / 2` : le rôle du trouveur décide, `insider` donne `commonsWin`, sinon `insiderWins`, raison `vote1`, `pointed = finderId`, `tallies = { [finderId]: yes }`. Sinon passage en `vote2` avec bulletins vides.

Vote 2. Tous les joueurs votent. À complétion, dépouillement `tallies` par candidat. Un seul maximum : résolution du candidat, raison `vote2`. Plusieurs : `tiebreak` avec `tied` triés par ordre d'arrivée des joueurs puis `center` en dernier.

Tiebreak. Le trouveur choisit parmi `tied`. Résolution du candidat, raison `tiebreak`.

Résolution d'un candidat pointé `c` :
- `c` est un joueur et `roles[c] === 'insider'` : `commonsWin`
- `c` est un joueur `common` et `centerCard === 'insider'` : `allLose`
- `c` est un joueur `common` sinon : `insiderWins`
- `c === 'center'` et `centerCard === 'insider'` : `allWin`
- `c === 'center'` et `centerCard === 'common'` : `insiderWins`

## Vue

`view(game, playerId)` est la seule fonction qui expose des secrets.

```js
/** @typedef {{
 *   version: number,
 *   phase: Phase['name'],
 *   me: { id: PlayerId, name: string, isHost: boolean, role: Role|null, hasVoted: boolean },
 *   players: Array<{ id: PlayerId, name: string, isHost: boolean, hasVoted: boolean }>,
 *   word: string|null,
 *   finder: { id: PlayerId, name: string }|null,
 *   timer: { startedAt: number, deadline: number }|null,
 *   candidates: Array<{ id: CandidateId, name: string }>|null,
 *   result: { outcome, reason, insiderId: PlayerId|null, centerCard: Role|null,
 *             tallies: Record<CandidateId, number>|null, pointed: CandidateId|null }|null,
 *   actions: string[]
 * }} View */
```

Règles d'exposition :
- `me.role` : dès `roles`, le sien seulement. Les rôles des autres ne sortent jamais avant `ended` ; en `ended`, `result.insiderId` et `result.centerCard` sont exposés à tous
- `word` : Maître et Traître dès `word`, tout le monde en `ended`, null sinon
- `timer` : en `playing` et `discussion`
- `candidates` : en `vote2` pour tous (les candidats valides), en `tiebreak` les `tied` pour tous (seul le trouveur a l'action)
- `hasVoted` : vrai si un bulletin existe pour ce joueur dans la phase courante
- `actions` : la liste des `type` de commandes que ce joueur peut émettre maintenant, calculée avec les mêmes règles que `apply` (phase et acteur). Ne contient jamais les commandes serveur
- Le nom d'affichage du candidat `center` est fourni par le moteur ("Pas de Traître") pour ne pas dupliquer la règle côté client. Il pourra être surchargé par l'adaptateur

La présence en ligne n'est pas dans la vue, c'est une donnée de transport que l'adaptateur fusionnera.

## Organisation

```
src/engine/game.js     createGame(settings), apply(game, command, deps)
src/engine/view.js     view(game, playerId)
src/engine/types.js    typedefs JSDoc (Game, Phase, Command, View, Deps)
src/engine/rng.js      mulberry32(seed), shuffle(array, rng), pick(array, rng)
test/engine/*.test.js  node:test
jsconfig.json          checkJs, strict, noEmit, include src/engine
```

Scripts : `npm test` = `node --test test/`, `npm run typecheck` = `tsc -p jsconfig.json`. `typescript` en devDependency. Le moteur n'importe ni Express, ni socket.io, ni `node:fs`. `Math.random` et `Date.now` n'apparaissent pas dans `src/engine/`.

## Tests

Cible : une cinquantaine de cas, sous la seconde, rng seedé.

- `roles.test.js` : 4 et 8 joueurs, exactement un Maître et un Traître, Maître jamais Traître, sans variante `centerCard` null ; avec variante la carte du centre est `insider` avec une fréquence proche de 1/(n-1) sur 1000 tirages seedés (tolérance 20 %) ; refus sous `minPlayers`, refus d'`addPlayer` au-delà de `maxPlayers`, nom vide ou en doublon refusé
- `transitions.test.js` : grille phase x commande, chaque commande hors phase renvoie `WRONG_PHASE` et l'état d'entrée est identique par référence ; chaque commande par le mauvais acteur renvoie `FORBIDDEN` ; `timeout` renvoie `NOT_YET` avant la deadline et termine en `allLose` après ; `reset` depuis chaque phase ramène en `lobby` avec les mêmes joueurs ; `version` augmente de 1 par transition acceptée et pas sur refus
- `vote1.test.js` : majorité stricte à 4, 5 et 6 joueurs (à 6, 3 oui ne suffisent pas, 4 oui suffisent) ; trouveur Traître donne `commonsWin`, trouveur Citoyen donne `insiderWins` ; minorité passe en `vote2` ; un bulletin remplacé ne compte qu'une fois ; la résolution se déclenche au dernier bulletin et pas avant ; le Maître et le trouveur votent
- `vote2.test.js` : un seul candidat sans plantage ; pluralité simple ; égalité vers `tiebreak` avec les bons `tied` ; `tiebreak` refusé à un non trouveur et pour un candidat hors `tied` ; les cinq issues de résolution ; le Maître n'est pas un candidat valide ; `center` refusé si variante désactivée ; les `tallies` sont recalculés depuis les bulletins
- `view.test.js` : un Citoyen ne voit ni le mot ni les rôles des autres avant `ended` ; le Traître et le Maître voient le mot dès `word` ; tout le monde voit le mot, l'insider et la carte du centre en `ended` ; `actions` vide pour qui n'a rien à faire, contient `vote1` pour qui n'a pas voté et pas pour qui a voté ; `hasVoted` cohérent ; un `playerId` inconnu lève une erreur explicite

Anciens bugs couverts : plantage à 2 joueurs (un seul candidat), compteur de vote non réinitialisé (dépouillement dérivé), tri des joueurs (ordre d'arrivée stable dans `view.players`), vote hors phase, vote au nom d'un autre (l'acteur est le votant, pas un champ), `startTimer` rejoué en cours de partie refusé.

## Critères de fin

- `npm test` et `npm run typecheck` verts
- aucun import d'I/O dans `src/engine/`
- master jouable à l'identique, l'ancien app.js n'est pas modifié
- ADR 0001 et cette spec référencées depuis le README
