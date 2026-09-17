# Branchement du moteur, plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brancher le moteur pur `src/engine/` au serveur socket.io et au téléphone : identité par token, événement `state` unique, client vanilla `render(view)`, jeu jouable à la fin.

**Architecture:** `src/server/table.js` adapte le moteur (tokens, présence, chrono, validation des payloads, `kick`). `src/server/app.js` porte Express (coquille EJS, static) et socket.io (join, command avec ack, diffusion par joueur). `app.js` est l'entrée. Côté client, `public/js/client.js` (connexion, état, envoi), `render.js` (un écran par phase depuis la vue), `audio.js` (sons, Wake Lock), `dom.js` (helpers purs). Les vues EJS de 2020, jQuery, la session et la page admin disparaissent.

**Tech Stack:** Node 22, ESM, Express 5, socket.io 4, EJS 6 (coquille seulement), JSDoc + tsc sur `src/`, node:test, socket.io-client en devDependency pour les tests d'intégration. Bootstrap 4 CDN et les CSS existants conservés.

**Spec:** `docs/specs/2026-09-17-branchement-design.md` (moteur : `docs/specs/2026-09-17-moteur-de-jeu-design.md`, règles : `docs/adr/0001-regles-du-jeu.md`)

## Global Constraints

- Node `>=22`, `"type": "module"`, imports relatifs avec `.js`
- `src/engine/` n'est pas modifié par ce chantier. Toute règle de jeu passe par `apply` et `view`
- Le serveur n'émet jamais l'état brut du moteur ni un bulletin individuel. Seule sortie vers un client : `state` avec `{ view, online, serverTime, minPlayers }`, `needJoin`, `joined { token }`, `joinFailed { error, message }`, et l'ack d'une commande `{ ok }` ou `{ ok: false, error, message }`
- `actor` est toujours posé par le serveur depuis le socket, jamais lu dans un payload client. Les payloads sont validés par forme, les champs inconnus sont ignorés
- Commandes client autorisées : `startRound`, `setWord`, `drawWord`, `startTimer`, `wordFound`, `closeDiscussion`, `vote1`, `vote2`, `tiebreak`, `reset`, `kick`
- Avant toute commande d'un joueur, si la phase est `playing` et que la deadline est passée, l'adaptateur applique `timeout` d'abord
- Dépendances : `express-session` retirée ; `socket.io-client` ajoutée en devDependency ; rien d'autre
- Fichiers supprimés : `views/welcome.ejs`, `views/board.ejs`, `views/adminPlayer.ejs`, `public/js/timer.js`, `public/pdf/help.pdf`
- Libellés : hôte (jamais "chef de jeu"), Maître du jeu, Traître, Citoyen. Le libellé du centre vient de `CENTER_LABEL`
- Style : 4 espaces, simple quotes, point-virgule, pas de caractère "—". Texte utilisateur en français
- Commits : préfixes `feat:`, `test:`, `chore:`, `docs:`, `refactor:`, terminés par `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
- Après chaque tâche : `npm test`, `npm run typecheck`, `npm run lint` verts. Preuve TDD : sortie brute de `node --test` collée dans le rapport, jamais reconstruite

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `src/server/table.js` | `createTable` : moteur + tokens + présence + chrono + validation + `kick` |
| `src/server/app.js` | `createApp` : Express coquille et static, socket.io (join, command, diffusion) |
| `app.js` | entrée : env, CSV, `createApp`, `listen` |
| `views/layouts/layout.ejs` | coquille HTML sans jQuery, charge `/socket.io/socket.io.js` et `client.js` |
| `views/index.ejs` | `<main id="screen">` et `<div id="toast">` |
| `public/js/dom.js` | `escapeHtml`, `formatCountdown`, libellés, `messageFor` |
| `public/js/audio.js` | `unlock`, `playFor` |
| `public/js/render.js` | `renderJoin`, `render(envelope)`, `patchPresence`, `patchTimer` |
| `public/js/client.js` | boot, socket, état courant, envoi, délégation des clics |
| `test/server/helpers.js` | `startServer`, `client`, `waitFor`, `expectSilence`, `command`, `joinAll`, `playToVote1` |
| `test/server/table.test.js` | adaptateur sans réseau (timers injectés) |
| `test/server/game.test.js` | partie complète à 4 clients |
| `test/server/guards.test.js` | hors phase, socket non attaché, kick |
| `test/server/reconnect.test.js` | reprise par token |
| `test/server/timeout.test.js` | chrono serveur |
| `test/client/dom.test.js` | helpers purs du client sous node |
| `docs/checklist-mobile.md` | six vérifications manuelles |

---

### Task 1: L'adaptateur `createTable`

**Files:**
- Create: `src/server/table.js`
- Create: `test/server/table.test.js`
- Modify: `jsconfig.json` (include `src/**/*.js`)

**Interfaces:**
- Consumes: `createGame`, `apply`, `SERVER`, `CENTER` de `src/engine/game.js` ; `view` de `src/engine/view.js`
- Produces: `createTable({ settings, words, now, random, setTimer, clearTimer })` renvoyant `{ game (getter), join(name), resolve(token), connect(playerId, socketId), disconnect(playerId, socketId), dispatch(actor, payload), snapshot(playerId), onChange(listener), close() }`. Événements du listener : `{ type: 'state' }` après toute transition ou changement de présence, `{ type: 'kicked', playerId }` avant le `state` qui suit un kick. `snapshot` renvoie `{ view, online: PlayerId[], serverTime, minPlayers }`

- [ ] **Step 1: Étendre le typecheck à `src/`**

Dans `jsconfig.json`, remplacer `"include": ["src/engine/**/*.js"]` par `"include": ["src/**/*.js"]`. Comme `src/server/` importe `node:crypto`, remplacer `"types": []` par `"types": ["node"]` et installer les types :

```bash
npm install --save-dev @types/node@22 --no-fund --loglevel=error
```

- [ ] **Step 2: Écrire les tests de l'adaptateur (échouent)**

`test/server/table.test.js` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTable } from '../../src/server/table.js';
import { SERVER } from '../../src/engine/game.js';

/** Horloge et timers pilotés à la main. */
function fakeClock(start = 1_000_000) {
    let t = start;
    /** @type {Array<{ at: number, fn: () => void, id: number }>} */
    let timers = [];
    let nextId = 1;
    return {
        now: () => t,
        setTimer: (fn, delay) => { const id = nextId++; timers.push({ at: t + delay, fn, id }); return id; },
        clearTimer: (id) => { timers = timers.filter((x) => x.id !== id); },
        advance(ms) {
            t += ms;
            const due = timers.filter((x) => x.at <= t).sort((a, b) => a.at - b.at);
            timers = timers.filter((x) => x.at > t);
            for (const x of due) x.fn();
        },
        pending: () => timers.length
    };
}

function table(settings = {}) {
    const clock = fakeClock();
    const t = createTable({
        settings: { minPlayers: 4, traitorOptional: false, timerMs: 5000, ...settings },
        words: ['Château'],
        now: clock.now,
        random: () => 0.42,
        setTimer: clock.setTimer,
        clearTimer: clock.clearTimer
    });
    const events = [];
    t.onChange((e) => events.push(e));
    return { t, clock, events };
}

function joinAll(t, names) {
    return names.map((name) => {
        const r = t.join(name);
        assert.ok(r.ok, `join ${name}: ${r.ok ? '' : r.message}`);
        return r;
    });
}

test('join crée le joueur, le premier est hôte, le token résout le joueur', () => {
    const { t, events } = table();
    const [a, b] = joinAll(t, ['Alice', 'Bob']);
    assert.notEqual(a.token, b.token);
    assert.equal(t.resolve(a.token), a.playerId);
    assert.equal(t.resolve('nope'), null);
    assert.equal(t.resolve(undefined), null);
    assert.equal(t.game.players[0].isHost, true);
    assert.equal(t.game.players[1].isHost, false);
    assert.equal(events.filter((e) => e.type === 'state').length, 2);
});

test('join refuse un nom vide ou en doublon avec le code du moteur', () => {
    const { t } = table();
    joinAll(t, ['Alice']);
    const empty = t.join('  ');
    assert.equal(empty.ok, false);
    assert.equal(empty.error, 'INVALID_ARGUMENT');
    const dup = t.join('Alice');
    assert.equal(dup.ok, false);
    assert.equal(dup.error, 'DUPLICATE_NAME');
});

test('snapshot porte la vue du joueur, la présence, l\'heure serveur et minPlayers', () => {
    const { t, clock } = table();
    const [a, b] = joinAll(t, ['Alice', 'Bob']);
    t.connect(a.playerId, 's1');
    const snap = t.snapshot(a.playerId);
    assert.equal(snap.view.me.id, a.playerId);
    assert.deepEqual(snap.online, [a.playerId]);
    assert.equal(snap.serverTime, clock.now());
    assert.equal(snap.minPlayers, 4);
    assert.equal(t.snapshot(b.playerId).view.me.id, b.playerId);
});

test('connect et disconnect ne signalent un changement qu\'au premier et au dernier socket', () => {
    const { t, events } = table();
    const [a] = joinAll(t, ['Alice']);
    events.length = 0;
    assert.equal(t.connect(a.playerId, 's1'), true);
    assert.equal(t.connect(a.playerId, 's2'), false);
    assert.equal(t.disconnect(a.playerId, 's1'), false);
    assert.equal(t.disconnect(a.playerId, 's2'), true);
    assert.equal(t.disconnect(a.playerId, 's2'), false);
    assert.equal(events.filter((e) => e.type === 'state').length, 2);
    assert.deepEqual(t.snapshot(a.playerId).online, []);
});

test('dispatch pose l\'acteur depuis le serveur et ignore un actor dans le payload', () => {
    const { t } = table();
    const [a, b] = joinAll(t, ['Alice', 'Bob', 'Carol', 'Dan']);
    const asBob = t.dispatch(b.playerId, { type: 'startRound', actor: a.playerId });
    assert.equal(asBob.ok, false);
    assert.equal(asBob.error, 'FORBIDDEN');
    const asHost = t.dispatch(a.playerId, { type: 'startRound' });
    assert.equal(asHost.ok, true);
    assert.equal(t.game.phase.name, 'roles');
});

test('dispatch valide la forme du payload avant le moteur', () => {
    const { t } = table();
    const [a] = joinAll(t, ['Alice', 'Bob', 'Carol', 'Dan']);
    for (const payload of [null, 42, {}, { type: 'dance' }, { type: 'toString' }, { type: 'addPlayer', id: 'x', name: 'y' }, { type: 'timeout' }]) {
        const r = t.dispatch(a.playerId, /** @type {any} */ (payload));
        assert.equal(r.ok, false, JSON.stringify(payload));
        assert.equal(r.error, 'INVALID_ARGUMENT', JSON.stringify(payload));
    }
    t.dispatch(a.playerId, { type: 'startRound' });
    const master = t.game.players.find((p) => t.game.roles?.[p.id] === 'master');
    const badWord = t.dispatch(master.id, { type: 'setWord', word: 42 });
    assert.equal(badWord.error, 'INVALID_ARGUMENT');
    const extra = t.dispatch(master.id, { type: 'setWord', word: 'Lune', junk: true });
    assert.equal(extra.ok, true);
    assert.equal(t.game.word, 'Lune');
});

test('kick : hôte seulement, jamais lui-même, invalide le token et émet kicked puis state', () => {
    const { t, events } = table();
    const [a, b] = joinAll(t, ['Alice', 'Bob']);
    assert.equal(t.dispatch(b.playerId, { type: 'kick', id: a.playerId }).error, 'FORBIDDEN');
    assert.equal(t.dispatch(a.playerId, { type: 'kick', id: a.playerId }).error, 'FORBIDDEN');
    events.length = 0;
    const r = t.dispatch(a.playerId, { type: 'kick', id: b.playerId });
    assert.equal(r.ok, true);
    assert.deepEqual(events.map((e) => e.type), ['kicked', 'state']);
    assert.equal(events[0].playerId, b.playerId);
    assert.equal(t.resolve(b.token), null);
    assert.equal(t.game.players.length, 1);
    assert.equal(t.dispatch(a.playerId, { type: 'kick', id: 'ghost' }).error, 'UNKNOWN_PLAYER');
});

test('le chrono est armé en playing, annulé en sortie, et applique timeout à l\'échéance', () => {
    const { t, clock } = table();
    const [a] = joinAll(t, ['Alice', 'Bob', 'Carol', 'Dan']);
    t.dispatch(a.playerId, { type: 'startRound' });
    const master = t.game.players.find((p) => t.game.roles?.[p.id] === 'master');
    t.dispatch(master.id, { type: 'setWord', word: 'Lune' });
    assert.equal(clock.pending(), 0);
    t.dispatch(a.playerId, { type: 'startTimer' });
    assert.equal(clock.pending(), 1);
    clock.advance(4999);
    assert.equal(t.game.phase.name, 'playing');
    clock.advance(1);
    assert.equal(t.game.phase.name, 'ended');
    assert.equal(t.game.phase.reason, 'timeout');
    assert.equal(clock.pending(), 0);
});

test('une sortie de playing par wordFound annule le chrono', () => {
    const { t, clock } = table();
    const [a] = joinAll(t, ['Alice', 'Bob', 'Carol', 'Dan']);
    t.dispatch(a.playerId, { type: 'startRound' });
    const master = t.game.players.find((p) => t.game.roles?.[p.id] === 'master');
    const common = t.game.players.find((p) => t.game.roles?.[p.id] === 'common');
    t.dispatch(master.id, { type: 'setWord', word: 'Lune' });
    t.dispatch(a.playerId, { type: 'startTimer' });
    clock.advance(1000);
    assert.equal(t.dispatch(master.id, { type: 'wordFound', finderId: common.id }).ok, true);
    assert.equal(clock.pending(), 0);
    clock.advance(10_000);
    assert.equal(t.game.phase.name, 'discussion');
});

test('une commande reçue après la deadline déclenche timeout d\'abord et est refusée', () => {
    const { t, clock } = table();
    const [a] = joinAll(t, ['Alice', 'Bob', 'Carol', 'Dan']);
    t.dispatch(a.playerId, { type: 'startRound' });
    const master = t.game.players.find((p) => t.game.roles?.[p.id] === 'master');
    const common = t.game.players.find((p) => t.game.roles?.[p.id] === 'common');
    t.dispatch(master.id, { type: 'setWord', word: 'Lune' });
    t.dispatch(a.playerId, { type: 'startTimer' });
    // On avance l'horloge sans déclencher le timer (comme si le tick était en retard)
    clock.clearTimer(1);
    clock.now();
    const late = fakeClock();
    void late;
    // Simule un tick en retard : on avance l'heure au-delà de la deadline via une nouvelle table impossible,
    // donc on passe par advance sur un clone : ici on déclenche la file avec un délai supérieur.
    clock.advance(5000);
    // Le timer a été retiré plus haut, la phase doit encore être playing.
    assert.equal(t.game.phase.name, 'playing');
    const r = t.dispatch(master.id, { type: 'wordFound', finderId: common.id });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'WRONG_PHASE');
    assert.equal(t.game.phase.name, 'ended');
    assert.equal(t.game.phase.reason, 'timeout');
});

test('close annule le chrono en attente', () => {
    const { t, clock } = table();
    const [a] = joinAll(t, ['Alice', 'Bob', 'Carol', 'Dan']);
    t.dispatch(a.playerId, { type: 'startRound' });
    const master = t.game.players.find((p) => t.game.roles?.[p.id] === 'master');
    t.dispatch(master.id, { type: 'setWord', word: 'Lune' });
    t.dispatch(a.playerId, { type: 'startTimer' });
    t.close();
    assert.equal(clock.pending(), 0);
});

test('les commandes serveur restent accessibles à l\'acteur server', () => {
    const { t } = table();
    joinAll(t, ['Alice']);
    const r = t.dispatch(SERVER, { type: 'addPlayer', id: 'x1', name: 'Xavier', isHost: false });
    assert.equal(r.ok, true);
    assert.equal(t.game.players.length, 2);
});
```

