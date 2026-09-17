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
    const cands = candidates(ctx.game);
    // Les candidats sont dans l'ordre d'arrivée : on réordonne les votes pour forcer l'égalité
    // sur ctx.insider et un autre candidat, quelle que soit sa position dans `cands`.
    const otherCandidate = cands.find((c) => c !== ctx.insider);
    const thirdCandidate = cands.find((c) => c !== ctx.insider && c !== otherCandidate);
    const tb = castAll(ctx, ctx.game, (_id, i) => (i < 2 ? ctx.insider : otherCandidate));
    assert.equal(tb.phase.name, 'tiebreak');
    assert.deepEqual([...tb.phase.tied].sort(), [ctx.insider, otherCandidate].sort());
    const notFinder = ctx.game.players.map((p) => p.id).find((id) => id !== ctx.finderId);
    expectFail(tb, ctx.deps, { type: 'tiebreak', actor: notFinder, candidate: ctx.insider }, 'FORBIDDEN');
    expectFail(tb, ctx.deps, { type: 'tiebreak', actor: ctx.finderId, candidate: thirdCandidate }, 'INVALID_ARGUMENT');
    const ended = run(tb, ctx.deps, { type: 'tiebreak', actor: ctx.finderId, candidate: ctx.insider });
    assert.equal(ended.phase.name, 'ended');
    assert.equal(ended.phase.reason, 'tiebreak');
    assert.equal(ended.phase.pointed, ctx.insider);
    assert.equal(ended.phase.outcome, 'commonsWin');
    assert.deepEqual(ended.phase.tallies, tb.phase.tallies);
});

test('les tallies sont dérivés des bulletins, un bulletin remplacé ne compte qu\'une fois', () => {
    const ctx = inVote2(4, NO_VARIANT);
    const [c0, c1] = candidates(ctx.game);
    const ids = ctx.game.players.map((p) => p.id);
    const game = run(ctx.game, ctx.deps,
        { type: 'vote2', actor: ids[0], candidate: c0 },
        { type: 'vote2', actor: ids[0], candidate: c1 },
        { type: 'vote2', actor: ids[1], candidate: c1 },
        { type: 'vote2', actor: ids[2], candidate: c1 },
        { type: 'vote2', actor: ids[3], candidate: c1 });
    assert.equal(game.phase.name, 'ended');
    assert.equal(game.phase.tallies[c0], 0);
    assert.equal(game.phase.tallies[c1], 4);
});
