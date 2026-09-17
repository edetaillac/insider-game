# Moteur de jeu, plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un module pur `src/engine/` (createGame, apply, view) qui implémente les règles d'Insider selon l'ADR 0001, testé avec node:test et vérifié par tsc, sans être branché au serveur.

**Architecture:** Réducteur immuable `apply(game, command, deps) -> Result`, la machine d'états est le réducteur (table phase x commande, puis règle d'acteur, puis arguments). Les bulletins vivent dans la phase, le fantôme est une `centerCard`, le hasard et l'horloge passent par `deps`. `view(game, playerId)` est la seule fonction qui expose des secrets et calcule les actions possibles.

**Tech Stack:** Node 22, ESM, JSDoc typé vérifié par `tsc --checkJs` (typescript en devDependency, aucun build), `node:test` et `node:assert/strict`, ESLint déjà en place.

**Spec:** `docs/specs/2026-09-17-moteur-de-jeu-design.md` (règles : `docs/adr/0001-regles-du-jeu.md`)

## Global Constraints

- Node `>=22`, `"type": "module"`, imports relatifs avec extension `.js`
- `src/engine/` n'importe ni `express`, ni `socket.io`, ni `node:fs`, ni aucun module Node. `Math.random` et `Date.now` interdits dans `src/engine/`
- Aucune dépendance de production ajoutée. Seule devDependency ajoutée : `typescript`
- `app.js`, `views/`, `public/` ne sont pas modifiés. Master reste jouable à l'identique
- Rôles internes : `'master' | 'insider' | 'common'`. Libellés français hors moteur, sauf `CENTER_LABEL = 'Pas de Traître'` exporté par `view.js`
- Codes d'erreur stables : `WRONG_PHASE`, `FORBIDDEN`, `INVALID_ARGUMENT`, `TOO_FEW_PLAYERS`, `TOO_MANY_PLAYERS`, `DUPLICATE_NAME`, `NOT_YET`, `UNKNOWN_PLAYER`
- Défauts : `traitorOptional: true`, `timerMs: 300000`, `minPlayers: 4`, `maxPlayers: 8`. Avec `traitorOptional`, maximum effectif 7
- Style : 4 espaces, simple quotes, point-virgule, pas de caractère "—" dans les commentaires
- Commits : préfixes `feat:`, `test:`, `chore:`, `docs:`, terminés par `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
- Après chaque tâche : `npm test`, `npm run typecheck`, `npm run lint` verts

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `src/engine/rng.js` | `mulberry32(seed)`, `shuffle(array, rng)`, `pick(array, rng)`. Aucun autre import |
| `src/engine/types.js` | Typedefs JSDoc : Role, PlayerId, CandidateId, Settings, Player, Phase, Game, Command, ErrorCode, Result, Deps, View. Export vide |
| `src/engine/game.js` | `createGame`, `apply`, `canAct`, `allowedActions`, `candidates`, `effectiveMaxPlayers`, constantes `SERVER`, `CENTER`, `DEFAULT_SETTINGS`. Les handlers privés d'une commande chacun, les résolutions |
| `src/engine/view.js` | `view(game, playerId)`, `CENTER_LABEL` |
| `test/engine/helpers.js` | `makeDeps`, `run`, `expectFail`, `lobby`, `started`, `inVote1`, `inVote2`, `roleOf`, `withRole` |
| `test/engine/rng.test.js` | déterminisme du rng, shuffle sans perte, pick |
| `test/engine/lobby.test.js` | addPlayer, removePlayer, reset, erreurs de base d'apply |
| `test/engine/roles.test.js` | startRound, distribution, carte du centre, bornes |
| `test/engine/flow.test.js` | setWord, drawWord, startTimer, wordFound, timeout, closeDiscussion |
| `test/engine/vote1.test.js` | vote 1 et résolution à la majorité stricte |
| `test/engine/vote2.test.js` | vote 2, dépouillement, tiebreak, résolutions |
| `test/engine/transitions.test.js` | grille phase x commande, immuabilité, version, reset depuis chaque phase |
| `test/engine/view.test.js` | exposition des secrets, actions, hasVoted |
| `jsconfig.json` | checkJs strict sur `src/engine` |
| `package.json` | scripts `test`, `typecheck`, devDependency typescript |
| `eslint.config.js` | étend la config node à `src/**` et `test/**` |
| `README.md` | section Développement, liens vers ADR et spec |

---

### Task 1: Outillage et rng

**Files:**
- Create: `src/engine/rng.js`
- Create: `test/engine/rng.test.js`
- Create: `jsconfig.json`
- Modify: `package.json` (scripts, devDependencies)
- Modify: `eslint.config.js` (bloc node : ajouter `src/**/*.js` et `test/**/*.js`)

**Interfaces:**
- Produces: `mulberry32(seed: number): () => number` (retourne un flottant dans [0, 1)), `shuffle<T>(array: T[], rng: () => number): T[]` (copie mélangée, l'entrée n'est pas mutée), `pick<T>(array: T[], rng: () => number): T` (lève `Error('pick: empty array')` sur tableau vide)

- [ ] **Step 1: Installer typescript et poser les scripts**

Run:
```bash
npm install --save-dev typescript@latest --no-fund --loglevel=error
```

Puis éditer `package.json` pour que la section `scripts` devienne :

```json
"scripts": {
    "start": "node app.js",
    "dev": "node --watch app.js",
    "lint": "eslint .",
    "test": "node --test test/",
    "typecheck": "tsc -p jsconfig.json"
}
```

- [ ] **Step 2: Créer jsconfig.json**

```json
{
    "compilerOptions": {
        "checkJs": true,
        "allowJs": true,
        "strict": true,
        "noEmit": true,
        "target": "es2022",
        "module": "nodenext",
        "moduleResolution": "nodenext",
        "types": []
    },
    "include": ["src/engine/**/*.js"]
}
```

- [ ] **Step 3: Étendre ESLint aux nouveaux dossiers**

Dans `eslint.config.js`, dans le premier bloc (node), remplacer `files: ['app.js', 'eslint.config.js'],` par :

```js
        files: ['app.js', 'eslint.config.js', 'src/**/*.js', 'test/**/*.js'],
```

et `globals: globals.node` par :

```js
            globals: { ...globals.node, structuredClone: 'readonly' }
```

(`structuredClone` est un global Node 17+, la liste `globals.node` peut ne pas le connaître selon la version.)

- [ ] **Step 4: Écrire le test du rng (échoue)**

`test/engine/rng.test.js` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, shuffle, pick } from '../../src/engine/rng.js';

test('mulberry32 est déterministe pour une seed donnée', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    assert.deepEqual(seqA, seqB);
    for (const x of seqA) {
        assert.ok(x >= 0 && x < 1, `valeur hors [0,1) : ${x}`);
    }
});

test('deux seeds différentes donnent des séquences différentes', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    assert.notEqual(a(), b());
});

test('shuffle renvoie une permutation sans muter l\'entrée', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const copy = input.slice();
    const out = shuffle(input, mulberry32(7));
    assert.deepEqual(input, copy);
    assert.deepEqual(out.slice().sort(), copy);
    assert.notEqual(out, input);
});

test('shuffle produit un ordre différent de l\'entrée sur un tableau de 8 (seed 3)', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    assert.notDeepEqual(shuffle(input, mulberry32(3)), input);
});

test('pick renvoie un élément du tableau et refuse le tableau vide', () => {
    const rng = mulberry32(9);
    const arr = ['a', 'b', 'c'];
    assert.ok(arr.includes(pick(arr, rng)));
    assert.throws(() => pick([], rng), /empty/);
});
```

- [ ] **Step 5: Vérifier que le test échoue**

Run: `npm test`
Expected: échec, module `../../src/engine/rng.js` introuvable.

- [ ] **Step 6: Implémenter rng.js**

```js
// src/engine/rng.js
// Générateur déterministe pour les tests et le tirage des rôles. Aucune dépendance.

/**
 * @param {number} seed
 * @returns {() => number} flottant dans [0, 1)
 */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Fisher-Yates sur une copie.
 * @template T
 * @param {readonly T[]} array
 * @param {() => number} rng
 * @returns {T[]}
 */
export function shuffle(array, rng) {
    const out = array.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/**
 * @template T
 * @param {readonly T[]} array
 * @param {() => number} rng
 * @returns {T}
 */
export function pick(array, rng) {
    if (array.length === 0) {
        throw new Error('pick: empty array');
    }
    return array[Math.floor(rng() * array.length)];
}
```

- [ ] **Step 7: Vérifier tests, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: 5 tests passent, tsc silencieux, eslint sans erreur (un warning possible sur timer.js, préexistant).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json jsconfig.json eslint.config.js src/engine/rng.js test/engine/rng.test.js
git commit -m "chore: test and typecheck tooling, seeded rng for the engine

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Types, createGame, squelette d'apply, lobby

**Files:**
- Create: `src/engine/types.js`
- Create: `src/engine/game.js`
- Create: `test/engine/helpers.js`
- Create: `test/engine/lobby.test.js`

**Interfaces:**
- Consumes: `shuffle`, `pick` de `rng.js` (importés maintenant, utilisés à partir de la Task 3)
- Produces: `createGame(settings?: Partial<Settings>): Game`, `apply(game, command, deps): Result`, `canAct(game, type, actor): boolean`, `allowedActions(game, playerId): Command['type'][]` (exclut `vote1` / `vote2` pour un joueur qui a déjà voté dans la phase), `candidates(game): CandidateId[]`, `effectiveMaxPlayers(game): number`, constantes `SERVER = 'server'`, `CENTER = 'center'`, `DEFAULT_SETTINGS`. Les handlers `startRound`, `setWord`, `drawWord`, `startTimer`, `wordFound`, `timeout`, `closeDiscussion`, `vote1`, `vote2`, `tiebreak` sont déclarés dans `HANDLERS` avec une implémentation provisoire qui renvoie `fail('INVALID_ARGUMENT', 'not implemented')`, remplacée dans les tâches suivantes

- [ ] **Step 1: Écrire types.js**