Note pour le test "commande reçue après la deadline" : le premier timer créé par la table porte l'id 1 dans `fakeClock`, `clock.clearTimer(1)` simule un tick qui n'arrive jamais. Les lignes `const late = fakeClock(); void late;` et le commentaire qui les entoure sont superflus : supprime-les à la transcription, garde `clock.clearTimer(1); clock.advance(5000);` puis les assertions.

- [ ] **Step 3: Vérifier que les tests échouent**

Run: `node --test test/server/table.test.js 2>&1 | tail -20`
Expected: échec, module `../../src/server/table.js` introuvable.

- [ ] **Step 4: Implémenter table.js**

```js
// src/server/table.js
// Adaptateur entre le moteur pur et le transport. Une seule table par process.
// Il tient les tokens, la présence et le chrono. Toute règle de jeu passe par apply et view.

import { randomUUID, randomBytes } from 'node:crypto';
import { createGame, apply, SERVER } from '../engine/game.js';
import { view } from '../engine/view.js';

/** @typedef {import('../engine/types.js').Game} Game */
/** @typedef {import('../engine/types.js').Result} Result */
/** @typedef {import('../engine/types.js').PlayerId} PlayerId */
/** @typedef {import('../engine/types.js').Settings} Settings */
/** @typedef {import('../engine/types.js').View} View */
/** @typedef {import('../engine/types.js').ErrorCode} ErrorCode */

/** @typedef {{ type: 'state' } | { type: 'kicked', playerId: PlayerId }} TableEvent */
/** @typedef {{ view: View, online: PlayerId[], serverTime: number, minPlayers: number }} Snapshot */
/** @typedef {{ ok: true, token: string, playerId: PlayerId } | { ok: false, error: ErrorCode, message: string }} JoinResult */

/**
 * Commandes qu'un client peut envoyer, avec le type primitif attendu de chaque argument.
 * Tout autre champ du payload est ignoré.
 * @type {Readonly<Record<string, Readonly<Record<string, 'string'|'boolean'>>>>}
 */
const CLIENT_COMMANDS = Object.freeze({
    startRound: Object.freeze({}),
    setWord: Object.freeze({ word: 'string' }),
    drawWord: Object.freeze({}),
    startTimer: Object.freeze({}),
    wordFound: Object.freeze({ finderId: 'string' }),
    closeDiscussion: Object.freeze({}),
    vote1: Object.freeze({ value: 'boolean' }),
    vote2: Object.freeze({ candidate: 'string' }),
    tiebreak: Object.freeze({ candidate: 'string' }),
    reset: Object.freeze({}),
    kick: Object.freeze({ id: 'string' })
});

/**
 * @param {ErrorCode} error
 * @param {string} message
 * @returns {{ ok: false, error: ErrorCode, message: string }}
 */
function fail(error, message) {
    return { ok: false, error, message };
}

/**
 * @param {unknown} payload
 * @returns {{ ok: true, command: Record<string, unknown> & { type: string } } | { ok: false, error: ErrorCode, message: string }}
 */
function validate(payload) {
    if (typeof payload !== 'object' || payload === null) {
        return fail('INVALID_ARGUMENT', 'payload must be an object');
    }
    const raw = /** @type {Record<string, unknown>} */ (payload);
    const type = raw.type;
    if (typeof type !== 'string' || !Object.hasOwn(CLIENT_COMMANDS, type)) {
        return fail('INVALID_ARGUMENT', `unknown command ${String(type)}`);
    }
    /** @type {Record<string, unknown> & { type: string }} */
    const command = { type };
    for (const [key, kind] of Object.entries(CLIENT_COMMANDS[type])) {
        if (typeof raw[key] !== kind) {
            return fail('INVALID_ARGUMENT', `${key} must be a ${kind}`);
        }
        command[key] = raw[key];
    }
    return { ok: true, command };
}

/**
 * @param {{
 *   settings?: Partial<Settings>,
 *   words: readonly string[],
 *   now?: () => number,
 *   random?: () => number,
 *   setTimer?: (fn: () => void, delay: number) => any,
 *   clearTimer?: (handle: any) => void
 * }} options
 */
export function createTable({ settings = {}, words, now = Date.now, random = Math.random, setTimer = setTimeout, clearTimer = clearTimeout }) {
    let game = createGame(settings);
    const deps = { rng: random, now, words };
    /** @type {Map<string, PlayerId>} */
    const tokens = new Map();
    /** @type {Map<PlayerId, Set<string>>} */
    const sockets = new Map();
    /** @type {Set<(event: TableEvent) => void>} */
    const listeners = new Set();
    /** @type {any} */
    let timer = null;

    /** @param {TableEvent} event */
    function emit(event) {
        for (const listener of listeners) {
            listener(event);
        }
    }

    function cancelTimer() {
        if (timer !== null) {
            clearTimer(timer);
            timer = null;
        }
    }

    function scheduleTimeout() {
        cancelTimer();
        if (game.phase.name === 'playing') {
            const delay = Math.max(0, game.phase.deadline - now());
            timer = setTimer(() => {
                timer = null;
                commit(apply(game, { type: 'timeout', actor: SERVER }, deps));
            }, delay);
        }
    }

    /**
     * Applique un résultat du moteur : nouvel état, chrono, notification.
     * @param {Result} result
     * @returns {Result}
     */
    function commit(result) {
        if (!result.ok) {
            return result;
        }
        game = result.game;
        scheduleTimeout();
        emit({ type: 'state' });
        return result;
    }

    /** Course entre le tick et un clic : la deadline passée prime sur toute commande d'un joueur. */
    function applyTimeoutIfDue() {
        if (game.phase.name === 'playing' && now() >= game.phase.deadline) {
            commit(apply(game, { type: 'timeout', actor: SERVER }, deps));
        }
    }

    /**
     * @param {string} name
     * @returns {JoinResult}
     */
    function join(name) {
        const id = randomUUID();
        const isHost = game.players.length === 0;
        const result = commit(apply(game, { type: 'addPlayer', actor: SERVER, id, name, isHost }, deps));
        if (!result.ok) {
            return result;
        }
        const token = randomBytes(16).toString('hex');
        tokens.set(token, id);
        return { ok: true, token, playerId: id };
    }

    /**
     * @param {unknown} token
     * @returns {PlayerId|null}
     */
    function resolve(token) {
        return typeof token === 'string' ? (tokens.get(token) ?? null) : null;
    }

    /** @returns {PlayerId[]} */
    function online() {
        return game.players.map((p) => p.id).filter((id) => (sockets.get(id)?.size ?? 0) > 0);
    }

    /**
     * @param {PlayerId} playerId
     * @param {string} socketId
     * @returns {boolean} vrai si la présence du joueur a changé
     */
    function connect(playerId, socketId) {
        const set = sockets.get(playerId) ?? new Set();
        const wasOnline = set.size > 0;
        set.add(socketId);
        sockets.set(playerId, set);
        if (!wasOnline) {
            emit({ type: 'state' });
        }
        return !wasOnline;
    }

    /**
     * @param {PlayerId} playerId
     * @param {string} socketId
     * @returns {boolean} vrai si la présence du joueur a changé
     */
    function disconnect(playerId, socketId) {
        const set = sockets.get(playerId);
        if (!set || !set.has(socketId)) {
            return false;
        }
        set.delete(socketId);
        if (set.size === 0) {
            sockets.delete(playerId);
            emit({ type: 'state' });
            return true;
        }
        return false;
    }

    /**
     * @param {PlayerId} actor
     * @param {PlayerId} id
     * @returns {Result}
     */
    function kick(actor, id) {
        const host = game.players.find((p) => p.id === actor);
        if (!host?.isHost) {
            return fail('FORBIDDEN', 'only the host can remove a player');
        }
        if (id === actor) {
            return fail('FORBIDDEN', 'the host cannot remove themselves');
        }
        const result = apply(game, { type: 'removePlayer', actor: SERVER, id }, deps);
        if (!result.ok) {
            return result;
        }
        for (const [token, playerId] of tokens) {
            if (playerId === id) {
                tokens.delete(token);
            }
        }
        sockets.delete(id);
        emit({ type: 'kicked', playerId: id });
        return commit(result);
    }

    /**
     * Commande d'un joueur (validée) ou du serveur (brute).
     * @param {PlayerId | typeof SERVER} actor
     * @param {unknown} payload
     * @returns {Result}
     */
    function dispatch(actor, payload) {
        if (actor === SERVER) {
            return commit(apply(game, /** @type {any} */ ({ ...(/** @type {object} */ (payload)), actor: SERVER }), deps));
        }
        const checked = validate(payload);
        if (!checked.ok) {
            return checked;
        }
        applyTimeoutIfDue();
        if (checked.command.type === 'kick') {
            return kick(actor, /** @type {string} */ (checked.command.id));
        }
        return commit(apply(game, /** @type {any} */ ({ ...checked.command, actor }), deps));
    }

    /**
     * @param {PlayerId} playerId
     * @returns {Snapshot}
     */
    function snapshot(playerId) {
        return { view: view(game, playerId), online: online(), serverTime: now(), minPlayers: game.settings.minPlayers };
    }

    /** @param {(event: TableEvent) => void} listener */
    function onChange(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    function close() {
        cancelTimer();
    }

    return {
        get game() {
            return game;
        },
        join,
        resolve,
        connect,
        disconnect,
        dispatch,
        snapshot,
        onChange,
        close
    };
}
```

