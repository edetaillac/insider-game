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