```js
// src/engine/types.js
// Typedefs JSDoc du moteur. Ce fichier n'exporte rien à l'exécution.

/** @typedef {'master'|'insider'|'common'} Role */
/** @typedef {string} PlayerId */
/** @typedef {PlayerId|'center'} CandidateId */

/** @typedef {{ traitorOptional: boolean, timerMs: number, minPlayers: number, maxPlayers: number }} Settings */
/** @typedef {{ id: PlayerId, name: string, isHost: boolean }} Player */

/** @typedef {'commonsWin'|'insiderWins'|'allLose'|'allWin'} Outcome */
/** @typedef {'timeout'|'vote1'|'vote2'|'tiebreak'} Reason */

/**
 * @typedef {(
 *   { name: 'lobby' }
 * | { name: 'roles' }
 * | { name: 'word' }
 * | { name: 'playing', startedAt: number, deadline: number }
 * | { name: 'discussion', finderId: PlayerId, startedAt: number, deadline: number }
 * | { name: 'vote1', finderId: PlayerId, ballots: Record<PlayerId, boolean> }
 * | { name: 'vote2', finderId: PlayerId, ballots: Record<PlayerId, CandidateId> }
 * | { name: 'tiebreak', finderId: PlayerId, tied: CandidateId[], tallies: Record<CandidateId, number> }
 * | { name: 'ended', outcome: Outcome, reason: Reason, finderId: PlayerId|null,
 *     tallies: Record<CandidateId, number>|null, pointed: CandidateId|null }
 * )} Phase */

/**
 * @typedef {{
 *   version: number,
 *   settings: Settings,
 *   players: Player[],
 *   roles: Record<PlayerId, Role>|null,
 *   centerCard: Role|null,
 *   word: string|null,
 *   phase: Phase
 * }} Game */

/**
 * @typedef {(
 *   { type: 'addPlayer', actor: 'server', id: PlayerId, name: string, isHost?: boolean }
 * | { type: 'removePlayer', actor: 'server', id: PlayerId }
 * | { type: 'timeout', actor: 'server' }
 * | { type: 'startRound', actor: PlayerId }
 * | { type: 'setWord', actor: PlayerId, word: string }
 * | { type: 'drawWord', actor: PlayerId }
 * | { type: 'startTimer', actor: PlayerId }
 * | { type: 'wordFound', actor: PlayerId, finderId: PlayerId }
 * | { type: 'closeDiscussion', actor: PlayerId }
 * | { type: 'vote1', actor: PlayerId, value: boolean }
 * | { type: 'vote2', actor: PlayerId, candidate: CandidateId }
 * | { type: 'tiebreak', actor: PlayerId, candidate: CandidateId }
 * | { type: 'reset', actor: PlayerId }
 * )} Command */

/** @typedef {Command['type']} CommandType */

/** @typedef {'WRONG_PHASE'|'FORBIDDEN'|'INVALID_ARGUMENT'|'TOO_FEW_PLAYERS'|'TOO_MANY_PLAYERS'|'DUPLICATE_NAME'|'NOT_YET'|'UNKNOWN_PLAYER'} ErrorCode */

/** @typedef {{ ok: true, game: Game } | { ok: false, error: ErrorCode, message: string }} Result */

/** @typedef {{ rng: () => number, now: () => number, words: readonly string[] }} Deps */

/**
 * @typedef {{
 *   version: number,
 *   phase: Phase['name'],
 *   me: { id: PlayerId, name: string, isHost: boolean, role: Role|null, hasVoted: boolean },
 *   players: Array<{ id: PlayerId, name: string, isHost: boolean, hasVoted: boolean }>,
 *   word: string|null,
 *   finder: { id: PlayerId, name: string }|null,
 *   timer: { startedAt: number, deadline: number }|null,
 *   candidates: Array<{ id: CandidateId, name: string }>|null,
 *   result: { outcome: Outcome, reason: Reason, insiderId: PlayerId|null, centerCard: Role|null,
 *             tallies: Record<CandidateId, number>|null, pointed: CandidateId|null }|null,
 *   actions: CommandType[]
 * }} View */

export {};
```

- [ ] **Step 2: Écrire les helpers de test**

`test/engine/helpers.js` :

```js
import assert from 'node:assert/strict';
import { createGame, apply, SERVER } from '../../src/engine/game.js';
import { mulberry32 } from '../../src/engine/rng.js';

/**
 * Dépendances déterministes : rng seedé, horloge pilotée à la main.
 */
export function makeDeps({ seed = 1, start = 1_000_000, words = ['Château', 'Abeille', 'Piano'] } = {}) {
    let t = start;
    return {
        deps: { rng: mulberry32(seed), now: () => t, words },
        advance: (ms) => { t += ms; },
        at: () => t
    };
}

/** Applique des commandes qui doivent toutes réussir, renvoie l'état final. */
export function run(game, deps, ...commands) {
    let current = game;
    for (const command of commands) {
        const r = apply(current, command, deps);
        assert.ok(r.ok, `${command.type} devait réussir, reçu ${r.ok ? '' : `${r.error}: ${r.message}`}`);
        current = r.game;
    }
    return current;
}

/** Applique une commande qui doit échouer avec le code attendu. */
export function expectFail(game, deps, command, error) {
    const r = apply(game, command, deps);
    assert.equal(r.ok, false, `${command.type} devait échouer avec ${error}`);
    assert.equal(r.error, error, `${command.type} : code ${r.error} au lieu de ${error} (${r.message})`);
    return r;
}

/** Un lobby de n joueurs p1..pn, p1 est l'hôte. */
export function lobby(n, { settings = {}, ...depsOpts } = {}) {
    const { deps, advance, at } = makeDeps(depsOpts);
    let game = createGame(settings);
    for (let i = 1; i <= n; i++) {
        game = run(game, deps, { type: 'addPlayer', actor: SERVER, id: `p${i}`, name: `Joueur ${i}`, isHost: i === 1 });
    }
    return { game, deps, advance, at, host: 'p1' };
}

export function roleOf(game, role) {
    return Object.keys(game.roles ?? {}).find((id) => game.roles[id] === role);
}

export function withRole(game, role) {
    return Object.keys(game.roles ?? {}).filter((id) => game.roles[id] === role);
}

/** Manche lancée, en phase roles. `insider` peut être undefined si la carte du centre est le Traître. */
export function started(n, opts) {
    const ctx = lobby(n, opts);
    const game = run(ctx.game, ctx.deps, { type: 'startRound', actor: ctx.host });
    return { ...ctx, game, master: roleOf(game, 'master'), insider: roleOf(game, 'insider'), commons: withRole(game, 'common') };
}

/**
 * Amène en phase vote1 après 60 s de jeu. finder : 'common' (défaut) ou 'insider'.
 * Pour garantir qu'un insider est en jeu, passer settings: { traitorOptional: false }.
 */
export function inVote1(n, { finder = 'common', ...opts } = {}) {
    const ctx = started(n, opts);
    const finderId = finder === 'insider' && ctx.insider ? ctx.insider : ctx.commons[0];
    let game = run(ctx.game, ctx.deps,
        { type: 'setWord', actor: ctx.master, word: 'Château' },
        { type: 'startTimer', actor: ctx.host });
    ctx.advance(60_000);
    game = run(game, ctx.deps,
        { type: 'wordFound', actor: ctx.master, finderId },
        { type: 'closeDiscussion', actor: ctx.master });
    return { ...ctx, game, finderId };
}

/** Amène en phase vote2 : tout le monde vote non au vote 1. */
export function inVote2(n, opts) {
    const ctx = inVote1(n, opts);
    const game = run(ctx.game, ctx.deps, ...ctx.game.players.map((p) => ({ type: 'vote1', actor: p.id, value: false })));
    return { ...ctx, game };
}
```

- [ ] **Step 3: Écrire les tests du lobby (échouent)**

`test/engine/lobby.test.js` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, apply, SERVER, DEFAULT_SETTINGS } from '../../src/engine/game.js';
import { makeDeps, lobby, run, expectFail } from './helpers.js';

test('createGame part en lobby, version 0, sans joueur, avec les défauts', () => {
    const game = createGame();
    assert.equal(game.phase.name, 'lobby');
    assert.equal(game.version, 0);
    assert.deepEqual(game.players, []);
    assert.equal(game.roles, null);
    assert.equal(game.centerCard, null);
    assert.equal(game.word, null);
    assert.deepEqual(game.settings, DEFAULT_SETTINGS);
});

test('createGame fusionne les settings fournis', () => {
    const game = createGame({ traitorOptional: false, timerMs: 1000 });
    assert.equal(game.settings.traitorOptional, false);
    assert.equal(game.settings.timerMs, 1000);
    assert.equal(game.settings.minPlayers, 4);
});

test('addPlayer ajoute dans l\'ordre d\'arrivée et incrémente la version', () => {
    const { game } = lobby(3);
    assert.deepEqual(game.players.map((p) => p.id), ['p1', 'p2', 'p3']);
    assert.equal(game.players[0].isHost, true);
    assert.equal(game.players[1].isHost, false);
    assert.equal(game.version, 3);
});

test('addPlayer refuse un nom vide, un nom en doublon, un id en doublon', () => {
    const { game, deps } = lobby(2);
    expectFail(game, deps, { type: 'addPlayer', actor: SERVER, id: 'p9', name: '   ' }, 'INVALID_ARGUMENT');
    expectFail(game, deps, { type: 'addPlayer', actor: SERVER, id: 'p9', name: 'Joueur 1' }, 'DUPLICATE_NAME');
    expectFail(game, deps, { type: 'addPlayer', actor: SERVER, id: 'p1', name: 'Autre' }, 'DUPLICATE_NAME');
});

test('addPlayer trim le nom', () => {
    const { deps } = makeDeps();
    const game = run(createGame(), deps, { type: 'addPlayer', actor: SERVER, id: 'a', name: '  Zoé  ' });
    assert.equal(game.players[0].name, 'Zoé');
});

test('addPlayer refuse au-delà du maximum, 7 avec la variante, 8 sans', () => {
    const withVariant = lobby(7);
    expectFail(withVariant.game, withVariant.deps, { type: 'addPlayer', actor: SERVER, id: 'p8', name: 'Huit' }, 'TOO_MANY_PLAYERS');
    const without = lobby(8, { settings: { traitorOptional: false } });
    assert.equal(without.game.players.length, 8);
    expectFail(without.game, without.deps, { type: 'addPlayer', actor: SERVER, id: 'p9', name: 'Neuf' }, 'TOO_MANY_PLAYERS');
});

test('addPlayer par un joueur est refusé, c\'est une commande serveur', () => {
    const { game, deps } = lobby(2);
    expectFail(game, deps, { type: 'addPlayer', actor: 'p1', id: 'p9', name: 'X' }, 'FORBIDDEN');
});

test('removePlayer retire le joueur, refuse un inconnu', () => {
    const { game, deps } = lobby(3);
    const next = run(game, deps, { type: 'removePlayer', actor: SERVER, id: 'p2' });
    assert.deepEqual(next.players.map((p) => p.id), ['p1', 'p3']);
    expectFail(next, deps, { type: 'removePlayer', actor: SERVER, id: 'p2' }, 'UNKNOWN_PLAYER');
});

test('reset en lobby est accepté par l\'hôte seul et laisse les joueurs', () => {
    const { game, deps } = lobby(3);
    expectFail(game, deps, { type: 'reset', actor: 'p2' }, 'FORBIDDEN');
    const next = run(game, deps, { type: 'reset', actor: 'p1' });
    assert.equal(next.phase.name, 'lobby');
    assert.equal(next.players.length, 3);
});

test('une commande inconnue renvoie INVALID_ARGUMENT', () => {
    const { game, deps } = lobby(2);
    const r = apply(game, /** @type {any} */ ({ type: 'dance', actor: 'p1' }), deps);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'INVALID_ARGUMENT');
});

test('un échec ne modifie pas l\'état d\'entrée', () => {
    const { game, deps } = lobby(2);
    const before = structuredClone(game);
    apply(game, { type: 'addPlayer', actor: SERVER, id: 'p1', name: 'Doublon' }, deps);
    assert.deepEqual(game, before);
});
```

- [ ] **Step 4: Vérifier que les tests échouent**

Run: `npm test`
Expected: échec, `game.js` introuvable.

- [ ] **Step 5: Écrire game.js (squelette, lobby, reset)**

```js
// src/engine/game.js
// Moteur pur du jeu Insider. Aucune I/O : le hasard et l'horloge viennent de `deps`.
// La machine d'états est ce réducteur : phase, puis acteur, puis arguments.