- [ ] **Step 5: Vérifier tests, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: 89 tests du moteur plus 12 de la table, tsc silencieux (si tsc se plaint de `Object.hasOwn`, vérifier que `target` est bien `es2022`), lint sans erreur.

- [ ] **Step 6: Commit**

```bash
git add jsconfig.json package.json package-lock.json src/server/table.js test/server/table.test.js
git commit -m "feat(server): table adapter with tokens, presence, timer and payload validation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Le transport socket.io et la partie complète

**Files:**
- Create: `src/server/app.js`
- Create: `test/server/helpers.js`
- Create: `test/server/game.test.js`
- Create: `views/index.ejs`
- Modify: `package.json` (devDependency socket.io-client)
- Modify: `Dockerfile` (copier `src`)

**Interfaces:**
- Consumes: `createTable` (Task 1)
- Produces: `createApp({ settings, words, now }) -> { app, httpServer, io, table, close() }`. Événements socket : entrants `join { name }`, `command payload, ack` ; sortants `needJoin`, `joined { token }`, `joinFailed { error, message }`, `state Snapshot`

- [ ] **Step 1: Installer socket.io-client**

```bash
npm install --save-dev socket.io-client@4 --no-fund --loglevel=error
```

- [ ] **Step 2: Écrire la coquille `views/index.ejs`**

```html
<main id="screen" aria-live="polite"></main>
<div id="toast" class="toast-message" hidden></div>
<div id="banner" class="banner" hidden>Reconnexion...</div>
```

Le layout est réécrit en Task 5 ; pour cette tâche, `res.render('index')` doit fonctionner avec le layout actuel (il contient encore jQuery, sans effet sur les tests).

- [ ] **Step 3: Écrire les helpers de test**

`test/server/helpers.js` :

```js
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createApp } from '../../src/server/app.js';

/** Démarre un serveur réel sur un port éphémère. */
export async function startServer(settings = {}, { words = ['Château', 'Abeille', 'Piano'], now } = {}) {
    const srv = createApp({ settings: { minPlayers: 4, traitorOptional: false, ...settings }, words, now });
    await new Promise((resolve) => srv.httpServer.listen(0, () => resolve(undefined)));
    const address = /** @type {import('node:net').AddressInfo} */ (srv.httpServer.address());
    const url = `http://127.0.0.1:${address.port}`;
    return {
        ...srv,
        url,
        stop: () => new Promise((resolve) => {
            srv.close();
            srv.httpServer.close(() => resolve(undefined));
        })
    };
}

/** Un client socket.io sans reconnexion automatique, pour garder les tests déterministes. */
export function client(url, token) {
    return connect(url, { auth: { token }, forceNew: true, reconnection: false, transports: ['websocket'] });
}

/** Attend un événement qui satisfait le prédicat, ou échoue après timeout. */
export function waitFor(socket, event, predicate = () => true, timeout = 2000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(event, handler);
            reject(new Error(`timeout waiting for ${event}`));
        }, timeout);
        function handler(payload) {
            if (predicate(payload)) {
                clearTimeout(timer);
                socket.off(event, handler);
                resolve(payload);
            }
        }
        socket.on(event, handler);
    });
}

/** Réussit si aucun événement de ce type n'arrive pendant `ms`. */
export function expectSilence(socket, event, ms = 200) {
    return new Promise((resolve, reject) => {
        function handler(payload) {
            clearTimeout(timer);
            socket.off(event, handler);
            reject(new Error(`unexpected ${event}: ${JSON.stringify(payload).slice(0, 200)}`));
        }
        const timer = setTimeout(() => {
            socket.off(event, handler);
            resolve(undefined);
        }, ms);
        socket.on(event, handler);
    });
}

