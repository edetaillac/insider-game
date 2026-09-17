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
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    if (merged.minPlayers < 2) {
        throw new Error(`invalid settings: minPlayers must be >= 2, got ${merged.minPlayers}`);
    }
    if (merged.minPlayers > merged.maxPlayers) {
        throw new Error(`invalid settings: minPlayers (${merged.minPlayers}) must be <= maxPlayers (${merged.maxPlayers})`);
    }
    if (merged.timerMs <= 0) {
        throw new Error(`invalid settings: timerMs must be > 0, got ${merged.timerMs}`);
    }
    return {
        version: 0,
        settings: merged,
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
    const hasVoted = 'ballots' in game.phase && Object.hasOwn(game.phase.ballots, playerId);
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
    if (typeof command.type !== 'string' || !Object.hasOwn(PHASES_BY_COMMAND, command.type)) {
        return fail('INVALID_ARGUMENT', `unknown command ${String(command.type)}`);
    }
    const phases = PHASES_BY_COMMAND[command.type];
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
    if (typeof command.id !== 'string' || command.id.trim() === '' || command.id === CENTER || command.id === SERVER) {
        return fail('INVALID_ARGUMENT', 'invalid player id');
    }
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
    const minPlayers = Math.max(2, game.settings.minPlayers);
    if (game.players.length < minPlayers) {
        return fail('TOO_FEW_PLAYERS', `need at least ${minPlayers} players`);
    }
    if (game.players.length > effectiveMaxPlayers(game)) {
        return fail('TOO_MANY_PLAYERS', `max ${effectiveMaxPlayers(game)} players`);
    }
    const { roles, centerCard } = assignRoles(game, deps.rng);
    return next(game, { roles, centerCard, word: null, phase: { name: 'roles' } });
}

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

/** @type {Record<CommandType, (game: Game, command: any, deps: Deps) => Result>} */
const HANDLERS = {
    addPlayer,
    removePlayer,
    reset,
    startRound,
    setWord,
    drawWord,
    startTimer,
    wordFound,
    timeout,
    closeDiscussion,
    vote1,
    vote2,
    tiebreak
};

// Exporté pour les tests de grille et la vue.
export { PHASES_BY_COMMAND, ALL_PHASES };