import { shuffle, pick } from './rng.js';

/** @typedef {import('./types.js').Game} Game */
/** @typedef {import('./types.js').Phase} Phase */
/** @typedef {import('./types.js').Command} Command */
/** @typedef {import('./types.js').CommandType} CommandType */
/** @typedef {import('./types.js').Deps} Deps */
/** @typedef {import('./types.js').Result} Result */
/** @typedef {import('./types.js').ErrorCode} ErrorCode */
/** @typedef {import('./types.js').Role} Role */
/** @typedef {import('./types.js').PlayerId} PlayerId */
/** @typedef {import('./types.js').CandidateId} CandidateId */
/** @typedef {import('./types.js').Settings} Settings */
/** @typedef {import('./types.js').Reason} Reason */

export const SERVER = 'server';
export const CENTER = 'center';

/** @type {Readonly<Settings>} */
export const DEFAULT_SETTINGS = Object.freeze({
    traitorOptional: true,
    timerMs: 300_000,
    minPlayers: 4,
    maxPlayers: 8
});

/**
 * @param {Partial<Settings>} [settings]
 * @returns {Game}
 */
export function createGame(settings = {}) {
    return {
        version: 0,
        settings: { ...DEFAULT_SETTINGS, ...settings },
        players: [],
        roles: null,
        centerCard: null,
        word: null,
        phase: { name: 'lobby' }
    };
}

/** @type {Phase['name'][]} */
const ALL_PHASES = ['lobby', 'roles', 'word', 'playing', 'discussion', 'vote1', 'vote2', 'tiebreak', 'ended'];

/** @type {Record<CommandType, Phase['name'][]>} */
const PHASES_BY_COMMAND = {
    addPlayer: ['lobby', 'ended'],
    removePlayer: ['lobby', 'ended'],
    startRound: ['lobby', 'ended'],
    setWord: ['roles'],
    drawWord: ['roles'],
    startTimer: ['word'],
    wordFound: ['playing'],
    timeout: ['playing'],
    closeDiscussion: ['discussion'],
    vote1: ['vote1'],
    vote2: ['vote2'],
    tiebreak: ['tiebreak'],
    reset: ALL_PHASES
};

/** @type {Set<CommandType>} */
const SERVER_ONLY = new Set(['addPlayer', 'removePlayer', 'timeout']);

/** @param {Game} game */
export function effectiveMaxPlayers(game) {
    return game.settings.traitorOptional ? Math.min(game.settings.maxPlayers, 7) : game.settings.maxPlayers;
}

/**
 * Candidats valides au vote 2 : joueurs non Maître, puis la carte du centre si la variante est active.
 * @param {Game} game
 * @returns {CandidateId[]}
 */
export function candidates(game) {
    const ids = game.players.filter((p) => game.roles?.[p.id] !== 'master').map((p) => p.id);
    return game.settings.traitorOptional ? [...ids, CENTER] : ids;
}

/**
 * Règle d'acteur seule, la phase est vérifiée à part.
 * @param {Game} game
 * @param {CommandType} type
 * @param {string} actor
 */
export function canAct(game, type, actor) {
    const player = game.players.find((p) => p.id === actor);
    const isHost = Boolean(player?.isHost);
    const isMaster = game.roles?.[actor] === 'master';
    switch (type) {
        case 'addPlayer':
        case 'removePlayer':
        case 'timeout':
            return actor === SERVER;
        case 'startRound':
        case 'reset':
            return isHost;
        case 'setWord':
        case 'drawWord':
            return isMaster;
        case 'startTimer':
        case 'wordFound':
        case 'closeDiscussion':
            return isMaster || isHost;
        case 'vote1':
        case 'vote2':
            return Boolean(player);
        case 'tiebreak':
            return game.phase.name === 'tiebreak' && game.phase.finderId === actor;
        default:
            return false;
    }
}

/**
 * Commandes qu'un joueur peut émettre maintenant. Jamais les commandes serveur.
 * Un joueur qui a déjà un bulletin dans la phase courante ne voit plus vote1 / vote2 :
 * `apply` accepte encore le remplacement (idempotence des rejeux), mais l'UI n'a plus à le proposer.
 * @param {Game} game
 * @param {PlayerId} playerId
 * @returns {CommandType[]}
 */
export function allowedActions(game, playerId) {
    const hasVoted = 'ballots' in game.phase && playerId in game.phase.ballots;
    return /** @type {CommandType[]} */ (Object.keys(PHASES_BY_COMMAND)).filter((type) =>
        !SERVER_ONLY.has(type)
        && PHASES_BY_COMMAND[type].includes(game.phase.name)
        && canAct(game, type, playerId)
        && !(hasVoted && (type === 'vote1' || type === 'vote2')));
}

/**
 * @param {Game} game
 * @param {Command} command
 * @param {Deps} deps
 * @returns {Result}
 */
export function apply(game, command, deps) {
    const phases = PHASES_BY_COMMAND[command.type];
    if (!phases) {
        return fail('INVALID_ARGUMENT', `unknown command ${String(command.type)}`);
    }
    if (!phases.includes(game.phase.name)) {
        return fail('WRONG_PHASE', `${command.type} is not allowed in phase ${game.phase.name}`);
    }
    if (!canAct(game, command.type, command.actor)) {
        return fail('FORBIDDEN', `${command.actor} cannot ${command.type}`);
    }
    return HANDLERS[command.type](game, /** @type {any} */ (command), deps);
}

// Helpers de résultat

/**
 * @param {Game} game
 * @param {Partial<Omit<Game, 'version'|'settings'>>} patch
 * @returns {Result}
 */
function next(game, patch) {
    return { ok: true, game: { ...game, ...patch, version: game.version + 1 } };
}

/**
 * @param {ErrorCode} error
 * @param {string} message
 * @returns {Result}
 */
function fail(error, message) {
    return { ok: false, error, message };
}

// Handlers du lobby

/**
 * @param {Game} game
 * @param {Extract<Command, {type: 'addPlayer'}>} command
 * @returns {Result}
 */
function addPlayer(game, command) {
    const name = String(command.name ?? '').trim();
    if (name === '') {
        return fail('INVALID_ARGUMENT', 'player name is empty');
    }
    if (game.players.some((p) => p.id === command.id || p.name === name)) {
        return fail('DUPLICATE_NAME', `player ${command.id} / ${name} already exists`);
    }
    if (game.players.length >= effectiveMaxPlayers(game)) {
        return fail('TOO_MANY_PLAYERS', `max ${effectiveMaxPlayers(game)} players`);
    }
    return next(game, { players: [...game.players, { id: command.id, name, isHost: Boolean(command.isHost) }] });
}

/**
 * @param {Game} game
 * @param {Extract<Command, {type: 'removePlayer'}>} command
 * @returns {Result}
 */
function removePlayer(game, command) {
    if (!game.players.some((p) => p.id === command.id)) {
        return fail('UNKNOWN_PLAYER', `no player ${command.id}`);
    }
    return next(game, { players: game.players.filter((p) => p.id !== command.id) });
}

/**
 * @param {Game} game
 * @returns {Result}
 */
function reset(game) {
    return next(game, { roles: null, centerCard: null, word: null, phase: { name: 'lobby' } });
}

/** @returns {Result} */
function notImplemented() {
    return fail('INVALID_ARGUMENT', 'not implemented');
}

/** @type {Record<CommandType, (game: Game, command: any, deps: Deps) => Result>} */
const HANDLERS = {
    addPlayer,
    removePlayer,
    reset,
    startRound: notImplemented,
    setWord: notImplemented,
    drawWord: notImplemented,
    startTimer: notImplemented,
    wordFound: notImplemented,
    timeout: notImplemented,
    closeDiscussion: notImplemented,
    vote1: notImplemented,
    vote2: notImplemented,
    tiebreak: notImplemented
};

// Exporté pour les tests de grille et la vue.
export { PHASES_BY_COMMAND, ALL_PHASES };

// shuffle et pick sont utilisés par startRound et drawWord (tâches suivantes).
void shuffle;
void pick;
```

- [ ] **Step 6: Vérifier tests, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: les tests de rng et lobby passent (16 au total), tsc silencieux, eslint sans erreur.

- [ ] **Step 7: Commit**

```bash
git add src/engine/types.js src/engine/game.js test/engine/helpers.js test/engine/lobby.test.js
git commit -m "feat(engine): types, createGame, apply skeleton, lobby commands

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: startRound et distribution des rôles

**Files:**
- Modify: `src/engine/game.js` (remplacer `startRound: notImplemented`, ajouter `assignRoles` et `startRound`, retirer `void shuffle`)
- Create: `test/engine/roles.test.js`

**Interfaces:**
- Consumes: `shuffle` de `rng.js`, `next`, `fail`, `effectiveMaxPlayers` de la Task 2
- Produces: après `startRound`, `game.roles` a exactement un `'master'`, `game.centerCard` vaut `null` sans variante et `'insider'|'common'` avec, `game.word === null`, `game.phase = { name: 'roles' }`

- [ ] **Step 1: Écrire les tests (échouent)**

`test/engine/roles.test.js` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, apply, SERVER } from '../../src/engine/game.js';
import { mulberry32 } from '../../src/engine/rng.js';
import { lobby, started, run, expectFail, withRole } from './helpers.js';

test('startRound distribue un Maître, un Traître, le reste Citoyens, sans variante', () => {
    for (const n of [4, 8]) {
        const { game } = started(n, { settings: { traitorOptional: false } });
        assert.equal(game.phase.name, 'roles');
        assert.equal(game.word, null);
        assert.equal(game.centerCard, null);
        assert.equal(withRole(game, 'master').length, 1);
        assert.equal(withRole(game, 'insider').length, 1);
        assert.equal(withRole(game, 'common').length, n - 2);
        assert.equal(Object.keys(game.roles).length, n);
    }
});

test('startRound avec variante : la carte du centre est tirée, un seul Traître entre joueurs et centre', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const { game } = started(5, { seed });
        assert.equal(withRole(game, 'master').length, 1);
        assert.ok(game.centerCard === 'insider' || game.centerCard === 'common');
        const insiders = withRole(game, 'insider').length + (game.centerCard === 'insider' ? 1 : 0);
        assert.equal(insiders, 1, `seed ${seed}`);
        assert.equal(Object.keys(game.roles).length, 5);
    }
});

test('le Maître n\'est jamais la carte du centre et tous les joueurs ont un rôle', () => {
    for (const seed of [11, 12, 13, 14, 15]) {
        const { game } = started(6, { seed });
        assert.notEqual(game.centerCard, 'master');
        for (const p of game.players) {
            assert.ok(['master', 'insider', 'common'].includes(game.roles[p.id]));
        }
    }
});

test('la carte du centre est le Traître avec une fréquence proche de 1/(n-1)', () => {
    const n = 6;
    const trials = 1000;
    let centerInsider = 0;
    for (let seed = 1; seed <= trials; seed++) {
        const { game } = started(n, { seed });
        if (game.centerCard === 'insider') {
            centerInsider += 1;
        }
    }
    const freq = centerInsider / trials;
    const expected = 1 / (n - 1);
    assert.ok(Math.abs(freq - expected) < expected * 0.2, `fréquence ${freq}, attendu ${expected}`);
});