/** Envoie une commande et renvoie l'ack. */
export function command(socket, payload) {
    return new Promise((resolve) => socket.emit('command', payload, resolve));
}

/** Fait rejoindre n joueurs. Chaque entrée garde le dernier state reçu dans `latest`. */
export async function joinAll(url, names) {
    const players = [];
    for (const name of names) {
        const socket = client(url);
        await waitFor(socket, 'needJoin');
        const joined = waitFor(socket, 'joined');
        const first = waitFor(socket, 'state');
        socket.emit('join', { name });
        const { token } = await joined;
        const state = await first;
        const entry = { name, socket, token, latest: state };
        socket.on('state', (s) => { entry.latest = s; });
        players.push(entry);
    }
    return players;
}

/** Attend que tous les joueurs aient reçu un state dans la phase donnée. */
export function allInPhase(players, phase) {
    return Promise.all(players.map((p) => (p.latest.view.phase === phase
        ? Promise.resolve(p.latest)
        : waitFor(p.socket, 'state', (s) => s.view.phase === phase))));
}

export function byRole(players, role) {
    return players.filter((p) => p.latest.view.me.role === role);
}

export function host(players) {
    const h = players.find((p) => p.latest.view.me.isHost);
    assert.ok(h, 'no host');
    return h;
}

/** Amène une table de 4 joueurs jusqu'en vote1 (mot trouvé par un Citoyen). */
export async function playToVote1(players) {
    const h = host(players);
    assert.equal((await command(h.socket, { type: 'startRound' })).ok, true);
    await allInPhase(players, 'roles');
    const [master] = byRole(players, 'master');
    assert.equal((await command(master.socket, { type: 'setWord', word: 'Château' })).ok, true);
    await allInPhase(players, 'word');
    assert.equal((await command(master.socket, { type: 'startTimer' })).ok, true);
    await allInPhase(players, 'playing');
    const [finder] = byRole(players, 'common');
    assert.equal((await command(master.socket, { type: 'wordFound', finderId: finder.latest.view.me.id })).ok, true);
    await allInPhase(players, 'discussion');
    assert.equal((await command(master.socket, { type: 'closeDiscussion' })).ok, true);
    await allInPhase(players, 'vote1');
    return { master, finder };
}

export function closeAll(players) {
    for (const p of players) {
        p.socket.close();
    }
}
```

- [ ] **Step 4: Écrire le test de la partie complète (échoue)**

`test/server/game.test.js` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, joinAll, command, allInPhase, byRole, host, playToVote1, closeAll } from './helpers.js';

test('une partie complète à 4 clients, du join à la fin, sans fuite de secret', async () => {
    const srv = await startServer();
    try {
        const players = await joinAll(srv.url, ['Alice', 'Bob', 'Carol', 'Dan']);
        assert.equal(players[0].latest.view.me.isHost, true);
        assert.equal(players[1].latest.view.me.isHost, false);
        await Promise.all(players.map((p) => (p.latest.online.length === 4 ? Promise.resolve() : new Promise((r) => p.socket.once('state', r)))));
        assert.equal(players[3].latest.online.length, 4);
        assert.equal(players[3].latest.minPlayers, 4);

        const { master, finder } = await playToVote1(players);
        assert.equal(master.latest.view.word, 'Château');
        for (const p of players) {
            const role = p.latest.view.me.role;
            const seesWord = p.latest.view.word !== null;
            assert.equal(seesWord, role === 'master' || role === 'insider', `${p.name} (${role}) word visibility`);
            assert.equal(p.latest.view.master.id, master.latest.view.me.id);
            assert.equal(p.latest.view.finder.id, finder.latest.view.me.id);
        }

        for (const p of players) {
            assert.equal((await command(p.socket, { type: 'vote1', value: false })).ok, true);
        }
        await allInPhase(players, 'vote2');
        const [insider] = byRole(players, 'insider');
        for (const p of players) {
            assert.equal((await command(p.socket, { type: 'vote2', candidate: insider.latest.view.me.id })).ok, true);
        }
        const finals = await allInPhase(players, 'ended');
        for (const s of finals) {
            assert.equal(s.view.result.outcome, 'commonsWin');
            assert.equal(s.view.result.insiderId, insider.latest.view.me.id);
            assert.equal(s.view.word, 'Château');
            assert.equal(s.view.tallies[insider.latest.view.me.id], 4);
        }
        const h = host(players);
        assert.deepEqual(h.latest.view.actions.slice().sort(), ['reset', 'startRound']);
        closeAll(players);
    } finally {
        await srv.stop();
    }
});

test('un state ne contient jamais les bulletins ni les rôles des autres', async () => {
    const srv = await startServer();
    try {
        const players = await joinAll(srv.url, ['Alice', 'Bob', 'Carol', 'Dan']);
        await playToVote1(players);
        await command(players[1].socket, { type: 'vote1', value: true });
        const s = await new Promise((r) => players[0].socket.once('state', r)).catch(() => players[0].latest);
        const json = JSON.stringify(s ?? players[0].latest);
        assert.ok(!json.includes('"ballots"'));
        assert.ok(!json.includes('"roles"'));
        assert.equal(players[0].latest.view.players.find((p) => p.id === players[1].latest.view.me.id).hasVoted, true);
        closeAll(players);
    } finally {
        await srv.stop();
    }
});
```

- [ ] **Step 5: Vérifier que les tests échouent**

Run: `node --test test/server/game.test.js 2>&1 | tail -20`
Expected: échec, `../../src/server/app.js` introuvable.

- [ ] **Step 6: Implémenter app.js (serveur)**

```js
// src/server/app.js
// Transport : Express sert la coquille et les fichiers statiques, socket.io porte le jeu.
// Un socket est soit attaché à un joueur (token reconnu ou join réussi), soit en attente de join.

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import expressLayouts from 'express-ejs-layouts';
import { Server } from 'socket.io';
import { createTable } from './table.js';

/** @typedef {import('../engine/types.js').PlayerId} PlayerId */
/** @typedef {import('../engine/types.js').Settings} Settings */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * @param {{ settings?: Partial<Settings>, words: readonly string[], now?: () => number }} options
 */
export function createApp({ settings = {}, words, now }) {
    const table = createTable({ settings, words, now });

    const app = express();
    app.use(expressLayouts)
        .set('view engine', 'ejs')
        .set('views', `${ROOT}views`)
        .set('layout', 'layouts/layout')
        .use('/static', express.static(`${ROOT}public`))
        .get('/', (req, res) => {
            res.render('index');
        });

    const httpServer = createServer(app);
    const io = new Server(httpServer);

    /** @type {Map<string, PlayerId>} socketId -> playerId */
    const attached = new Map();

    /**
     * @param {import('socket.io').Socket} socket
     * @param {PlayerId} playerId
     */
    function attach(socket, playerId) {
        attached.set(socket.id, playerId);
        table.connect(playerId, socket.id);
        socket.emit('state', table.snapshot(playerId));
    }

    function broadcast() {
        for (const [socketId, playerId] of attached) {
            io.to(socketId).emit('state', table.snapshot(playerId));
        }
    }

    table.onChange((event) => {
        if (event.type === 'kicked') {
            for (const [socketId, playerId] of attached) {
                if (playerId === event.playerId) {
                    attached.delete(socketId);
                    io.to(socketId).emit('needJoin');
                }
            }
            return;
        }
        broadcast();
    });

    io.on('connection', (socket) => {
        const playerId = table.resolve(socket.handshake.auth?.token);
        if (playerId !== null) {
            attach(socket, playerId);
        } else {
            socket.emit('needJoin');
        }

        socket.on('join', (payload) => {
            if (attached.has(socket.id)) {
                return;
            }
            const name = typeof payload?.name === 'string' ? payload.name : '';
            const result = table.join(name);
            if (!result.ok) {
                socket.emit('joinFailed', { error: result.error, message: result.message });
                return;
            }
            socket.emit('joined', { token: result.token });
            attach(socket, result.playerId);
        });

        socket.on('command', (payload, ack) => {
            const reply = typeof ack === 'function' ? ack : () => {};
            const actor = attached.get(socket.id);
            if (actor === undefined) {
                reply({ ok: false, error: 'FORBIDDEN', message: 'join first' });
                return;
            }
            const result = table.dispatch(actor, payload);
            reply(result.ok ? { ok: true } : { ok: false, error: result.error, message: result.message });
        });

        socket.on('disconnect', () => {
            const actor = attached.get(socket.id);
            attached.delete(socket.id);
            if (actor !== undefined) {
                table.disconnect(actor, socket.id);
            }
        });
    });

    return {
        app,
        httpServer,
        io,
        table,
        close() {
            table.close();
            io.close();
        }
    };
}
```

Le `kicked` ne diffuse pas lui-même : le `commit` qui suit dans `table.kick` émet un `state` qui déclenche `broadcast()`.

- [ ] **Step 7: Dockerfile**

Dans `Dockerfile`, après `COPY app.js ./`, ajouter la ligne `COPY src ./src`.

- [ ] **Step 8: Vérifier tests, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tout vert, la suite reste sous 3 secondes. Si tsc se plaint de `socket.handshake.auth?.token`, caster `/** @type {{ token?: unknown }} */ (socket.handshake.auth)`.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/server/app.js test/server/helpers.js test/server/game.test.js views/index.ejs Dockerfile
git commit -m "feat(server): socket.io transport with token join, command ack and per-player state

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Gardes, reconnexion, chrono

**Files:**
- Create: `test/server/guards.test.js`
- Create: `test/server/reconnect.test.js`
- Create: `test/server/timeout.test.js`

**Interfaces:**
- Consumes: helpers de la Task 2. Aucun code de production attendu ; si un test révèle un écart, corriger `src/server/` minimalement et le déclarer

- [ ] **Step 1: Écrire les trois fichiers de test**

