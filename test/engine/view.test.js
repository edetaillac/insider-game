import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidates, CENTER, allowedActions } from '../../src/engine/game.js';
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

test('allowedActions ne lève pas quand ballots est vide', () => {
    const ctx = inVote1(4);
    assert.equal(ctx.game.phase.name, 'vote1');
    assert.deepEqual(ctx.game.phase.ballots, {});
    assert.doesNotThrow(() => allowedActions(ctx.game, ctx.game.players[0].id));
});
