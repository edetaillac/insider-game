import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedActions } from '../../src/engine/game.js';
import { view } from '../../src/engine/view.js';
import { started, inVote1, inVote2, run, expectFail } from './helpers.js';

const NO_VARIANT = { settings: { traitorOptional: false } };

test('startRound ouvre roles avec seen vide, setWord ouvre word avec seen vide', () => {
    const ctx = started(4, NO_VARIANT);
    assert.deepEqual(ctx.game.phase, { name: 'roles', seen: {} });
    const inWord = run(ctx.game, ctx.deps, { type: 'setWord', actor: ctx.master, word: 'Lune' });
    assert.deepEqual(inWord.phase, { name: 'word', seen: {} });
});

test('seenRole marque le joueur, est idempotent, et disparaît de ses actions', () => {
    const ctx = started(4, NO_VARIANT);
    const a = ctx.game.players[1].id;
    assert.ok(allowedActions(ctx.game, a).includes('seenRole'));
    let game = run(ctx.game, ctx.deps, { type: 'seenRole', actor: a });
    assert.deepEqual(game.phase, { name: 'roles', seen: { [a]: true } });
    game = run(game, ctx.deps, { type: 'seenRole', actor: a });
    assert.deepEqual(game.phase, { name: 'roles', seen: { [a]: true } });
    assert.ok(!allowedActions(game, a).includes('seenRole'));
    assert.ok(allowedActions(game, ctx.game.players[2].id).includes('seenRole'));
});

test('seenWord fonctionne en word et seenRole y est refusé', () => {
    const ctx = started(4, NO_VARIANT);
    const inWord = run(ctx.game, ctx.deps, { type: 'setWord', actor: ctx.master, word: 'Lune' });
    const a = ctx.game.players[0].id;
    expectFail(inWord, ctx.deps, { type: 'seenRole', actor: a }, 'WRONG_PHASE');
    const game = run(inWord, ctx.deps, { type: 'seenWord', actor: a });
    assert.deepEqual(game.phase.seen, { [a]: true });
    expectFail(game, ctx.deps, { type: 'seenWord', actor: 'ghost' }, 'FORBIDDEN');
});

test('la vue expose hasSeen pour soi et pour les autres, faux hors roles et word', () => {
    const ctx = started(4, NO_VARIANT);
    const [a, b] = ctx.game.players.map((p) => p.id);
    const game = run(ctx.game, ctx.deps, { type: 'seenRole', actor: a });
    const va = view(game, a);
    const vb = view(game, b);
    assert.equal(va.me.hasSeen, true);
    assert.equal(vb.me.hasSeen, false);
    assert.equal(vb.players.find((p) => p.id === a).hasSeen, true);
    assert.equal(vb.players.find((p) => p.id === b).hasSeen, false);
    const v1 = inVote1(4, NO_VARIANT);
    assert.equal(view(v1.game, a).me.hasSeen, false);
    assert.ok(view(v1.game, a).players.every((p) => p.hasSeen === false));
});

test('me.ballot expose le bulletin du joueur seul, vote1 puis vote2', () => {
    const ctx = inVote1(4, NO_VARIANT);
    const [a, b] = ctx.game.players.map((p) => p.id);
    assert.equal(view(ctx.game, a).me.ballot, null);
    let game = run(ctx.game, ctx.deps, { type: 'vote1', actor: a, value: true });
    assert.equal(view(game, a).me.ballot, true);
    assert.equal(view(game, b).me.ballot, null);
    assert.ok(view(game, b).players.every((p) => !('ballot' in p)));
    const v2 = inVote2(4, NO_VARIANT);
    const cand = v2.game.players.find((p) => v2.game.roles[p.id] !== 'master').id;
    game = run(v2.game, v2.deps, { type: 'vote2', actor: a, candidate: cand });
    assert.equal(view(game, a).me.ballot, cand);
    assert.equal(view(game, b).me.ballot, null);
});

test('vote1 et vote2 restent dans les actions après un bulletin (vote modifiable)', () => {
    const ctx = inVote1(4, NO_VARIANT);
    const a = ctx.game.players[0].id;
    const game = run(ctx.game, ctx.deps, { type: 'vote1', actor: a, value: false });
    assert.ok(allowedActions(game, a).includes('vote1'));
    const changed = run(game, ctx.deps, { type: 'vote1', actor: a, value: true });
    assert.equal(view(changed, a).me.ballot, true);
});