`test/server/guards.test.js` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, joinAll, client, command, waitFor, expectSilence, host, closeAll } from './helpers.js';

test('une commande hors phase est refusée par ack sans émettre de state', async () => {
    const srv = await startServer();
    try {
        const players = await joinAll(srv.url, ['Alice', 'Bob', 'Carol', 'Dan']);
        const before = players[0].latest.view.version;
        const silence = expectSilence(players[1].socket, 'state');
        const ack = await command(players[0].socket, { type: 'vote1', value: true });
        assert.equal(ack.ok, false);
        assert.equal(ack.error, 'WRONG_PHASE');
        await silence;
        assert.equal(players[0].latest.view.version, before);
        closeAll(players);
    } finally {
        await srv.stop();
    }
});

test('un socket non attaché reçoit needJoin et ses commandes sont FORBIDDEN', async () => {
    const srv = await startServer();
    try {
        const stranger = client(srv.url, 'token-invente');
        await waitFor(stranger, 'needJoin');
        const ack = await command(stranger, { type: 'startRound' });
        assert.equal(ack.error, 'FORBIDDEN');
        stranger.close();
    } finally {
        await srv.stop();
    }
});

test('join refuse un nom vide et un doublon avec un message', async () => {
    const srv = await startServer();
    try {
        const players = await joinAll(srv.url, ['Alice']);
        const s = client(srv.url);
        await waitFor(s, 'needJoin');
        const failed = waitFor(s, 'joinFailed');
        s.emit('join', { name: 'Alice' });
        const r = await failed;
        assert.equal(r.error, 'DUPLICATE_NAME');
        assert.ok(typeof r.message === 'string' && r.message.length > 0);
        const failed2 = waitFor(s, 'joinFailed');
        s.emit('join', { name: '   ' });
        assert.equal((await failed2).error, 'INVALID_ARGUMENT');
        const failed3 = waitFor(s, 'joinFailed');
        s.emit('join', { nope: 1 });
        assert.equal((await failed3).error, 'INVALID_ARGUMENT');
        s.close();
        closeAll(players);
    } finally {
        await srv.stop();
    }
});

test('kick : refusé à un non hôte et à l\'hôte sur lui-même, sinon le joueur retiré reçoit needJoin', async () => {
    const srv = await startServer();
    try {
        const players = await joinAll(srv.url, ['Alice', 'Bob', 'Carol', 'Dan']);
        const h = host(players);
        const bob = players[1];
        assert.equal((await command(bob.socket, { type: 'kick', id: h.latest.view.me.id })).error, 'FORBIDDEN');
        assert.equal((await command(h.socket, { type: 'kick', id: h.latest.view.me.id })).error, 'FORBIDDEN');
        const kicked = waitFor(bob.socket, 'needJoin');
        const others = waitFor(players[2].socket, 'state', (s) => s.view.players.length === 3);
        assert.equal((await command(h.socket, { type: 'kick', id: bob.latest.view.me.id })).ok, true);
        await kicked;
        const s = await others;
        assert.ok(!s.view.players.some((p) => p.name === 'Bob'));
        assert.equal((await command(bob.socket, { type: 'startRound' })).error, 'FORBIDDEN');
        const again = client(srv.url, bob.token);
        await waitFor(again, 'needJoin');
        again.close();
        closeAll(players);
    } finally {
        await srv.stop();
    }
});

test('un actor glissé dans le payload est ignoré', async () => {
    const srv = await startServer();
    try {
        const players = await joinAll(srv.url, ['Alice', 'Bob', 'Carol', 'Dan']);
        const h = host(players);
        const ack = await command(players[1].socket, { type: 'startRound', actor: h.latest.view.me.id });
        assert.equal(ack.error, 'FORBIDDEN');
        closeAll(players);
    } finally {
        await srv.stop();
    }
});
```

`test/server/reconnect.test.js` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, joinAll, client, command, waitFor, playToVote1, closeAll } from './helpers.js';

test('un joueur qui revient avec son token reprend sa place, bulletin compris', async () => {
    const srv = await startServer();
    try {
        const players = await joinAll(srv.url, ['Alice', 'Bob', 'Carol', 'Dan']);
        await playToVote1(players);
        const bob = players[1];
        assert.equal((await command(bob.socket, { type: 'vote1', value: true })).ok, true);
        const offline = waitFor(players[0].socket, 'state', (s) => !s.online.includes(bob.latest.view.me.id));
        bob.socket.close();
        await offline;
        const back = client(srv.url, bob.token);
        const state = await waitFor(back, 'state');
        assert.equal(state.view.phase, 'vote1');
        assert.equal(state.view.me.id, bob.latest.view.me.id);
        assert.equal(state.view.me.hasVoted, true);
        assert.ok(!state.view.actions.includes('vote1'));
        assert.ok(state.online.includes(bob.latest.view.me.id));
        back.close();
        closeAll(players);
    } finally {
        await srv.stop();
    }
});

test('deux sockets du même token comptent pour un seul joueur en ligne', async () => {
    const srv = await startServer();
    try {
        const players = await joinAll(srv.url, ['Alice', 'Bob', 'Carol', 'Dan']);
        const second = client(srv.url, players[0].token);
        const s = await waitFor(second, 'state');
        assert.equal(s.view.me.id, players[0].latest.view.me.id);
        assert.equal(s.online.length, 4);
        assert.equal(s.view.players.length, 4);
        second.close();
        closeAll(players);
    } finally {
        await srv.stop();
    }
});
```

`test/server/timeout.test.js` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, joinAll, command, allInPhase, byRole, host, closeAll } from './helpers.js';

test('le chrono serveur termine la partie en allLose sans commande client', async () => {
    const srv = await startServer({ timerMs: 300 });
    try {
        const players = await joinAll(srv.url, ['Alice', 'Bob', 'Carol', 'Dan']);
        const h = host(players);
        await command(h.socket, { type: 'startRound' });
        await allInPhase(players, 'roles');
        const [master] = byRole(players, 'master');
        await command(master.socket, { type: 'setWord', word: 'Château' });
        await allInPhase(players, 'word');
        const started = Date.now();
        await command(h.socket, { type: 'startTimer' });
        const finals = await allInPhase(players, 'ended');
        assert.ok(Date.now() - started >= 250, 'trop tôt');
        for (const s of finals) {
            assert.equal(s.view.result.reason, 'timeout');
            assert.equal(s.view.result.outcome, 'allLose');
            assert.equal(s.view.word, 'Château');
            assert.equal(s.view.finder, null);
        }
        closeAll(players);
    } finally {
        await srv.stop();
    }
});
```

- [ ] **Step 2: Lancer les tests**

Run: `npm test 2>&1 | tail -15`
Expected: tout vert. Si `allInPhase` reste bloqué sur `ended` dans le test de chrono, vérifier que `table.commit` est bien appelé par le timer (Task 1) et que `broadcast` est branché sur `onChange` (Task 2).

- [ ] **Step 3: Typecheck, lint, commit**

Run: `npm run typecheck && npm run lint`

```bash
git add test/server/guards.test.js test/server/reconnect.test.js test/server/timeout.test.js src/server
git commit -m "test(server): guards, token reconnection and server-side timeout

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Le client, helpers purs, audio et rendu

**Files:**
- Create: `public/js/dom.js`
- Create: `public/js/audio.js`
- Create: `public/js/render.js`
- Create: `test/client/dom.test.js`
- Modify: `eslint.config.js` (bloc navigateur : globals `io`, sourceType module)

**Interfaces:**
- Produces: `dom.js` : `escapeHtml(value)`, `formatCountdown(ms)`, `ROLE_LABELS`, `OUTCOME_SENTENCE(result)`, `messageFor(ack)`. `render.js` : `renderJoin(error)`, `render(envelope)`, `patchPresence(root, envelope)`, `patchTimer(root, envelope, offset)`. `audio.js` : `unlock()`, `playFor(previousPhase, phase, reason)`. Attributs de délégation : `data-cmd` + `data-args` (JSON) sur les boutons, `data-flip` sur les cartes, `data-form="join"|"setWord"` sur les formulaires, `data-online="<playerId>"` sur les pastilles, `data-timer` sur le chrono

- [ ] **Step 1: ESLint pour le client**

Dans `eslint.config.js`, bloc `files: ['public/js/**/*.js']`, remplacer `sourceType: 'script'` par `sourceType: 'module'` et `globals: { ...globals.browser, ...globals.jquery }` par `globals: { ...globals.browser, io: 'readonly' }`. Ajouter au bloc node `'test/**/*.js'` s'il n'y est pas déjà (il l'est depuis le chantier moteur).

- [ ] **Step 2: Test des helpers purs (échoue)**

`test/client/dom.test.js` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, formatCountdown, outcomeSentence, messageFor } from '../../public/js/dom.js';

test('escapeHtml neutralise les cinq caractères', () => {
    assert.equal(escapeHtml('<b a="1">&\'</b>'), '&lt;b a=&quot;1&quot;&gt;&amp;&#39;&lt;/b&gt;');
    assert.equal(escapeHtml(42), '42');
    assert.equal(escapeHtml(null), '');
});

test('formatCountdown arrondit à la seconde supérieure et ne descend pas sous zéro', () => {
    assert.equal(formatCountdown(300_000), '5:00');
    assert.equal(formatCountdown(29_500), '0:30');
    assert.equal(formatCountdown(1), '0:01');
    assert.equal(formatCountdown(0), '0:00');
    assert.equal(formatCountdown(-5000), '0:00');
    assert.equal(formatCountdown(61_000), '1:01');
});

