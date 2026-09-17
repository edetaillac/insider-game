---
date: 2026-09-17
contexte: Comité de 7 personas (Architecte, Dev Backend, Dev Frontend, QA, Pragmatique, Designer UX, Sceptique) convoqué pour trancher l'architecture cible du jeu après l'audit et le P0. Registre décision. Deux tours, réactions croisées anonymisées, position finale individuelle
statut: synthèse, décisions d'ordre validées par Manu le 17/09 (pas de date de partie posée, on code quand même)
---

# Comité, architecture cible d'insider-game

## TL;DR

Le comité rejette l'option B de l'audit telle qu'écrite (reconstruction TypeScript, Svelte, rooms) et rejette aussi le "on corrige la douleur au fil de l'eau". Position finale des 7 personas : extraction incrémentale dans le repo existant, master jouable à chaque commit, aucune branche qui survit à une soirée. Le moteur pur testé reste la première étape. La moitié du plan P1/P2 de l'audit tombe.

## Recommandation, dans l'ordre

0. Poser une date de partie réelle. Décision Manu : pas encore, on code quand même, la partie servira de go/no-go pour la suite
1. Extraire `engine.js` pur : `apply(state, command, { rng, now })`, phases en union discriminée avec les bulletins rangés dans la phase (un vote hors phase n'a nulle part où atterrir), chrono en `deadline` timestamp et fin de chrono en commande `timeout`. Les bugs connus en tests rouges d'abord. La machine d'états n'est pas une table à côté, c'est le réducteur lui-même. `app.js` devient un adaptateur
2. Un seul événement `state` calculé par `view(state, playerId)`, et un `render(view)` vanilla qui remplace la cascade hide/fadeIn dans board.ejs. Carte à retourner soi-même pour le rôle et le mot à la place des fondus de 5 et 6 secondes. Chrono dérivé de `endsAt` côté client, défaite au temps, audio débloqué au premier tap. Le reload et la fin de partie se règlent ici
3. Token émis au join dans `socket.handshake.auth`, bulletins indexés par identifiant serveur, actions hôte vérifiées. Le nom quitte les payloads
4. La partie réelle, avec la grille d'observation du Designer. Tout le reste (refonte visuelle, rooms, PWA) se décide sur douleur observée

Refusé à l'unanimité : Svelte, Vite ou toute toolchain client, une branche de reconstruction, les rooms avec UI, le fondu temporisé, un snapshot global filtré par le client, tout P2 chiffré avant l'étape 4.

## Accords

[ACCORD] unanimes, avec alerte anti-groupthink. Sept sur sept sur : moteur pur en premier, master jouable à chaque commit, vanilla plutôt que Svelte, snapshot personnalisé par `view(state, playerId)`, token au join, chrono en timestamp. Le Sceptique le nomme : sept modèles de la même famille convergent sur "réducteur pur + tests" parce que c'est le motif le plus appris, pas parce qu'un joueur le remarquera. L'audit, le P0 et ce comité viennent du même modèle. La contre-mesure est l'étape 4, la seule qui fait entrer un humain qui joue.

[ACCORD] la carte à retourner. Une décision UX qui supprime du code (plus de timer de transition, plus de resynchronisation d'horloge). Le Frontend abandonne sa proposition de fondu corrigé.

[ACCORD] la machine d'états est le réducteur, ni table à côté ni gardes dispersées dans les handlers. Convergence au tour 2 du Pragmatique (qui voulait des gardes) et du Backend et QA (qui voulaient une machine formelle).

## Frictions

[FRICTION] partie réelle sur le P0 tel quel, ou après le moteur. Pragmatique et Designer voulaient jouer d'abord. Architecte, Backend, QA et Sceptique : jouer avec le tri cassé et le compteur qui double produit du bruit, pas de la donnée. Frontend : une soirée de correctifs bornés puis la partie. Tranché par Manu : on code d'abord

[FRICTION] TypeScript. Architecte, Backend, QA, Frontend : JSDoc + `tsc --checkJs` sur le moteur et le type `View`, sans build, pour l'exhaustivité des phases. Pragmatique et Sceptique : aucun typage outillé. Personne ne défend le `.ts` compilé. Non tranché, préférence de développeur

[FRICTION] rooms en structure. Backend et QA : `Map<code, Game>` dès l'étape 1 pour tuer le singleton. Architecte (a bougé), Pragmatique, Sceptique, Frontend : un moteur instanciable suffit, une Map à une entrée est un singleton avec une indirection

[FRICTION] tests de caractérisation du comportement actuel (Architecte, Sceptique) contre tests écrits depuis les règles avec les bugs en rouge (QA, Backend). Argument QA : caractériser un comparateur indéfini, c'est promouvoir un bug au rang de contrat. Seule caractérisation utile, le smoke script versionné

[FRICTION] enrôlement. Pragmatique garde la page admin. Designer la refuse et propose l'auto-enrôlement (un champ prénom, un bouton Rejoindre, le lobby montre qui est là), qui n'est pas les rooms. Sceptique : la version 2020 avait une vertu, zéro saisie

Mouvements du tour 2 : tous appuyés sur un argument neuf, pas de ralliement de politesse détecté. Le plus gros mouvement est celui du Pragmatique vers le snapshot personnalisé, sur un coût annoncé "10 lignes" que personne n'a vérifié.

## Positions finales par persona

- Architecte : strangler dans le repo, Express et EJS en enveloppe. Ordre moteur, view, token, partie. Refuse TS compilé, rooms, gardes dispersées, tout P2 chiffré
- Backend : même ordre, avec `Map<code, state>` dès l'étape 1 et le fantôme sorti de la liste des joueurs. Refuse le nom dans un payload, un compteur stocké, un filtrage client
- Frontend : soirée de correctifs sur P0 puis partie, puis moteur, token, view. Refuse Svelte, un render alimenté par du HTML EJS pré-rendu, un timer de transition, un front en parallèle sur branche longue
- QA : moteur avec ses 16 cas et la grille phase x commande, `project` avec golden fixtures par phase et test négatif sur le secret, 3 tests d'intégration, checklist manuelle sur iPhone et Android réels. Refuse Playwright en P1
- Pragmatique : A avec le moteur de B. Étape 0 la date. Refuse TS, rooms même en structure, contrat écrit avant le code, suppression de la page admin
- Designer UX : partie sur P0 avec grille d'observation, puis moteur et render, puis view et carte à retourner et auto-enrôlement, puis socle UI et sortie de Bootstrap. Refuse tout fondu temporisé, le fantôme dans la liste, le mot "chef de jeu"
- Sceptique : moteur, token, state, partie, rien d'autre. Go/no-go pour ouvrir un vrai P1 : deux parties jouées avant fin décembre avec une liste de douleurs écrite le soir même. Sinon on archive proprement

## Grille d'observation pour la première partie (Designer)

Un observateur qui ne joue pas, notes horodatées :
- qui regarde son téléphone à quel moment, combien de secondes après le signal
- combien ratent la révélation du rôle ou du mot, combien demandent à revoir
- le Maître garde-t-il le mot en tête ou cherche-t-il à le relire pendant les questions
- reloads et verrouillages d'écran pendant les 5 minutes, ce qu'ils voient au retour
- les sons sortent-ils, et sur quels appareils
- au vote 2, quelqu'un hésite-t-il devant "Pas de Traître" dans la liste
- ce qui se passe à zéro sur le chrono
- temps d'enrôlement et confusion "chef de jeu" / "Maître du jeu"
Trois questions à la fin : qu'as-tu raté, qu'as-tu cherché, qu'as-tu ignoré.

## Non tranché, à vérifier

- Règles de jeu : tranchées le même jour dans docs/adr/0001-regles-du-jeu.md
- Ambition famille ou ouvert, hébergement local ou exposé. Décide du sérieux du token et de l'existence des rooms
- JSDoc + checkJs sur le moteur, oui ou non
- Chiffres avancés non vérifiés : "une soirée par étape", "view en 20 à 30 lignes", "rooms en 5 lignes", contraste blanc sur rouge #DE3C31 "environ 3.9:1"
- La reprise par token en localStorage est réputée "gratuite" alors qu'elle échoue en navigation privée iOS ou après purge du cache
- Vérifié pendant la synthèse : `game.status` écrit à 9 endroits dans app.js, et le vote 1 bascule en phase vote2 avant que l'hôte n'ouvre le vote (lignes 295 et 307 au moment du comité)

## Actions

- [x] ADR des règles avant le premier test (fait le 17/09)
- [ ] Versionner le smoke script comme test d'intégration
- [x] Étape 1 : moteur pur `src/engine/` avec ses tests (17/09)
- [ ] Poser une date de partie quand c'est possible, go/no-go : deux parties avant fin décembre
