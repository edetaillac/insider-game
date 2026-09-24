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
    const hasVoted = (id) => Boolean(ballots && Object.hasOwn(ballots, id));
    const seen = 'seen' in phase ? phase.seen : null;
    /** @param {PlayerId} id */
    const hasSeen = (id) => Boolean(seen && Object.hasOwn(seen, id));
    /** @type {boolean|CandidateId|null} */
    const myBallot = ballots && Object.hasOwn(ballots, playerId) ? ballots[playerId] : null;
    const finderId = 'finderId' in phase ? phase.finderId : null;
    const finderPlayer = finderId !== null ? game.players.find((p) => p.id === finderId) : undefined;
    const masterId = Object.keys(game.roles ?? {}).find((id) => game.roles?.[id] === 'master') ?? null;
    const masterPlayer = masterId !== null ? game.players.find((p) => p.id === masterId) : undefined;
    const tallies = phase.name === 'tiebreak' || phase.name === 'ended' ? phase.tallies : null;

    /** @param {CandidateId} id */
    const candidateName = (id) => (id === CENTER ? CENTER_LABEL : (game.players.find((p) => p.id === id)?.name ?? id));

    /** @type {View['candidates']} */
    let candidateList = null;
    if (phase.name === 'vote2') {
        candidateList = candidates(game).map((id) => ({ id, name: candidateName(id) }));
    } else if (phase.name === 'tiebreak') {
        candidateList = phase.tied.map((id) => ({ id, name: candidateName(id) }));
    }

    // ADR D6 révisé : le Traître lit le mot une seule fois, au rituel. Pendant l'enquête et les votes, seul le Maître le garde.
    const wordVisible = game.word !== null && (ended || myRole === 'master' || (myRole === 'insider' && phase.name === 'word'));

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
            pointed: phase.pointed,
            // Fin de manche : tout est révélé, pour que le résultat raconte la manche
            roles: { ...(game.roles ?? {}) }
        };
    }

    return {
        version: game.version,
        phase: phase.name,
        me: { id: me.id, name: me.name, isHost: me.isHost, role: myRole, hasVoted: hasVoted(me.id), hasSeen: hasSeen(me.id), ballot: myBallot },
        players: game.players.map((p) => ({ id: p.id, name: p.name, isHost: p.isHost, hasVoted: hasVoted(p.id), hasSeen: hasSeen(p.id) })),
        word: wordVisible ? game.word : null,
        master: masterPlayer ? { id: masterPlayer.id, name: masterPlayer.name } : null,
        finder: finderPlayer ? { id: finderPlayer.id, name: finderPlayer.name } : null,
        timer: (phase.name === 'playing' || phase.name === 'discussion')
            ? { startedAt: phase.startedAt, deadline: phase.deadline }
            : null,
        candidates: candidateList,
        tallies,
        result,
        hostChange: game.hostChange,
        actions: allowedActions(game, playerId)
    };
}