test('outcomeSentence couvre les quatre issues et le timeout', () => {
    assert.equal(outcomeSentence({ outcome: 'commonsWin', reason: 'vote2' }), 'Les Citoyens gagnent !');
    assert.equal(outcomeSentence({ outcome: 'insiderWins', reason: 'vote1' }), 'Le Traître gagne !');
    assert.equal(outcomeSentence({ outcome: 'allLose', reason: 'timeout' }), 'Le temps est écoulé, tout le monde perd.');
    assert.equal(outcomeSentence({ outcome: 'allLose', reason: 'vote2' }), 'Tout le monde perd.');
    assert.equal(outcomeSentence({ outcome: 'allWin', reason: 'vote2' }), 'Tout le monde gagne, il n\'y avait pas de Traître !');
});

test('messageFor traduit les codes d\'erreur', () => {
    assert.equal(messageFor({ ok: false, error: 'WRONG_PHASE', message: 'x' }), 'Cette action n\'est plus possible.');
    assert.equal(messageFor({ ok: false, error: 'FORBIDDEN', message: 'x' }), 'Tu n\'as pas le droit de faire ça.');
    assert.equal(messageFor({ ok: false, error: 'TOO_FEW_PLAYERS', message: 'x' }), 'Pas assez de joueurs.');
    assert.equal(messageFor({ ok: false, error: 'DUPLICATE_NAME', message: 'x' }), 'Ce prénom est déjà pris.');
    assert.equal(messageFor({ ok: false, error: 'SOMETHING', message: 'détail' }), 'détail');
});
```

- [ ] **Step 3: Écrire dom.js**

```js
// public/js/dom.js
// Helpers purs du client, testables sous node : aucune référence au DOM ici.

export const ROLE_LABELS = Object.freeze({ master: 'Maître du jeu', insider: 'Traître', common: 'Citoyen' });

const ERROR_MESSAGES = Object.freeze({
    WRONG_PHASE: 'Cette action n\'est plus possible.',
    FORBIDDEN: 'Tu n\'as pas le droit de faire ça.',
    INVALID_ARGUMENT: 'Demande invalide.',
    TOO_FEW_PLAYERS: 'Pas assez de joueurs.',
    TOO_MANY_PLAYERS: 'La table est pleine.',
    DUPLICATE_NAME: 'Ce prénom est déjà pris.',
    DUPLICATE_ID: 'Ce joueur existe déjà.',
    UNKNOWN_PLAYER: 'Joueur inconnu.',
    NOT_YET: 'Pas encore.'
});

/** @param {unknown} value */
export function escapeHtml(value) {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** @param {number} ms */
export function formatCountdown(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** @param {{ outcome: string, reason: string }} result */
export function outcomeSentence(result) {
    switch (result.outcome) {
        case 'commonsWin':
            return 'Les Citoyens gagnent !';
        case 'insiderWins':
            return 'Le Traître gagne !';
        case 'allWin':
            return 'Tout le monde gagne, il n\'y avait pas de Traître !';
        case 'allLose':
        default:
            return result.reason === 'timeout' ? 'Le temps est écoulé, tout le monde perd.' : 'Tout le monde perd.';
    }
}

/** @param {{ ok: boolean, error?: string, message?: string }} ack */
export function messageFor(ack) {
    if (ack.error && Object.hasOwn(ERROR_MESSAGES, ack.error)) {
        return ERROR_MESSAGES[ack.error];
    }
    return ack.message || 'Erreur inconnue.';
}
```

- [ ] **Step 4: Écrire audio.js**

```js
// public/js/audio.js
// Les navigateurs mobiles bloquent le son sans geste utilisateur : on débloque au premier tap,
// on précharge les sons, on demande le Wake Lock. Un son par transition de phase.

const SOUND_BY_PHASE = Object.freeze({
    roles: 'mysterious',
    word: 'message',
    playing: 'go',
    discussion: 'ding',
    vote1: 'message',
    vote2: 'message',
    tiebreak: 'message',
    ended: 'tada'
});

/** @type {Map<string, HTMLAudioElement>} */
const cache = new Map();
let unlocked = false;
/** @type {any} */
let wakeLock = null;

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch {
        wakeLock = null;
    }
}

/** À appeler depuis un gestionnaire d'événement utilisateur (tap, submit). */
export async function unlock() {
    if (unlocked) {
        return;
    }
    unlocked = true;
    for (const name of new Set([...Object.values(SOUND_BY_PHASE), 'dong'])) {
        const audio = new Audio(`/static/sound/${name}.mp3`);
        audio.preload = 'auto';
        cache.set(name, audio);
    }
    try {
        const probe = cache.get('ding');
        probe.muted = true;
        await probe.play();
        probe.pause();
        probe.currentTime = 0;
        probe.muted = false;
    } catch {
        // Le déblocage a échoué, les sons resteront silencieux jusqu'au prochain geste
        unlocked = false;
        return;
    }
    await requestWakeLock();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && wakeLock === null) {
            requestWakeLock();
        }
    });
}

/**
 * Joue le son de la transition, jamais au premier rendu ni sans changement de phase.
 * @param {string|undefined} previousPhase
 * @param {string} phase
 * @param {string|undefined} reason
 */
export function playFor(previousPhase, phase, reason) {
    if (!unlocked || previousPhase === undefined || previousPhase === phase) {
        return;
    }
    const name = phase === 'ended' && reason === 'timeout' ? 'dong' : SOUND_BY_PHASE[phase];
    const audio = name ? cache.get(name) : undefined;
    if (!audio) {
        return;
    }
    audio.currentTime = 0;
    audio.play().catch(() => {});
}
```

- [ ] **Step 5: Écrire render.js**

```js
// public/js/render.js
// Un écran par phase, dérivé de la vue. Le serveur ne décide jamais quelle div afficher.
// Les boutons portent data-cmd et data-args, les cartes data-flip, les formulaires data-form.

import { escapeHtml as e, formatCountdown, ROLE_LABELS, outcomeSentence } from './dom.js';

/** @param {string} type @param {string} label @param {object} [args] @param {string} [cls] */
function button(type, label, args = {}, cls = 'btn btn-warning') {
    return `<button type="button" class="${cls}" data-cmd="${e(type)}" data-args='${e(JSON.stringify(args))}'>${e(label)}</button>`;
}

function can(view, type) {
    return view.actions.includes(type);
}

function playerName(view, id) {
    return view.players.find((p) => p.id === id)?.name ?? '?';
}

function card(title, secret, kind) {
    return `<button type="button" class="card-flip ${kind}" data-flip aria-pressed="false">
        <span class="card-face card-front">${e(title)}<small>Touche pour révéler</small></span>
        <span class="card-face card-back"><strong>${e(secret)}</strong><small>Touche pour cacher</small></span>
    </button>`;
}

function roleCard(view) {
    return view.me.role ? card('Ton rôle', ROLE_LABELS[view.me.role], 'role') : '';
}

function wordCard(view) {
    return view.word !== null ? card('Le mot', view.word, 'word') : '';
}

function masterLine(view) {
    if (!view.master) {
        return '';
    }
    const who = view.master.id === view.me.id ? 'Tu es' : `${e(view.master.name)} est`;
    return `<p class="master-line">${who} le <strong>Maître du jeu</strong></p>`;
}

function presenceDot(envelope, id) {
    const online = envelope.online.includes(id);
    return `<i class="fas fa-circle ${online ? 'online' : 'offline'}" data-online="${e(id)}"></i>`;
}

function playersList(envelope, { kick = false } = {}) {
    const { view } = envelope;
    const items = view.players.map((p) => {
        const you = p.id === view.me.id ? ' (toi)' : '';
        const hostTag = p.isHost ? ' <span class="badge badge-dark">hôte</span>' : '';
        const kickBtn = kick && !p.isHost && p.id !== view.me.id
            ? ` ${button('kick', '✕', { id: p.id }, 'btn btn-sm btn-link remove')}`
            : '';
        return `<li>${presenceDot(envelope, p.id)} ${e(p.name)}${you}${hostTag}${kickBtn}</li>`;
    });
    return `<ul class="players">${items.join('')}</ul>`;
}

function timerBlock(view, label) {
    if (!view.timer) {
        return '';
    }
    return `<div class="countdown"><span id="timer" data-timer="${view.timer.deadline}">--:--</span>${label ? `<small>${e(label)}</small>` : ''}</div>`;
}

function voteProgress(view) {
    const voted = view.players.filter((p) => p.hasVoted).length;
    return `<p class="progress-line">${view.me.hasVoted ? 'Ton vote est pris. ' : ''}${voted} sur ${view.players.length} ont voté</p>`;
}

function waiting(text) {
    return `<p class="waiting">${e(text)}</p>`;
}

function lobby(envelope) {
    const { view } = envelope;
    const enough = view.players.length >= envelope.minPlayers;
    let action = '';
    if (can(view, 'startRound')) {
        action = enough
            ? button('startRound', 'Lancer la partie', {}, 'btn btn-dark cta')
            : `<button type="button" class="btn btn-dark cta" disabled>Lancer la partie</button><small>Il faut au moins ${envelope.minPlayers} joueurs</small>`;
    } else {
        action = waiting('En attente de l\'hôte...');
    }
    return `<h2>Salon</h2>${playersList(envelope, { kick: view.me.isHost })}<div class="actions">${action}</div>`;
}

function roles(envelope) {
    const { view } = envelope;
    let master = '';
    if (can(view, 'setWord')) {
        master = `<form data-form="setWord" autocomplete="off" class="word-form">
            <input type="text" name="word" class="form-control" placeholder="Mot à faire deviner" maxlength="40" />
            <button type="submit" class="btn btn-warning">Valider</button>
        </form>
        <p>ou ${button('drawWord', 'Tirer un mot au hasard', {}, 'btn btn-outline-dark')}</p>`;
    } else {
        master = waiting('Le Maître du jeu choisit le mot...');
    }
    return `${masterLine(view)}${roleCard(view)}${master}`;
}