test('startRound refuse sous minPlayers et pour un non hôte', () => {
    const { game, deps } = lobby(3);
    expectFail(game, deps, { type: 'startRound', actor: 'p1' }, 'TOO_FEW_PLAYERS');
    const four = lobby(4);
    expectFail(four.game, four.deps, { type: 'startRound', actor: 'p2' }, 'FORBIDDEN');
});

test('startRound depuis ended relance une manche et remet le mot à null', () => {
    const { game, deps, host } = started(4);
    const ended = { ...game, phase: /** @type {const} */ ({ name: 'ended', outcome: 'allLose', reason: 'timeout', finderId: null, tallies: null, pointed: null }), word: 'Ancien' };
    const again = run(ended, deps, { type: 'startRound', actor: host });
    assert.equal(again.phase.name, 'roles');
    assert.equal(again.word, null);
    assert.equal(withRole(again, 'master').length, 1);
});

test('startRound est déterministe pour une seed donnée', () => {
    const a = started(6, { seed: 99 });
    const b = started(6, { seed: 99 });
    assert.deepEqual(a.game.roles, b.game.roles);
    assert.equal(a.game.centerCard, b.game.centerCard);
});

test('startRound ne mute pas l\'état d\'entrée', () => {
    const { game, deps } = lobby(4);
    const before = structuredClone(game);
    const r = apply(game, { type: 'startRound', actor: 'p1' }, deps);
    assert.ok(r.ok);
    assert.deepEqual(game, before);
});

test('addPlayer en phase roles est refusé (WRONG_PHASE)', () => {
    const { game, deps } = started(4);
    expectFail(game, deps, { type: 'addPlayer', actor: SERVER, id: 'p9', name: 'Tard' }, 'WRONG_PHASE');
});

