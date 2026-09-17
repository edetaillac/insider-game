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