function word(envelope) {
    const { view } = envelope;
    const secret = view.word !== null ? wordCard(view) : waiting('Le Maître du jeu et le Traître découvrent le mot...');
    const action = can(view, 'startTimer') ? button('startTimer', 'Lancer le chrono', {}, 'btn btn-dark cta') : '';
    return `${masterLine(view)}${roleCard(view)}${secret}<div class="actions">${action}</div>`;
}

function playing(envelope) {
    const { view } = envelope;
    let found = '';
    if (can(view, 'wordFound')) {
        const options = view.players
            .filter((p) => p.id !== view.master?.id)
            .map((p) => button('wordFound', p.name, { finderId: p.id }, 'btn btn-outline-dark btn-block'))
            .join('');
        found = `<details class="found"><summary class="btn btn-warning cta">Mot trouvé par...</summary><div class="choices">${options}</div></details>`;
    }
    return `${timerBlock(view)}${masterLine(view)}${wordCard(view)}${found}`;
}

function discussion(envelope) {
    const { view } = envelope;
    const action = can(view, 'closeDiscussion') ? button('closeDiscussion', 'Passer au vote', {}, 'btn btn-dark cta') : waiting('Discutez... le Maître du jeu passera au vote');
    return `<h2>${e(view.finder?.name ?? '?')} a trouvé le mot</h2>${timerBlock(view, 'temps indicatif')}${wordCard(view)}<div class="actions">${action}</div>`;
}

function vote1(envelope) {
    const { view } = envelope;
    const finder = e(view.finder?.name ?? '?');
    const buttons = can(view, 'vote1')
        ? `<div class="vote-buttons">${button('vote1', '👍 Oui', { value: true }, 'btn btn-warning btn-lg')}${button('vote1', '👎 Non', { value: false }, 'btn btn-warning btn-lg')}</div>`
        : '';
    return `<h2>${finder} a trouvé le mot.<br/>Est-ce le Traître ?</h2>${buttons}${voteProgress(view)}`;
}

function vote2(envelope) {
    const { view } = envelope;
    let buttons = '';
    if (can(view, 'vote2') && view.candidates) {
        const players = view.candidates.filter((c) => c.id !== 'center');
        const center = view.candidates.find((c) => c.id === 'center');
        buttons = `<div class="choices">${players.map((c) => button('vote2', c.name, { candidate: c.id }, 'btn btn-outline-dark btn-block')).join('')}</div>`
            + (center ? `<div class="center-choice">${button('vote2', center.name, { candidate: center.id }, 'btn btn-outline-secondary btn-block')}</div>` : '');
    }
    return `<h2>Qui est le Traître ?</h2>${buttons}${voteProgress(view)}`;
}

function tiebreak(envelope) {
    const { view } = envelope;
    const names = (view.candidates ?? []).map((c) => `${e(c.name)} (${view.tallies?.[c.id] ?? 0})`).join(' et ');
    const action = can(view, 'tiebreak')
        ? `<p>À toi de départager</p><div class="choices">${(view.candidates ?? []).map((c) => button('tiebreak', c.name, { candidate: c.id }, 'btn btn-outline-dark btn-block')).join('')}</div>`
        : waiting(`${view.finder?.name ?? 'Le trouveur'} départage...`);
    return `<h2>Égalité entre ${names}</h2>${action}`;
}

function ended(envelope) {
    const { view } = envelope;
    const r = view.result;
    const insider = r?.insiderId ? `${e(playerName(view, r.insiderId))} était le Traître` : 'Il n\'y avait pas de Traître';
    const tallies = view.tallies
        ? `<ul class="tallies">${Object.entries(view.tallies).map(([id, n]) => `<li>${e(id === 'center' ? 'Pas de Traître' : playerName(view, id))} : ${n}</li>`).join('')}</ul>`
        : '';
    const actions = [
        can(view, 'startRound') ? button('startRound', 'Rejouer', {}, 'btn btn-dark cta') : '',
        can(view, 'reset') ? button('reset', 'Retour au salon', {}, 'btn btn-outline-dark') : ''
    ].join(' ');
    return `<h2>${e(r ? outcomeSentence(r) : 'Fin de partie')}</h2><p>${insider}. Le mot était <strong>${e(view.word ?? '?')}</strong>.</p>${tallies}<div class="actions">${actions || waiting('En attente de l\'hôte...')}</div>`;
}

const SCREENS = { lobby, roles, word, playing, discussion, vote1, vote2, tiebreak, ended };

/** @param {string} [error] */
export function renderJoin(error) {
    return `<h2>Qui es-tu ?</h2>
    <form data-form="join" autocomplete="off" class="join-form">
        <input type="text" name="name" class="form-control" placeholder="Ton prénom" maxlength="20" required autofocus />
        <button type="submit" class="btn btn-dark cta">Rejoindre</button>
        ${error ? `<p class="error">${e(error)}</p>` : ''}
    </form>`;
}

/** @param {{ view: any, online: string[], serverTime: number, minPlayers: number }} envelope */
export function render(envelope) {
    const { view } = envelope;
    const screen = SCREENS[view.phase] ?? (() => waiting('...'));
    return `<header class="me">C'est parti <strong>${e(view.me.name)}</strong>${view.me.isHost ? ' <span class="badge badge-dark">hôte</span>' : ''}</header>${screen(envelope)}`;
}

/** Met à jour les pastilles de présence sans re-rendre l'écran. */
export function patchPresence(root, envelope) {
    for (const dot of root.querySelectorAll('[data-online]')) {
        const online = envelope.online.includes(dot.getAttribute('data-online'));
        dot.classList.toggle('online', online);
        dot.classList.toggle('offline', !online);
    }
}

/** Met à jour le chrono. `offset` = serverTime - Date.now() au dernier state. */
export function patchTimer(root, offset) {
    const el = root.querySelector('[data-timer]');
    if (!el) {
        return;
    }
    const remaining = Number(el.getAttribute('data-timer')) - (Date.now() + offset);
    el.textContent = formatCountdown(remaining);
    el.classList.toggle('urgent', remaining < 30_000);
}
```

- [ ] **Step 6: Vérifier tests, lint**

Run: `npm test && npm run lint`
Expected: le test `dom.test.js` passe, lint sans erreur sur `public/js/`. `npm run typecheck` ne couvre pas `public/js/`.

- [ ] **Step 7: Commit**

```bash
git add eslint.config.js public/js/dom.js public/js/audio.js public/js/render.js test/client/dom.test.js
git commit -m "feat(client): pure helpers, audio unlock and per-phase render from the view

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Le point d'entrée client, la coquille, l'entrée serveur, le nettoyage

**Files:**
- Create: `public/js/client.js`
- Modify: `views/layouts/layout.ejs`
- Modify: `app.js` (réécriture complète)
- Modify: `public/css/style.css` (styles des cartes, chrono, toast, bandeau)
- Modify: `package.json` (retirer express-session)
- Delete: `views/welcome.ejs`, `views/board.ejs`, `views/adminPlayer.ejs`, `public/js/timer.js`, `public/pdf/help.pdf`

**Interfaces:**
- Consumes: `createApp` (Task 2), `render.js`, `audio.js`, `dom.js` (Task 4)

- [ ] **Step 1: Écrire client.js**

```js
// public/js/client.js
// Point d'entrée du navigateur : connexion socket, état courant, rendu, envoi des commandes.

import { render, renderJoin, patchPresence, patchTimer } from './render.js';
import { unlock, playFor } from './audio.js';
import { messageFor } from './dom.js';

const TOKEN_KEY = 'insider.token';
const screen = document.getElementById('screen');
const toast = document.getElementById('toast');
const banner = document.getElementById('banner');

/** @type {{ view: any, online: string[], serverTime: number, minPlayers: number } | null} */
let current = null;
let offset = 0;
/** @type {ReturnType<typeof setInterval> | null} */
let ticker = null;
let toastTimer = null;

function readToken() {
    try {
        return localStorage.getItem(TOKEN_KEY) ?? undefined;
    } catch {
        return undefined;
    }
}

function saveToken(token) {
    try {
        localStorage.setItem(TOKEN_KEY, token);
    } catch {
        // navigation privée ou stockage refusé : la partie tient tant que l'onglet reste ouvert
    }
}

function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
}

function stopTicker() {
    if (ticker !== null) {
        clearInterval(ticker);
        ticker = null;
    }
}

function startTicker() {
    stopTicker();
    patchTimer(screen, offset);
    ticker = setInterval(() => patchTimer(screen, offset), 250);
}

const socket = io({ auth: { token: readToken() } });

function showJoin(error) {
    current = null;
    stopTicker();
    screen.innerHTML = renderJoin(error);
    screen.querySelector('input[name="name"]')?.focus();
}

socket.on('needJoin', () => showJoin());
socket.on('joinFailed', ({ error, message }) => showJoin(messageFor({ ok: false, error, message })));
socket.on('joined', ({ token }) => saveToken(token));

socket.on('state', (envelope) => {
    offset = envelope.serverTime - Date.now();
    const previous = current;
    current = envelope;
    if (previous === null || previous.view.version !== envelope.view.version) {
        screen.innerHTML = render(envelope);
        playFor(previous?.view.phase, envelope.view.phase, envelope.view.result?.reason);
    } else {
        patchPresence(screen, envelope);
    }
    if (envelope.view.timer) {
        startTicker();
    } else {
        stopTicker();
    }
    banner.hidden = true;
});

socket.on('disconnect', () => {
    banner.hidden = false;
});

socket.on('connect', () => {
    banner.hidden = true;
});

function send(command) {
    socket.emit('command', command, (ack) => {
        if (!ack || !ack.ok) {
            showToast(messageFor(ack ?? { ok: false }));
        }
    });
}

screen.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const flip = target.closest('[data-flip]');
    if (flip) {
        const flipped = flip.toggleAttribute('data-flipped');
        flip.setAttribute('aria-pressed', String(flipped));
        return;
    }
    const cmd = target.closest('[data-cmd]');
    if (cmd) {
        unlock();
        const args = JSON.parse(cmd.getAttribute('data-args') || '{}');
        send({ type: cmd.getAttribute('data-cmd'), ...args });
    }
});

screen.addEventListener('submit', (event) => {
    const form = /** @type {HTMLFormElement} */ (event.target).closest('form[data-form]');
    if (!form) {
        return;
    }
    event.preventDefault();
    unlock();
    const data = new FormData(form);
    if (form.dataset.form === 'join') {
        socket.emit('join', { name: String(data.get('name') ?? '') });
    } else if (form.dataset.form === 'setWord') {
        send({ type: 'setWord', word: String(data.get('word') ?? '') });
    }
});
```