test('mulberry32 alimente bien le tirage : deux seeds donnent des Maîtres différents sur 20 essais', () => {
    const masters = new Set();
    for (let seed = 1; seed <= 20; seed++) {
        const g = createGame({ traitorOptional: false });
        const deps = { rng: mulberry32(seed), now: () => 0, words: ['x'] };
        let game = g;
        for (let i = 1; i <= 4; i++) {
            game = run(game, deps, { type: 'addPlayer', actor: SERVER, id: `p${i}`, name: `J${i}`, isHost: i === 1 });
        }
        game = run(game, deps, { type: 'startRound', actor: 'p1' });
        masters.add(withRole(game, 'master')[0]);
    }
    assert.ok(masters.size > 1);
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npm test`
Expected: les tests de roles échouent avec `startRound devait réussir, reçu INVALID_ARGUMENT: not implemented`.

- [ ] **Step 3: Implémenter assignRoles et startRound**

Dans `src/engine/game.js`, avant `/** @type {Record<CommandType, ...>} const HANDLERS`, ajouter :

```js
// Manche

/**
 * Distribution officielle. Sans variante : un insider parmi les non Maîtres.
 * Avec variante : parmi les n-1 cartes (1 insider, n-2 common) on en retire une au hasard vers le
 * centre et on la remplace par une common, d'où P(centre = insider) = 1/(n-1).
 * @param {Game} game
 * @param {() => number} rng
 * @returns {{ roles: Record<PlayerId, Role>, centerCard: Role|null }}
 */
function assignRoles(game, rng) {
    const order = shuffle(game.players.map((p) => p.id), rng);
    const masterId = order[0];
    const others = order.slice(1);
    /** @type {Role[]} */
    let cards = ['insider', ...Array(others.length - 1).fill('common')];
    /** @type {Role|null} */
    let centerCard = null;
    if (game.settings.traitorOptional) {
        cards = shuffle(cards, rng);
        centerCard = /** @type {Role} */ (cards.pop());
        cards.push('common');
    }
    cards = shuffle(cards, rng);
    /** @type {Record<PlayerId, Role>} */
    const roles = { [masterId]: 'master' };
    others.forEach((id, i) => {
        roles[id] = cards[i];
    });
    return { roles, centerCard };
}

/**
 * @param {Game} game
 * @param {Extract<Command, {type: 'startRound'}>} _command
 * @param {Deps} deps
 * @returns {Result}
 */
function startRound(game, _command, deps) {
    if (game.players.length < game.settings.minPlayers) {
        return fail('TOO_FEW_PLAYERS', `need at least ${game.settings.minPlayers} players`);
    }
    if (game.players.length > effectiveMaxPlayers(game)) {
        return fail('TOO_MANY_PLAYERS', `max ${effectiveMaxPlayers(game)} players`);
    }
    const { roles, centerCard } = assignRoles(game, deps.rng);
    return next(game, { roles, centerCard, word: null, phase: { name: 'roles' } });
}
```

Dans `HANDLERS`, remplacer `startRound: notImplemented,` par `startRound,`. Supprimer la ligne `void shuffle;`.

- [ ] **Step 4: Vérifier tests, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tout vert. Le test de fréquence tourne 1000 manches, il doit rester sous la seconde.

- [ ] **Step 5: Commit**

```bash
git add src/engine/game.js test/engine/roles.test.js
git commit -m "feat(engine): startRound with official role distribution and center card

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Déroulé de la manche, du mot à la discussion

**Files:**
- Modify: `src/engine/game.js` (setWord, drawWord, startTimer, wordFound, timeout, closeDiscussion ; retirer `void pick`)
- Create: `test/engine/flow.test.js`

**Interfaces:**
- Consumes: `pick`, `next`, `fail`, `started` (helpers)
- Produces: transitions `roles -> word -> playing -> discussion -> vote1` et `playing -> ended (timeout)`. En `vote1` la phase est `{ name: 'vote1', finderId, ballots: {} }`

- [ ] **Step 1: Écrire les tests (échouent)**

`test/engine/flow.test.js` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SERVER } from '../../src/engine/game.js';
import { started, run, expectFail } from './helpers.js';

test('setWord par le Maître fixe le mot et passe en word', () => {
    const { game, deps, master } = started(4);
    const next = run(game, deps, { type: 'setWord', actor: master, word: '  Château ' });
    assert.equal(next.phase.name, 'word');
    assert.equal(next.word, 'Château');
});

test('setWord refuse un mot vide et un acteur qui n\'est pas le Maître', () => {
    const { game, deps, master, commons, host } = started(4);
    expectFail(game, deps, { type: 'setWord', actor: master, word: '   ' }, 'INVALID_ARGUMENT');
    expectFail(game, deps, { type: 'setWord', actor: commons[0], word: 'X' }, 'FORBIDDEN');
    if (host !== master) {
        expectFail(game, deps, { type: 'setWord', actor: host, word: 'X' }, 'FORBIDDEN');
    }
});

test('drawWord tire dans deps.words via le rng', () => {
    const { game, deps, master } = started(4, { words: ['Seul'] });
    const next = run(game, deps, { type: 'drawWord', actor: master });
    assert.equal(next.phase.name, 'word');
    assert.equal(next.word, 'Seul');
});

test('drawWord refuse une liste de mots vide', () => {
    const { game, deps, master } = started(4, { words: [] });
    expectFail(game, deps, { type: 'drawWord', actor: master }, 'INVALID_ARGUMENT');
});

test('startTimer par le Maître ou l\'hôte ouvre playing avec la deadline', () => {
    const { game, deps, master, host, at } = started(4, { settings: { timerMs: 1000 } });
    const inWord = run(game, deps, { type: 'setWord', actor: master, word: 'A' });
    for (const actor of new Set([master, host])) {
        const playing = run(inWord, deps, { type: 'startTimer', actor });
        assert.equal(playing.phase.name, 'playing');
        assert.deepEqual(playing.phase, { name: 'playing', startedAt: at(), deadline: at() + 1000 });
    }
});

test('startTimer par un Citoyen non hôte est refusé', () => {
    const { game, deps, master, commons, host } = started(5);
    const inWord = run(game, deps, { type: 'setWord', actor: master, word: 'A' });
    const citizen = commons.find((id) => id !== host) ?? commons[0];
    if (citizen !== host) {
        expectFail(inWord, deps, { type: 'startTimer', actor: citizen }, 'FORBIDDEN');
    }
});

test('startTimer rejoué en playing est refusé (WRONG_PHASE), le chrono ne repart pas', () => {
    const { game, deps, master, host, advance } = started(4);
    const playing = run(game, deps, { type: 'setWord', actor: master, word: 'A' }, { type: 'startTimer', actor: host });
    advance(10_000);
    expectFail(playing, deps, { type: 'startTimer', actor: host }, 'WRONG_PHASE');
});

test('wordFound passe en discussion avec le trouveur et une deadline égale au temps consommé', () => {
    const { game, deps, master, host, commons, advance, at } = started(4);
    const playing = run(game, deps, { type: 'setWord', actor: master, word: 'A' }, { type: 'startTimer', actor: host });
    advance(90_000);
    const disc = run(playing, deps, { type: 'wordFound', actor: master, finderId: commons[0] });
    assert.equal(disc.phase.name, 'discussion');
    assert.deepEqual(disc.phase, { name: 'discussion', finderId: commons[0], startedAt: at(), deadline: at() + 90_000 });
});

test('wordFound refuse le Maître comme trouveur et un joueur inconnu', () => {
    const { game, deps, master, host } = started(4);
    const playing = run(game, deps, { type: 'setWord', actor: master, word: 'A' }, { type: 'startTimer', actor: host });
    expectFail(playing, deps, { type: 'wordFound', actor: master, finderId: master }, 'INVALID_ARGUMENT');
    expectFail(playing, deps, { type: 'wordFound', actor: master, finderId: 'nobody' }, 'INVALID_ARGUMENT');
});

test('timeout est refusé avant la deadline (NOT_YET) et termine en allLose après', () => {
    const { game, deps, master, host, advance } = started(4, { settings: { timerMs: 5000 } });
    const playing = run(game, deps, { type: 'setWord', actor: master, word: 'A' }, { type: 'startTimer', actor: host });
    advance(4999);
    expectFail(playing, deps, { type: 'timeout', actor: SERVER }, 'NOT_YET');
    advance(1);
    const ended = run(playing, deps, { type: 'timeout', actor: SERVER });
    assert.deepEqual(ended.phase, { name: 'ended', outcome: 'allLose', reason: 'timeout', finderId: null, tallies: null, pointed: null });
});

test('timeout par un joueur est refusé', () => {
    const { game, deps, master, host, advance } = started(4, { settings: { timerMs: 10 } });
    const playing = run(game, deps, { type: 'setWord', actor: master, word: 'A' }, { type: 'startTimer', actor: host });
    advance(100);
    expectFail(playing, deps, { type: 'timeout', actor: host }, 'FORBIDDEN');
});

test('closeDiscussion ouvre vote1 avec des bulletins vides', () => {
    const { game, deps, master, host, commons, advance } = started(4);
    const playing = run(game, deps, { type: 'setWord', actor: master, word: 'A' }, { type: 'startTimer', actor: host });
    advance(1000);
    const disc = run(playing, deps, { type: 'wordFound', actor: host, finderId: commons[0] });
    const v1 = run(disc, deps, { type: 'closeDiscussion', actor: master });
    assert.deepEqual(v1.phase, { name: 'vote1', finderId: commons[0], ballots: {} });
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npm test`
Expected: les tests de flow échouent sur `not implemented`.

- [ ] **Step 3: Implémenter les six handlers**

Dans `src/engine/game.js`, après `startRound`, ajouter :

```js
/**
 * @param {Game} game
 * @param {Extract<Command, {type: 'setWord'}>} command
 * @returns {Result}
 */
function setWord(game, command) {
    const word = String(command.word ?? '').trim();
    if (word === '') {
        return fail('INVALID_ARGUMENT', 'word is empty');
    }
    return next(game, { word, phase: { name: 'word' } });
}

/**
 * @param {Game} game
 * @param {Extract<Command, {type: 'drawWord'}>} _command
 * @param {Deps} deps
 * @returns {Result}
 */
function drawWord(game, _command, deps) {
    if (deps.words.length === 0) {
        return fail('INVALID_ARGUMENT', 'no words to draw from');
    }
    return next(game, { word: pick(deps.words, deps.rng), phase: { name: 'word' } });
}

/**
 * @param {Game} game
 * @param {Extract<Command, {type: 'startTimer'}>} _command
 * @param {Deps} deps
 * @returns {Result}
 */
function startTimer(game, _command, deps) {
    const now = deps.now();
    return next(game, { phase: { name: 'playing', startedAt: now, deadline: now + game.settings.timerMs } });
}

/**
 * @param {Game} game
 * @param {Extract<Command, {type: 'wordFound'}>} command
 * @param {Deps} deps
 * @returns {Result}
 */
function wordFound(game, command, deps) {
    if (game.phase.name !== 'playing') {
        return fail('WRONG_PHASE', 'not playing');
    }
    const finder = game.players.find((p) => p.id === command.finderId);
    if (!finder || game.roles?.[finder.id] === 'master') {
        return fail('INVALID_ARGUMENT', 'finder must be a non-master player');
    }
    const now = deps.now();
    const elapsed = now - game.phase.startedAt;
    return next(game, { phase: { name: 'discussion', finderId: finder.id, startedAt: now, deadline: now + elapsed } });
}

/**
 * @param {Game} game
 * @param {Extract<Command, {type: 'timeout'}>} _command
 * @param {Deps} deps
 * @returns {Result}
 */
function timeout(game, _command, deps) {
    if (game.phase.name !== 'playing') {
        return fail('WRONG_PHASE', 'not playing');
    }
    if (deps.now() < game.phase.deadline) {
        return fail('NOT_YET', 'deadline not reached');
    }
    return next(game, { phase: { name: 'ended', outcome: 'allLose', reason: 'timeout', finderId: null, tallies: null, pointed: null } });
}

/**
 * @param {Game} game
 * @returns {Result}
 */
function closeDiscussion(game) {
    if (game.phase.name !== 'discussion') {
        return fail('WRONG_PHASE', 'not in discussion');
    }
    return next(game, { phase: { name: 'vote1', finderId: game.phase.finderId, ballots: {} } });
}
```

Les gardes `if (game.phase.name !== ...)` dans `wordFound`, `timeout`, `closeDiscussion` sont redondantes avec la table `PHASES_BY_COMMAND` : elles servent au narrowing TypeScript de `game.phase`, pas à la logique.

Dans `HANDLERS`, remplacer les six `notImplemented` correspondants par `setWord, drawWord, startTimer, wordFound, timeout, closeDiscussion`. Supprimer la ligne `void pick;`.

- [ ] **Step 4: Vérifier tests, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tout vert.

- [ ] **Step 5: Commit**

```bash
git add src/engine/game.js test/engine/flow.test.js
git commit -m "feat(engine): word, timer, wordFound, timeout and discussion transitions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Vote 1 et résolution à la majorité stricte

**Files:**
- Modify: `src/engine/game.js` (vote1, resolveVote1)
- Create: `test/engine/vote1.test.js`

**Interfaces:**
- Consumes: `inVote1` (helpers), `next`, `fail`
- Produces: `vote1` pose ou remplace `ballots[actor]`. Quand `Object.keys(ballots).length === players.length` : si `oui > players.length / 2` alors `ended` (`commonsWin` si le trouveur est insider, sinon `insiderWins`, reason `vote1`, `pointed = finderId`, `tallies = { [finderId]: oui }`), sinon `{ name: 'vote2', finderId, ballots: {} }`

- [ ] **Step 1: Écrire les tests (échouent)**

`test/engine/vote1.test.js` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inVote1, run, expectFail } from './helpers.js';

const NO_VARIANT = { settings: { traitorOptional: false } };

function castAll(ctx, decide) {
    return run(ctx.game, ctx.deps, ...ctx.game.players.map((p, i) => ({ type: 'vote1', actor: p.id, value: decide(p.id, i) })));
}

test('vote1 pose un bulletin, le remplace sans doublon, et ne résout pas avant le dernier', () => {
    const ctx = inVote1(4);
    const [a, b] = ctx.game.players.map((p) => p.id);
    let game = run(ctx.game, ctx.deps, { type: 'vote1', actor: a, value: true });
    assert.deepEqual(game.phase.ballots, { [a]: true });
    game = run(game, ctx.deps, { type: 'vote1', actor: a, value: false });
    assert.deepEqual(game.phase.ballots, { [a]: false });
    game = run(game, ctx.deps, { type: 'vote1', actor: b, value: true });
    assert.equal(game.phase.name, 'vote1');
    assert.equal(Object.keys(game.phase.ballots).length, 2);
});

test('vote1 refuse une valeur non booléenne et un acteur inconnu', () => {
    const ctx = inVote1(4);
    expectFail(ctx.game, ctx.deps, { type: 'vote1', actor: 'p1', value: /** @type {any} */ ('oui') }, 'INVALID_ARGUMENT');
    expectFail(ctx.game, ctx.deps, { type: 'vote1', actor: 'ghost', value: true }, 'FORBIDDEN');
});

test('le Maître et le trouveur votent au vote 1', () => {
    const ctx = inVote1(4);
    const game = run(ctx.game, ctx.deps,
        { type: 'vote1', actor: ctx.master, value: true },
        { type: 'vote1', actor: ctx.finderId, value: false });
    assert.equal(game.phase.ballots[ctx.master], true);
    assert.equal(game.phase.ballots[ctx.finderId], false);
});

test('majorité stricte avec trouveur Traître : les Citoyens gagnent', () => {
    const ctx = inVote1(4, { finder: 'insider', ...NO_VARIANT });
    assert.equal(ctx.game.roles[ctx.finderId], 'insider');
    const ended = castAll(ctx, (_id, i) => i < 3);
    assert.equal(ended.phase.name, 'ended');
    assert.equal(ended.phase.outcome, 'commonsWin');
    assert.equal(ended.phase.reason, 'vote1');
    assert.equal(ended.phase.pointed, ctx.finderId);
    assert.deepEqual(ended.phase.tallies, { [ctx.finderId]: 3 });
});

test('majorité stricte avec trouveur Citoyen : le Traître gagne', () => {
    const ctx = inVote1(4, NO_VARIANT);
    assert.equal(ctx.game.roles[ctx.finderId], 'common');
    const ended = castAll(ctx, (_id, i) => i < 3);
    assert.equal(ended.phase.outcome, 'insiderWins');
    assert.equal(ended.phase.reason, 'vote1');
});

test('à 4 joueurs, 2 oui ne font pas la majorité : passage en vote2 avec bulletins vides', () => {
    const ctx = inVote1(4);
    const v2 = castAll(ctx, (_id, i) => i < 2);
    assert.deepEqual(v2.phase, { name: 'vote2', finderId: ctx.finderId, ballots: {} });
});

test('à 5 joueurs, 3 oui suffisent', () => {
    const ctx = inVote1(5, NO_VARIANT);
    const ended = castAll(ctx, (_id, i) => i < 3);
    assert.equal(ended.phase.name, 'ended');
});

test('à 6 joueurs, 3 oui ne suffisent pas, 4 oui suffisent', () => {
    const three = castAll(inVote1(6, NO_VARIANT), (_id, i) => i < 3);
    assert.equal(three.phase.name, 'vote2');
    const four = castAll(inVote1(6, NO_VARIANT), (_id, i) => i < 4);
    assert.equal(four.phase.name, 'ended');
});

test('la résolution se déclenche au dernier bulletin exactement', () => {
    const ctx = inVote1(4);
    const ids = ctx.game.players.map((p) => p.id);
    let game = run(ctx.game, ctx.deps, ...ids.slice(0, 3).map((id) => ({ type: 'vote1', actor: id, value: true })));
    assert.equal(game.phase.name, 'vote1');
    game = run(game, ctx.deps, { type: 'vote1', actor: ids[3], value: false });
    assert.equal(game.phase.name, 'ended');
});

test('un vote1 en phase vote2 est refusé et l\'état est intact', () => {
    const ctx = inVote1(4);
    const v2 = castAll(ctx, () => false);
    const before = structuredClone(v2);
    expectFail(v2, ctx.deps, { type: 'vote1', actor: 'p1', value: true }, 'WRONG_PHASE');
    assert.deepEqual(v2, before);
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npm test`
Expected: les tests de vote1 échouent sur `not implemented`.

- [ ] **Step 3: Implémenter vote1**

Dans `src/engine/game.js`, après `closeDiscussion`, ajouter :

```js
// Votes

/**
 * @param {Game} game
 * @param {Extract<Command, {type: 'vote1'}>} command
 * @returns {Result}
 */
function vote1(game, command) {
    if (game.phase.name !== 'vote1') {
        return fail('WRONG_PHASE', 'not in vote1');
    }
    if (typeof command.value !== 'boolean') {
        return fail('INVALID_ARGUMENT', 'vote1 value must be a boolean');
    }
    const ballots = { ...game.phase.ballots, [command.actor]: command.value };
    if (Object.keys(ballots).length < game.players.length) {
        return next(game, { phase: { ...game.phase, ballots } });
    }
    return resolveVote1(game, game.phase.finderId, ballots);
}

/**
 * Livret B-2 : majorité stricte des joueurs, Maître et trouveur inclus.
 * @param {Game} game
 * @param {PlayerId} finderId
 * @param {Record<PlayerId, boolean>} ballots
 * @returns {Result}
 */
function resolveVote1(game, finderId, ballots) {
    const yes = Object.values(ballots).filter(Boolean).length;
    if (yes > game.players.length / 2) {
        const outcome = game.roles?.[finderId] === 'insider' ? 'commonsWin' : 'insiderWins';
        return next(game, { phase: { name: 'ended', outcome, reason: 'vote1', finderId, tallies: { [finderId]: yes }, pointed: finderId } });
    }
    return next(game, { phase: { name: 'vote2', finderId, ballots: {} } });
}
```

Dans `HANDLERS`, remplacer `vote1: notImplemented,` par `vote1,`.

- [ ] **Step 4: Vérifier tests, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tout vert.

- [ ] **Step 5: Commit**

```bash
git add src/engine/game.js test/engine/vote1.test.js
git commit -m "feat(engine): vote 1 with strict majority resolution

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Vote 2, dépouillement, tiebreak, résolutions

**Files:**
- Modify: `src/engine/game.js` (vote2, tally, resolveVote2, tiebreak, resolveCandidate ; retirer `notImplemented`)
- Create: `test/engine/vote2.test.js`

**Interfaces:**
- Consumes: `candidates(game)`, `inVote2` (helpers)
- Produces: `vote2` pose ou remplace un bulletin vers un candidat valide. À complétion, `tallies` sur tous les candidats (0 inclus). Un seul maximum : `ended` (reason `vote2`). Plusieurs : `{ name: 'tiebreak', finderId, tied, tallies }`, `tied` dans l'ordre de `candidates(game)`. `tiebreak` par le trouveur, candidat dans `tied`, `ended` (reason `tiebreak`). Résolution d'un candidat pointé selon la spec

- [ ] **Step 1: Écrire les tests (échouent)**

`test/engine/vote2.test.js` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidates, CENTER } from '../../src/engine/game.js';
import { inVote2, run, expectFail } from './helpers.js';

const NO_VARIANT = { settings: { traitorOptional: false } };

/** Fait voter tout le monde selon `choose(playerId, index)`. */
function castAll(ctx, game, choose) {
    return run(game, ctx.deps, ...game.players.map((p, i) => ({ type: 'vote2', actor: p.id, candidate: choose(p.id, i) })));
}

test('candidates : joueurs non Maître dans l\'ordre d\'arrivée, puis center si variante', () => {
    const ctx = inVote2(5);
    const c = candidates(ctx.game);
    assert.equal(c.length, 5);
    assert.equal(c[c.length - 1], CENTER);
    assert.ok(!c.includes(ctx.master));
    const noVar = inVote2(5, NO_VARIANT);
    assert.equal(candidates(noVar.game).length, 4);
    assert.ok(!candidates(noVar.game).includes(CENTER));
});

test('vote2 refuse le Maître comme candidat, un inconnu, et center sans variante', () => {
    const ctx = inVote2(4, NO_VARIANT);
    expectFail(ctx.game, ctx.deps, { type: 'vote2', actor: 'p1', candidate: ctx.master }, 'INVALID_ARGUMENT');
    expectFail(ctx.game, ctx.deps, { type: 'vote2', actor: 'p1', candidate: 'nobody' }, 'INVALID_ARGUMENT');
    expectFail(ctx.game, ctx.deps, { type: 'vote2', actor: 'p1', candidate: CENTER }, 'INVALID_ARGUMENT');
});

test('vote2 pose et remplace un bulletin, le Maître vote', () => {
    const ctx = inVote2(4, NO_VARIANT);
    const [c0, c1] = candidates(ctx.game);
    let game = run(ctx.game, ctx.deps, { type: 'vote2', actor: ctx.master, candidate: c0 });
    assert.deepEqual(game.phase.ballots, { [ctx.master]: c0 });
    game = run(game, ctx.deps, { type: 'vote2', actor: ctx.master, candidate: c1 });
    assert.deepEqual(game.phase.ballots, { [ctx.master]: c1 });
});

test('pluralité : le Traître le plus pointé, les Citoyens gagnent, tallies complets', () => {
    const ctx = inVote2(4, NO_VARIANT);
    const ended = castAll(ctx, ctx.game, (_id, i) => (i < 3 ? ctx.insider : ctx.commons[0]));
    assert.equal(ended.phase.name, 'ended');
    assert.equal(ended.phase.outcome, 'commonsWin');
    assert.equal(ended.phase.reason, 'vote2');
    assert.equal(ended.phase.pointed, ctx.insider);
    assert.equal(ended.phase.tallies[ctx.insider], 3);
    assert.equal(ended.phase.tallies[ctx.commons[0]], 1);
    for (const c of candidates(ctx.game)) {
        assert.ok(c in ended.phase.tallies, `tallies doit contenir ${c}`);
    }
});

test('pluralité : un Citoyen le plus pointé sans variante, le Traître gagne', () => {
    const ctx = inVote2(4, NO_VARIANT);
    const ended = castAll(ctx, ctx.game, () => ctx.commons[0]);
    assert.equal(ended.phase.outcome, 'insiderWins');
    assert.equal(ended.phase.pointed, ctx.commons[0]);
});

test('variante, le centre est le Traître : pointer un Citoyen fait tout perdre, pointer le centre fait tout gagner', () => {
    let ctx;
    for (let seed = 1; seed < 200 && !ctx; seed++) {
        const candidate = inVote2(4, { seed });
        if (candidate.game.centerCard === 'insider') {
            ctx = candidate;
        }
    }
    assert.ok(ctx, 'aucune seed avec le Traître au centre');
    const lose = castAll(ctx, ctx.game, () => ctx.commons[0]);
    assert.equal(lose.phase.outcome, 'allLose');
    const win = castAll(ctx, ctx.game, () => CENTER);
    assert.equal(win.phase.outcome, 'allWin');
    assert.equal(win.phase.pointed, CENTER);
});

test('variante, le centre est un Citoyen : pointer le centre fait gagner le Traître', () => {
    let ctx;
    for (let seed = 1; seed < 200 && !ctx; seed++) {
        const candidate = inVote2(4, { seed });
        if (candidate.game.centerCard === 'common') {
            ctx = candidate;
        }
    }
    assert.ok(ctx, 'aucune seed avec un Citoyen au centre');
    const ended = castAll(ctx, ctx.game, () => CENTER);
    assert.equal(ended.phase.outcome, 'insiderWins');
});

test('un seul candidat : pas de plantage (ancien bug à 2 joueurs)', () => {
    // À 2 joueurs il n'y a pas de Citoyen : le trouveur est forcément le Traître.
    const ctx = inVote2(2, { finder: 'insider', settings: { traitorOptional: false, minPlayers: 2 } });
    assert.equal(candidates(ctx.game).length, 1);
    const ended = castAll(ctx, ctx.game, () => candidates(ctx.game)[0]);
    assert.equal(ended.phase.name, 'ended');
});

test('égalité : passage en tiebreak avec les ex aequo dans l\'ordre des candidats', () => {
    const ctx = inVote2(4, NO_VARIANT);
    const [c0, c1] = candidates(ctx.game);
    const tb = castAll(ctx, ctx.game, (_id, i) => (i < 2 ? c0 : c1));
    assert.equal(tb.phase.name, 'tiebreak');
    assert.deepEqual(tb.phase.tied, [c0, c1]);
    assert.equal(tb.phase.finderId, ctx.finderId);
    assert.equal(tb.phase.tallies[c0], 2);
    assert.equal(tb.phase.tallies[c1], 2);
});

test('tiebreak : seul le trouveur, seulement parmi les ex aequo, résout avec la raison tiebreak', () => {
    const ctx = inVote2(4, NO_VARIANT);
    const [c0, c1, c2] = candidates(ctx.game);
    const tb = castAll(ctx, ctx.game, (_id, i) => (i < 2 ? c0 : c1));
    const other = ctx.game.players.map((p) => p.id).find((id) => id !== ctx.finderId);
    expectFail(tb, ctx.deps, { type: 'tiebreak', actor: other, candidate: c0 }, 'FORBIDDEN');
    expectFail(tb, ctx.deps, { type: 'tiebreak', actor: ctx.finderId, candidate: c2 }, 'INVALID_ARGUMENT');
    const ended = run(tb, ctx.deps, { type: 'tiebreak', actor: ctx.finderId, candidate: c0 });
    assert.equal(ended.phase.name, 'ended');
    assert.equal(ended.phase.reason, 'tiebreak');
    assert.equal(ended.phase.pointed, c0);
    assert.equal(ended.phase.outcome, ctx.game.roles[c0] === 'insider' ? 'commonsWin' : 'insiderWins');
    assert.deepEqual(ended.phase.tallies, tb.phase.tallies);
});

test('les tallies sont dérivés des bulletins, un bulletin remplacé ne compte qu\'une fois', () => {
    const ctx = inVote2(4, NO_VARIANT);
    const [c0, c1] = candidates(ctx.game);
    const ids = ctx.game.players.map((p) => p.id);
    let game = run(ctx.game, ctx.deps,
        { type: 'vote2', actor: ids[0], candidate: c0 },
        { type: 'vote2', actor: ids[0], candidate: c1 },
        { type: 'vote2', actor: ids[1], candidate: c1 },
        { type: 'vote2', actor: ids[2], candidate: c1 },
        { type: 'vote2', actor: ids[3], candidate: c1 });
    assert.equal(game.phase.name, 'ended');
    assert.equal(game.phase.tallies[c0], 0);
    assert.equal(game.phase.tallies[c1], 4);
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npm test`
Expected: les tests de vote2 échouent sur `not implemented`.

- [ ] **Step 3: Implémenter vote2, tally, tiebreak, resolveCandidate**

Dans `src/engine/game.js`, après `resolveVote1`, ajouter :

```js
/**
 * @param {Game} game
 * @param {Extract<Command, {type: 'vote2'}>} command
 * @returns {Result}
 */
function vote2(game, command) {
    if (game.phase.name !== 'vote2') {
        return fail('WRONG_PHASE', 'not in vote2');
    }
    if (!candidates(game).includes(command.candidate)) {
        return fail('INVALID_ARGUMENT', `${String(command.candidate)} is not a valid candidate`);
    }
    const ballots = { ...game.phase.ballots, [command.actor]: command.candidate };
    if (Object.keys(ballots).length < game.players.length) {
        return next(game, { phase: { ...game.phase, ballots } });
    }
    return resolveVote2(game, game.phase.finderId, ballots);
}

/**
 * Dépouillement sur tous les candidats, zéro inclus.
 * @param {Game} game
 * @param {Record<PlayerId, CandidateId>} ballots
 * @returns {Record<CandidateId, number>}
 */
function tally(game, ballots) {
    /** @type {Record<CandidateId, number>} */
    const counts = Object.fromEntries(candidates(game).map((c) => [c, 0]));
    for (const c of Object.values(ballots)) {
        counts[c] = (counts[c] ?? 0) + 1;
    }
    return counts;
}

/**
 * Pluralité. Un seul maximum : résolution. Plusieurs : le trouveur départage.
 * @param {Game} game
 * @param {PlayerId} finderId
 * @param {Record<PlayerId, CandidateId>} ballots
 * @returns {Result}
 */
function resolveVote2(game, finderId, ballots) {
    const tallies = tally(game, ballots);
    const max = Math.max(...Object.values(tallies));
    const tied = candidates(game).filter((c) => tallies[c] === max);
    if (tied.length === 1) {
        return resolveCandidate(game, tied[0], 'vote2', finderId, tallies);
    }
    return next(game, { phase: { name: 'tiebreak', finderId, tied, tallies } });
}

/**
 * @param {Game} game
 * @param {Extract<Command, {type: 'tiebreak'}>} command
 * @returns {Result}
 */
function tiebreak(game, command) {
    if (game.phase.name !== 'tiebreak') {
        return fail('WRONG_PHASE', 'not in tiebreak');
    }
    if (!game.phase.tied.includes(command.candidate)) {
        return fail('INVALID_ARGUMENT', `${String(command.candidate)} is not among the tied candidates`);
    }
    return resolveCandidate(game, command.candidate, 'tiebreak', game.phase.finderId, game.phase.tallies);
}

/**
 * Issue d'un candidat pointé, ADR 0001.
 * @param {Game} game
 * @param {CandidateId} pointed
 * @param {Reason} reason
 * @param {PlayerId} finderId
 * @param {Record<CandidateId, number>} tallies
 * @returns {Result}
 */
function resolveCandidate(game, pointed, reason, finderId, tallies) {
    /** @type {import('./types.js').Outcome} */
    let outcome;
    if (pointed === CENTER) {
        outcome = game.centerCard === 'insider' ? 'allWin' : 'insiderWins';
    } else if (game.roles?.[pointed] === 'insider') {
        outcome = 'commonsWin';
    } else {
        outcome = game.centerCard === 'insider' ? 'allLose' : 'insiderWins';
    }
    return next(game, { phase: { name: 'ended', outcome, reason, finderId, tallies, pointed } });
}
```

Dans `HANDLERS`, remplacer `vote2: notImplemented,` et `tiebreak: notImplemented` par `vote2,` et `tiebreak`. Supprimer la fonction `notImplemented`.

- [ ] **Step 4: Vérifier tests, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tout vert.

- [ ] **Step 5: Commit**

```bash
git add src/engine/game.js test/engine/vote2.test.js
git commit -m "feat(engine): vote 2 tally, finder tiebreak and outcome resolution

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Grille phase x commande, immuabilité, version, reset

**Files:**
- Create: `test/engine/transitions.test.js`

**Interfaces:**
- Consumes: `PHASES_BY_COMMAND`, `ALL_PHASES`, `candidates`, `SERVER`, `CENTER` de `game.js`, et tous les helpers. Aucun code de production ajouté, sauf si un test révèle un écart

- [ ] **Step 1: Écrire les tests**

`test/engine/transitions.test.js` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, candidates, SERVER, CENTER, PHASES_BY_COMMAND, ALL_PHASES } from '../../src/engine/game.js';
import { lobby, started, inVote1, inVote2, run, expectFail } from './helpers.js';

const NO_VARIANT = { settings: { traitorOptional: false } };

/** Un contexte par phase, tous à 4 joueurs sans variante. */
function contexts() {
    const byPhase = {};
    byPhase.lobby = lobby(4, NO_VARIANT);
    byPhase.roles = started(4, NO_VARIANT);
    {
        const ctx = started(4, NO_VARIANT);
        byPhase.word = { ...ctx, game: run(ctx.game, ctx.deps, { type: 'setWord', actor: ctx.master, word: 'A' }) };
    }
    {
        const ctx = byPhase.word;
        byPhase.playing = { ...ctx, game: run(ctx.game, ctx.deps, { type: 'startTimer', actor: ctx.host }) };
    }
    {
        const ctx = byPhase.playing;
        ctx.advance(1000);
        byPhase.discussion = { ...ctx, game: run(ctx.game, ctx.deps, { type: 'wordFound', actor: ctx.master, finderId: ctx.commons[0] }) };
    }
    byPhase.vote1 = inVote1(4, NO_VARIANT);
    byPhase.vote2 = inVote2(4, NO_VARIANT);
    {
        const ctx = inVote2(4, NO_VARIANT);
        const [c0, c1] = candidates(ctx.game);
        const game = run(ctx.game, ctx.deps, ...ctx.game.players.map((p, i) => ({ type: 'vote2', actor: p.id, candidate: i < 2 ? c0 : c1 })));
        byPhase.tiebreak = { ...ctx, game };
    }
    {
        const ctx = started(4, { ...NO_VARIANT, settings: { ...NO_VARIANT.settings, timerMs: 10 } });
        let game = run(ctx.game, ctx.deps, { type: 'setWord', actor: ctx.master, word: 'A' }, { type: 'startTimer', actor: ctx.host });
        ctx.advance(10);
        game = run(game, ctx.deps, { type: 'timeout', actor: SERVER });
        byPhase.ended = { ...ctx, game };
    }
    return byPhase;
}

/** Une commande plausible de chaque type pour un contexte donné. */
function sample(type, ctx) {
    const game = ctx.game;
    const master = game.roles ? Object.keys(game.roles).find((id) => game.roles[id] === 'master') : ctx.host;
    const finderId = 'finderId' in game.phase ? game.phase.finderId : 'p2';
    const cands = game.roles ? candidates(game) : [];
    switch (type) {
        case 'addPlayer': return { type, actor: SERVER, id: 'p9', name: 'Neuf' };
        case 'removePlayer': return { type, actor: SERVER, id: 'p4' };
        case 'timeout': return { type, actor: SERVER };
        case 'startRound': return { type, actor: ctx.host };
        case 'reset': return { type, actor: ctx.host };
        case 'setWord': return { type, actor: master, word: 'Mot' };
        case 'drawWord': return { type, actor: master };
        case 'startTimer': return { type, actor: master };
        case 'wordFound': return { type, actor: master, finderId: game.players.find((p) => p.id !== master).id };
        case 'closeDiscussion': return { type, actor: master };
        case 'vote1': return { type, actor: 'p1', value: true };
        case 'vote2': return { type, actor: 'p1', candidate: cands[0] ?? 'p2' };
        case 'tiebreak': return { type, actor: finderId, candidate: 'tied' in game.phase ? game.phase.tied[0] : cands[0] ?? 'p2' };
        default: throw new Error(`no sample for ${type}`);
    }
}

test('la table couvre toutes les commandes et toutes les phases', () => {
    assert.deepEqual(ALL_PHASES, ['lobby', 'roles', 'word', 'playing', 'discussion', 'vote1', 'vote2', 'tiebreak', 'ended']);
    assert.deepEqual(Object.keys(PHASES_BY_COMMAND).sort(), [
        'addPlayer', 'closeDiscussion', 'drawWord', 'removePlayer', 'reset', 'setWord', 'startRound',
        'startTimer', 'tiebreak', 'timeout', 'vote1', 'vote2', 'wordFound'
    ]);
});

test('chaque commande hors phase est refusée WRONG_PHASE et l\'état est intact', () => {
    const byPhase = contexts();
    for (const phase of ALL_PHASES) {
        const ctx = byPhase[phase];
        assert.equal(ctx.game.phase.name, phase, `contexte ${phase}`);
        for (const type of Object.keys(PHASES_BY_COMMAND)) {
            if (PHASES_BY_COMMAND[type].includes(phase)) {
                continue;
            }
            const before = structuredClone(ctx.game);
            const r = apply(ctx.game, sample(type, ctx), ctx.deps);
            assert.equal(r.ok, false, `${type} en ${phase} devait échouer`);
            assert.equal(r.error, 'WRONG_PHASE', `${type} en ${phase} : ${r.error}`);
            assert.deepEqual(ctx.game, before, `${type} en ${phase} a muté l'état`);
        }
    }
});

test('chaque commande dans sa phase par le mauvais acteur est refusée FORBIDDEN', () => {
    const byPhase = contexts();
    const wrongActor = { server: 'p1', player: SERVER };
    for (const type of Object.keys(PHASES_BY_COMMAND)) {
        const phase = PHASES_BY_COMMAND[type][0];
        const ctx = byPhase[phase];
        const cmd = sample(type, ctx);
        const actor = cmd.actor === SERVER ? wrongActor.server : wrongActor.player;
        expectFail(ctx.game, ctx.deps, { ...cmd, actor }, 'FORBIDDEN');
    }
});

test('reset depuis chaque phase ramène en lobby avec les mêmes joueurs et sans secret', () => {
    const byPhase = contexts();
    for (const phase of ALL_PHASES) {
        const ctx = byPhase[phase];
        const back = run(ctx.game, ctx.deps, { type: 'reset', actor: ctx.host });
        assert.equal(back.phase.name, 'lobby', `reset depuis ${phase}`);
        assert.deepEqual(back.players, ctx.game.players);
        assert.equal(back.roles, null);
        assert.equal(back.centerCard, null);
        assert.equal(back.word, null);
        assert.equal(back.version, ctx.game.version + 1);
    }
});

test('version augmente de 1 par transition acceptée, jamais sur refus', () => {
    const ctx = lobby(4, NO_VARIANT);
    const v = ctx.game.version;
    const r1 = apply(ctx.game, { type: 'startRound', actor: 'p2' }, ctx.deps);
    assert.equal(r1.ok, false);
    assert.equal(ctx.game.version, v);
    const g1 = run(ctx.game, ctx.deps, { type: 'startRound', actor: 'p1' });
    assert.equal(g1.version, v + 1);
});

test('une transition acceptée ne mute pas l\'état d\'entrée, y compris en profondeur', () => {
    const ctx = inVote2(4, NO_VARIANT);
    const before = structuredClone(ctx.game);
    const r = apply(ctx.game, { type: 'vote2', actor: 'p1', candidate: candidates(ctx.game)[0] }, ctx.deps);
    assert.ok(r.ok);
    assert.deepEqual(ctx.game, before);
    assert.notEqual(r.game.phase, ctx.game.phase);
});

test('center n\'est jamais un joueur', () => {
    const ctx = inVote2(5);
    assert.ok(!ctx.game.players.some((p) => p.id === CENTER));
    assert.ok(candidates(ctx.game).includes(CENTER));
});
```

- [ ] **Step 2: Lancer les tests**

Run: `npm test`
Expected: tout vert. Si un cas de la grille échoue, c'est un écart entre la table `PHASES_BY_COMMAND`, `canAct` et les handlers : corriger dans `game.js`, pas dans le test, sauf si le `sample` produit une commande invalide pour une autre raison qu'une mauvaise phase (dans ce cas ajuster `sample`).

- [ ] **Step 3: Typecheck et lint**

Run: `npm run typecheck && npm run lint`
Expected: silencieux.

- [ ] **Step 4: Commit**

```bash
git add test/engine/transitions.test.js src/engine/game.js
git commit -m "test(engine): phase x command grid, immutability, version and reset

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: La vue

**Files:**
- Create: `src/engine/view.js`
- Create: `test/engine/view.test.js`

**Interfaces:**
- Consumes: `allowedActions`, `candidates`, `CENTER` de `game.js`, typedef `View` de `types.js`
- Produces: `view(game, playerId): View`, `CENTER_LABEL = 'Pas de Traître'`. Lève `Error` si `playerId` est inconnu

- [ ] **Step 1: Écrire les tests (échouent)**

`test/engine/view.test.js` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidates, CENTER } from '../../src/engine/game.js';
import { view, CENTER_LABEL } from '../../src/engine/view.js';
import { lobby, started, inVote1, inVote2, run } from './helpers.js';

const NO_VARIANT = { settings: { traitorOptional: false } };

function toWord(ctx) {
    return run(ctx.game, ctx.deps, { type: 'setWord', actor: ctx.master, word: 'Château' });
}

test('view en lobby : pas de rôle, pas de mot, actions de l\'hôte seulement', () => {
    const { game } = lobby(4);
    const host = view(game, 'p1');
    assert.equal(host.phase, 'lobby');
    assert.equal(host.me.role, null);
    assert.equal(host.word, null);
    assert.deepEqual(host.actions.sort(), ['reset', 'startRound']);
    const guest = view(game, 'p2');
    assert.deepEqual(guest.actions, []);
    assert.equal(guest.players.length, 4);
    assert.deepEqual(guest.players.map((p) => p.id), ['p1', 'p2', 'p3', 'p4']);
});

test('view lève une erreur pour un joueur inconnu', () => {
    const { game } = lobby(4);
    assert.throws(() => view(game, 'nobody'), /unknown player/);
});

test('en roles chacun voit son rôle et jamais celui des autres, le mot est null', () => {
    const ctx = started(4, NO_VARIANT);
    for (const p of ctx.game.players) {
        const v = view(ctx.game, p.id);
        assert.equal(v.me.role, ctx.game.roles[p.id]);
        assert.equal(v.word, null);
        for (const other of v.players) {
            assert.ok(!('role' in other), 'les autres joueurs n\'exposent pas de rôle');
        }
    }
    assert.deepEqual(view(ctx.game, ctx.master).actions.sort(), ['drawWord', 'setWord', ...(ctx.master === ctx.host ? ['reset'] : [])].sort());
});

test('dès word, le Maître et le Traître voient le mot, les Citoyens non', () => {
    const ctx = started(4, NO_VARIANT);
    const game = toWord(ctx);
    assert.equal(view(game, ctx.master).word, 'Château');
    assert.equal(view(game, ctx.insider).word, 'Château');
    for (const c of ctx.commons) {
        assert.equal(view(game, c).word, null);
    }
});

test('en playing et discussion, timer exposé à tous, finder exposé en discussion', () => {
    const ctx = started(4, NO_VARIANT);
    const playing = run(toWord(ctx), ctx.deps, { type: 'startTimer', actor: ctx.host });
    const vp = view(playing, ctx.commons[0]);
    assert.deepEqual(vp.timer, { startedAt: playing.phase.startedAt, deadline: playing.phase.deadline });
    assert.equal(vp.finder, null);
    ctx.advance(5000);
    const disc = run(playing, ctx.deps, { type: 'wordFound', actor: ctx.master, finderId: ctx.commons[0] });
    const vd = view(disc, ctx.master);
    assert.deepEqual(vd.finder, { id: ctx.commons[0], name: disc.players.find((p) => p.id === ctx.commons[0]).name });
    assert.ok(vd.timer && vd.timer.deadline > vd.timer.startedAt);
});

test('en vote1 : action vote1 pour qui n\'a pas voté, hasVoted juste, candidates null', () => {
    const ctx = inVote1(4);
    const [a, b] = ctx.game.players.map((p) => p.id);
    const game = run(ctx.game, ctx.deps, { type: 'vote1', actor: a, value: true });
    const va = view(game, a);
    const vb = view(game, b);
    assert.equal(va.me.hasVoted, true);
    assert.equal(vb.me.hasVoted, false);
    assert.ok(!va.actions.includes('vote1'), 'qui a voté ne voit plus l\'action');
    assert.ok(vb.actions.includes('vote1'));
    assert.equal(vb.players.find((p) => p.id === a).hasVoted, true);
    assert.equal(vb.players.find((p) => p.id === b).hasVoted, false);
    assert.equal(va.candidates, null);
});

test('en vote2 : candidats avec le libellé du centre, Maître absent', () => {
    const ctx = inVote2(5);
    const v = view(ctx.game, ctx.commons[0]);
    assert.equal(v.candidates.length, candidates(ctx.game).length);
    assert.ok(!v.candidates.some((c) => c.id === ctx.master));
    const center = v.candidates.find((c) => c.id === CENTER);
    assert.equal(center.name, CENTER_LABEL);
    assert.ok(v.actions.includes('vote2'));
});

test('en tiebreak : les ex aequo pour tous, l\'action tiebreak pour le trouveur seul', () => {
    const ctx = inVote2(4, NO_VARIANT);
    const [c0, c1] = candidates(ctx.game);
    const tb = run(ctx.game, ctx.deps, ...ctx.game.players.map((p, i) => ({ type: 'vote2', actor: p.id, candidate: i < 2 ? c0 : c1 })));
    assert.equal(tb.phase.name, 'tiebreak');
    const finder = view(tb, ctx.finderId);
    assert.deepEqual(finder.candidates.map((c) => c.id), [c0, c1]);
    assert.ok(finder.actions.includes('tiebreak'));
    const other = tb.players.map((p) => p.id).find((id) => id !== ctx.finderId && id !== ctx.host);
    assert.ok(!view(tb, other).actions.includes('tiebreak'));
    assert.deepEqual(view(tb, other).candidates.map((c) => c.id), [c0, c1]);
});

test('en ended : tout le monde voit le mot, l\'insider, la carte du centre et le résultat', () => {
    const ctx = inVote2(4, NO_VARIANT);
    const ended = run(ctx.game, ctx.deps, ...ctx.game.players.map((p) => ({ type: 'vote2', actor: p.id, candidate: ctx.insider })));
    for (const p of ended.players) {
        const v = view(ended, p.id);
        assert.equal(v.phase, 'ended');
        assert.equal(v.word, 'Château');
        assert.deepEqual(v.result, {
            outcome: 'commonsWin', reason: 'vote2', insiderId: ctx.insider, centerCard: null,
            tallies: ended.phase.tallies, pointed: ctx.insider
        });
        assert.equal(v.timer, null);
    }
    assert.deepEqual(view(ended, ctx.host).actions.sort(), ['reset', 'startRound']);
});

test('result est null hors ended et les commandes serveur n\'apparaissent jamais dans actions', () => {
    const byCtx = [lobby(4), started(4), inVote1(4), inVote2(4)];
    for (const ctx of byCtx) {
        for (const p of ctx.game.players) {
            const v = view(ctx.game, p.id);
            assert.equal(v.result, null);
            for (const a of v.actions) {
                assert.ok(!['addPlayer', 'removePlayer', 'timeout'].includes(a));
            }
        }
    }
});

test('version de la vue égale la version du jeu', () => {
    const ctx = started(4);
    assert.equal(view(ctx.game, 'p1').version, ctx.game.version);
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npm test`
Expected: `view.js` introuvable.

- [ ] **Step 3: Implémenter view.js**

```js
// src/engine/view.js
// Seule fonction qui expose des secrets. Tout ce que le client rend vient d'ici.

import { allowedActions, candidates, CENTER } from './game.js';

/** @typedef {import('./types.js').Game} Game */
/** @typedef {import('./types.js').PlayerId} PlayerId */
/** @typedef {import('./types.js').CandidateId} CandidateId */
/** @typedef {import('./types.js').View} View */

export const CENTER_LABEL = 'Pas de Traître';

/**
 * @param {Game} game
 * @param {PlayerId} playerId
 * @returns {View}
 */
export function view(game, playerId) {
    const me = game.players.find((p) => p.id === playerId);
    if (!me) {
        throw new Error(`view: unknown player ${playerId}`);
    }
    const phase = game.phase;
    const myRole = game.roles?.[playerId] ?? null;
    const ended = phase.name === 'ended';
    const ballots = 'ballots' in phase ? phase.ballots : null;
    /** @param {PlayerId} id */
    const hasVoted = (id) => Boolean(ballots && id in ballots);
    const finderId = 'finderId' in phase ? phase.finderId : null;
    const finderPlayer = finderId ? game.players.find((p) => p.id === finderId) : undefined;

    /** @param {CandidateId} id */
    const candidateName = (id) => (id === CENTER ? CENTER_LABEL : (game.players.find((p) => p.id === id)?.name ?? id));

    /** @type {View['candidates']} */
    let candidateList = null;
    if (phase.name === 'vote2') {
        candidateList = candidates(game).map((id) => ({ id, name: candidateName(id) }));
    } else if (phase.name === 'tiebreak') {
        candidateList = phase.tied.map((id) => ({ id, name: candidateName(id) }));
    }

    const wordVisible = game.word !== null && (ended || myRole === 'master' || myRole === 'insider');

    /** @type {View['result']} */
    let result = null;
    if (phase.name === 'ended') {
        const insiderId = Object.keys(game.roles ?? {}).find((id) => game.roles?.[id] === 'insider') ?? null;
        result = {
            outcome: phase.outcome,
            reason: phase.reason,
            insiderId,
            centerCard: game.centerCard,
            tallies: phase.tallies,
            pointed: phase.pointed
        };
    }

    return {
        version: game.version,
        phase: phase.name,
        me: { id: me.id, name: me.name, isHost: me.isHost, role: myRole, hasVoted: hasVoted(me.id) },
        players: game.players.map((p) => ({ id: p.id, name: p.name, isHost: p.isHost, hasVoted: hasVoted(p.id) })),
        word: wordVisible ? game.word : null,
        finder: finderPlayer ? { id: finderPlayer.id, name: finderPlayer.name } : null,
        timer: (phase.name === 'playing' || phase.name === 'discussion')
            ? { startedAt: phase.startedAt, deadline: phase.deadline }
            : null,
        candidates: candidateList,
        result,
        actions: allowedActions(game, playerId)
    };
}
```

- [ ] **Step 4: Vérifier tests, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tout vert.

- [ ] **Step 5: Commit**

```bash
git add src/engine/view.js test/engine/view.test.js
git commit -m "feat(engine): per-player view with secret exposure rules and allowed actions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Critères de fin, README

**Files:**
- Modify: `README.md` (section Développement)
- Modify: `docs/comite-2026-09-17-architecture-cible.md` (cocher l'action étape 1)

**Interfaces:**
- Consumes: tout le moteur

- [ ] **Step 1: Vérifier l'absence d'I/O et de hasard non injecté dans le moteur**

Run:
```bash
grep -rnE "from '(express|socket\.io|node:)" src/engine/ ; echo "imports node/express/socket.io ci-dessus (attendu : rien)"
grep -rnE "Math\.random|Date\.now" src/engine/ ; echo "Math.random / Date.now ci-dessus (attendu : rien)"
```
Expected: les deux grep n'affichent aucune ligne.

- [ ] **Step 2: Compter les tests et vérifier la durée**

Run: `npm test 2>&1 | tail -12`
Expected: au moins 60 tests, 0 échec, durée totale sous 2 secondes.

- [ ] **Step 3: Vérifier que le serveur n'a pas bougé**

Run:
```bash
git diff master..HEAD --stat -- app.js views public
PORT=8095 timeout 4 node app.js ; echo "exit=$? (124 attendu, le serveur tournait)"
```
Expected: le diff est vide, le serveur démarre.

- [ ] **Step 4: Mettre à jour le README**

Dans `README.md`, après la section Setup (avant `## Screenshots`), ajouter :

```markdown
## Développement

```
npm test           # tests du moteur (node:test)
npm run typecheck  # JSDoc vérifié par tsc, sans build
npm run lint
```

Le moteur de jeu pur vit dans `src/engine/` (`createGame`, `apply`, `view`). Il n'est pas encore branché au serveur : `app.js` porte toujours la logique de 2020, le branchement est le chantier suivant.

- Règles implémentées : `docs/adr/0001-regles-du-jeu.md`
- Conception du moteur : `docs/specs/2026-09-17-moteur-de-jeu-design.md`
- Décisions d'architecture : `docs/comite-2026-09-17-architecture-cible.md`
- Audit initial : `docs/audit-2026-09-17.md`
```

Dans `docs/comite-2026-09-17-architecture-cible.md`, remplacer `- [ ] Étape 1 : \`engine.js\` avec les bugs connus en rouge` par `- [x] Étape 1 : moteur pur \`src/engine/\` avec ses tests (17/09)`.

- [ ] **Step 5: Lint final et commit**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add README.md docs/comite-2026-09-17-architecture-cible.md
git commit -m "docs: development section, engine status and links to ADR and spec

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
