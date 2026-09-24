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
 * | { name: 'roles', seen: Record<PlayerId, true> }
 * | { name: 'word', seen: Record<PlayerId, true> }
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
 *   phase: Phase,
 *   hostChange: HostChange|null
 * }} Game */

/** Dernier transfert d'hôte, oublié au changement de phase suivant. @typedef {{ from: PlayerId|null, to: PlayerId, at: number }} HostChange */

/**
 * @typedef {(
 *   { type: 'addPlayer', actor: 'server', id: PlayerId, name: string, isHost?: boolean }
 * | { type: 'removePlayer', actor: 'server', id: PlayerId }
 * | { type: 'setHost', actor: 'server', id: PlayerId }
 * | { type: 'timeout', actor: 'server' }
 * | { type: 'startRound', actor: PlayerId }
 * | { type: 'setWord', actor: PlayerId, word: string }
 * | { type: 'drawWord', actor: PlayerId }
 * | { type: 'startTimer', actor: PlayerId }
 * | { type: 'wordFound', actor: PlayerId, finderId: PlayerId }
 * | { type: 'closeDiscussion', actor: PlayerId }
 * | { type: 'seenRole', actor: PlayerId }
 * | { type: 'seenWord', actor: PlayerId }
 * | { type: 'vote1', actor: PlayerId, value: boolean }
 * | { type: 'vote2', actor: PlayerId, candidate: CandidateId }
 * | { type: 'tiebreak', actor: PlayerId, candidate: CandidateId }
 * | { type: 'reset', actor: PlayerId }
 * )} Command */

/** @typedef {Command['type']} CommandType */

/** @typedef {'WRONG_PHASE'|'FORBIDDEN'|'INVALID_ARGUMENT'|'TOO_FEW_PLAYERS'|'TOO_MANY_PLAYERS'|'DUPLICATE_NAME'|'DUPLICATE_ID'|'NOT_YET'|'UNKNOWN_PLAYER'} ErrorCode */

/** @typedef {{ ok: true, game: Game } | { ok: false, error: ErrorCode, message: string }} Result */

/** @typedef {{ rng: () => number, now: () => number, words: readonly string[] }} Deps */

/**
 * Vue d'un joueur. `claimHost` n'est jamais produit par le moteur : la table l'ajoute selon la présence.
 * @typedef {{
 *   version: number,
 *   phase: Phase['name'],
 *   me: { id: PlayerId, name: string, isHost: boolean, role: Role|null, hasVoted: boolean, hasSeen: boolean, ballot: boolean|CandidateId|null },
 *   players: Array<{ id: PlayerId, name: string, isHost: boolean, hasVoted: boolean, hasSeen: boolean }>,
 *   word: string|null,
 *   master: { id: PlayerId, name: string }|null,
 *   finder: { id: PlayerId, name: string }|null,
 *   timer: { startedAt: number, deadline: number }|null,
 *   candidates: Array<{ id: CandidateId, name: string }>|null,
 *   tallies: Record<CandidateId, number>|null,
 *   result: { outcome: Outcome, reason: Reason, insiderId: PlayerId|null, centerCard: Role|null,
 *             tallies: Record<CandidateId, number>|null, pointed: CandidateId|null }|null,
 *   hostChange: HostChange|null,
 *   actions: Array<CommandType|'claimHost'>
 * }} View */

export {};