- [ ] **Step 2: Réécrire le layout**

`views/layouts/layout.ejs` :

```html
<!DOCTYPE html>
<html lang="fr">
    <head>
        <meta charset="utf-8">
        <title>Online Insider Game</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0/css/bootstrap.min.css" integrity="sha384-Gn5384xqQ1aoWXA+058RXPxPg6fy4IWvTNh0E263XmFcJlSAwiGgFAW/dAiS6JXm" crossorigin="anonymous">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.9.0/css/all.css">
        <link rel="stylesheet" href="/static/css/style.css">
        <link rel="stylesheet" href="/static/css/form.css">
        <link rel="icon" type="image/png" sizes="32x32" href="/static/image/favicon-32x32.png">
        <link rel="icon" type="image/png" sizes="96x96" href="/static/image/favicon-96x96.png">
        <link rel="icon" type="image/png" sizes="16x16" href="/static/image/favicon-16x16.png">
    </head>
    <body class="content">
        <div class="container-fluid">
            <header>
                <img src="/static/image/title.jpg" alt="Insider" />
            </header>
            <div class="row">
                <div class="col-lg-12">
                    <%- body %>
                </div>
            </div>
        </div>
        <script src="/socket.io/socket.io.js"></script>
        <script type="module" src="/static/js/client.js"></script>
    </body>
</html>
```

- [ ] **Step 3: Réécrire app.js (entrée)**

```js
// app.js
// Entrée du serveur : lit l'environnement, charge la liste de mots, démarre le transport.

import { readFileSync } from 'node:fs';
import { createApp } from './src/server/app.js';

const env = process.env;
const PORT = Number(env.PORT ?? 8080);
const wordsFile = new URL(env.WORDS_FILE ?? './words/famille.csv', import.meta.url);

const words = readFileSync(wordsFile, 'utf8')
    .split(/\r?\n/)
    .map((word) => word.trim())
    .filter(Boolean);

const settings = {
    minPlayers: Number(env.MIN_PLAYERS ?? 4),
    traitorOptional: env.TRAITOR_OPTIONAL !== 'false',
    timerMs: Number(env.TIMER_MS ?? 300_000)
};

const { httpServer } = createApp({ settings, words });

httpServer.listen(PORT, () => {
    console.log(`Insider game listening on port ${PORT} (minPlayers ${settings.minPlayers}, timer ${settings.timerMs} ms, traitorOptional ${settings.traitorOptional})`);
});
```

- [ ] **Step 4: Styles ajoutés**

Ajouter à la fin de `public/css/style.css` :

```css
/* Chantier branchement : cartes, chrono, toast, bandeau */
.me { margin: 10px 0; }
.players { list-style: none; padding: 0; display: inline-block; text-align: left; }
.players li { margin: 6px 0; font-size: 1.1em; }
.players .online { color: #28a745; }
.players .offline { color: #999; }
.card-flip { position: relative; display: block; width: 260px; max-width: 90%; height: 150px; margin: 14px auto; border: 0; background: transparent; perspective: 800px; cursor: pointer; }
.card-flip .card-face { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; border-radius: 12px; font-size: 1.3em; transition: transform 0.5s; backface-visibility: hidden; }
.card-flip .card-face small { font-size: 0.6em; margin-top: 8px; opacity: 0.7; }
.card-flip .card-front { background: #222; color: #ffc107; }
.card-flip .card-back { background: #ffc107; color: #222; transform: rotateY(180deg); }
.card-flip[data-flipped] .card-front { transform: rotateY(180deg); }
.card-flip[data-flipped] .card-back { transform: rotateY(0deg); }
.countdown { font-size: 3.5em; font-weight: bold; margin: 10px 0; }
.countdown .urgent { color: #222; }
.countdown small { display: block; font-size: 0.3em; }
.actions { margin: 16px 0; }
.choices .btn { margin: 6px 0; font-size: 1.15em; padding: 12px; }
.center-choice { margin-top: 14px; }
.vote-buttons .btn { margin: 8px; min-width: 120px; font-size: 1.5em; }
.progress-line, .waiting, .master-line { margin-top: 12px; }
.found summary { list-style: none; }
.toast-message { position: fixed; left: 50%; bottom: 90px; transform: translateX(-50%); background: #222; color: #fff; padding: 10px 16px; border-radius: 8px; z-index: 10; }
.banner { position: fixed; top: 0; left: 0; right: 0; background: #222; color: #ffc107; padding: 6px; text-align: center; z-index: 10; }
.error { color: #222; font-weight: bold; margin-top: 8px; }
```

- [ ] **Step 5: Nettoyage**

```bash
git rm -q views/welcome.ejs views/board.ejs views/adminPlayer.ejs public/js/timer.js public/pdf/help.pdf
npm uninstall express-session --no-fund --loglevel=error
```

Vérifier que `package.json` ne liste plus `express-session` et que `dependencies` contient exactement `ejs`, `express`, `express-ejs-layouts`, `socket.io`.

- [ ] **Step 6: Vérifier**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tout vert, plus aucun warning sur `timer.js` (supprimé).

Run:
```bash
MIN_PLAYERS=2 PORT=8096 timeout 4 node app.js ; echo "exit=$? (124 attendu)"
git grep -n -i jquery -- ':!docs' ':!screenshots' ; echo "jquery ci-dessus (attendu : rien)"
```
Expected: le serveur démarre avec la ligne de log, le grep est vide.

Run (fumée HTTP, serveur lancé en tâche de fond puis arrêté) :
```bash
MIN_PLAYERS=2 PORT=8097 node app.js & PID=$!; sleep 1; curl -s http://localhost:8097/ | grep -c 'id="screen"'; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8097/static/js/client.js; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8097/socket.io/socket.io.js; kill $PID
```
Expected: `1`, `200`, `200`.

- [ ] **Step 7: Commit**

```bash
git add -A app.js views public/js/client.js public/css/style.css package.json package-lock.json
git commit -m "feat(client): single page client with token join, per-phase screens, flip cards and timer; remove 2020 views, jQuery and session

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: README, checklist mobile, critères de fin

**Files:**
- Modify: `README.md`
- Create: `docs/checklist-mobile.md`
- Modify: `docs/comite-2026-09-17-architecture-cible.md` (cocher les étapes 2 et 3)

- [ ] **Step 1: README**

Remplacer la section Setup et la section Développement du README par :

```markdown
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

## Développement

Le moteur de jeu pur vit dans `src/engine/` (`createGame`, `apply`, `view`). `src/server/` l'adapte au transport socket.io, `public/js/` est le client sans framework. Un seul événement `state` porte tout ce qu'un joueur a le droit de voir.

- Règles implémentées : `docs/adr/0001-regles-du-jeu.md`
- Conception du moteur : `docs/specs/2026-09-17-moteur-de-jeu-design.md`
- Conception du branchement : `docs/specs/2026-09-17-branchement-design.md`
- Décisions d'architecture : `docs/comite-2026-09-17-architecture-cible.md`
- Checklist avant une partie sur téléphone : `docs/checklist-mobile.md`
- Audit initial : `docs/audit-2026-09-17.md`
```

Mettre à jour la section Techno : `- Node 22, ESM`, `- Express 5 (coquille et statiques)`, `- Socket.io 4`, `- Client vanilla, Bootstrap 4`.

- [ ] **Step 2: Checklist mobile**

`docs/checklist-mobile.md` :

```markdown
---
date: 2026-09-17
contexte: Vérifications manuelles sur téléphones réels avant une partie, ce que les tests automatiques ne prouvent pas
---

# Checklist mobile

À passer sur un iPhone (Safari) et un Android (Chrome) réels, serveur lancé avec `MIN_PLAYERS=2`.

- [ ] Le son sort après le premier tap (Rejoindre), puis à chaque changement de phase
- [ ] L'écran ne se verrouille pas pendant le chrono (Wake Lock)
- [ ] Un reload en pleine partie revient au bon écran, avec le même prénom
- [ ] Verrouiller puis déverrouiller le téléphone revient au bon écran, le chrono est juste
- [ ] Deux onglets du même téléphone comptent pour un seul joueur en ligne
- [ ] Couper le réseau 10 secondes affiche le bandeau "Reconnexion...", le rétablir rattrape l'état

Résultats, date et appareils :

| Date | Appareil | Résultat | Notes |
|---|---|---|---|
```

- [ ] **Step 3: Cocher les étapes du comité**

Dans `docs/comite-2026-09-17-architecture-cible.md`, section Actions, ajouter après la ligne de l'étape 1 :

```markdown
- [x] Étapes 2 et 3 : `state` unique, `render(view)` vanilla, identité par token, adaptateur `src/server/` (17/09)
```

- [ ] **Step 4: Vérification finale et commit**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add README.md docs/checklist-mobile.md docs/comite-2026-09-17-architecture-cible.md
git commit -m "docs: wiring status, environment variables, mobile checklist

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
