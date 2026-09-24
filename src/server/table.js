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
/** @typedef {{ view: View, online: PlayerId[], serverTime: number, minPlayers: number, shareUrl: string|null }} Snapshot */
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
    kick: Object.freeze({ id: 'string' }),
    claimHost: Object.freeze({}),
    seenRole: Object.freeze({}),
    seenWord: Object.freeze({})
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
 *   clearTimer?: (handle: any) => void,
 *   shareUrl?: string|null
 * }} options
 */
export function createTable({ settings = {}, words, now = Date.now, random = Math.random, setTimer = setTimeout, clearTimer = clearTimeout, shareUrl = null }) {
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
                const result = apply(game, { type: 'timeout', actor: SERVER }, deps);
                if (result.ok) {
                    commit(result);
                } else {
                    scheduleTimeout();
                }
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
     * Reprise de la main : un joueur prend le rôle d'hôte quand l'hôte actuel est hors ligne.
     * Explicite plutôt qu'automatique, un écran verrouillé suffit à couper le socket sur mobile.
     * @param {PlayerId} actor
     * @returns {Result}
     */
    function claimHost(actor) {
        const host = game.players.find((p) => p.isHost);
        if (host?.id === actor) {
            return fail('FORBIDDEN', 'already host');
        }
        if (host && (sockets.get(host.id)?.size ?? 0) > 0) {
            return fail('FORBIDDEN', 'the host is online');
        }
        return commit(apply(game, { type: 'setHost', actor: SERVER, id: actor }, deps));
    }

    /**
     * Commande d'un joueur (validée) ou du serveur (brute).
     * @param {PlayerId | typeof SERVER} actor
     * @param {unknown} payload
     * @returns {Result}
     */
    function dispatch(actor, payload) {
        if (actor === SERVER) {
            // Branche serveur : payload de confiance, jamais atteignable depuis un socket (l'acteur vient d'un token resolu).
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
        if (checked.command.type === 'claimHost') {
            return claimHost(actor);
        }
        return commit(apply(game, /** @type {any} */ ({ ...checked.command, actor }), deps));
    }

    /**
     * @param {PlayerId} playerId
     * @returns {Snapshot}
     */
    function snapshot(playerId) {
        return { view: view(game, playerId), online: online(), serverTime: now(), minPlayers: game.settings.minPlayers, shareUrl };
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
        /** Etat brut du moteur, pour les tests et l'adaptateur seulement. Le transport n'emet que snapshot(playerId). */
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
