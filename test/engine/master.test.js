import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SERVER, allowedActions } from '../../src/engine/game.js';
import { view } from '../../src/engine/view.js';
import { started, run, expectFail } from './helpers.js';

/** Manche en enquête où l'hôte (p1) n'est pas le Maître. */
function playingWithHostNotMaster() {
    for (let seed = 1; seed < 50; seed++) {
        const ctx = started(4, { seed, settings: { traitorOptional: false } });
        if (ctx.master !== ctx.host) {
            const game = run(ctx.game, ctx.deps, { type: 'setWord', actor: ctx.master, word: 'Lune' }, { type: 'startTimer', actor: ctx.host });
            return { ...ctx, game };
        }
    }
    throw new Error('no seed with a non-master host');
}

test('D8 : l\'hôte ne déclare pas le mot trouvé quand le Maître est en ligne', () => {
    const { game, deps, host, commons } = playingWithHostNotMaster();
    const finder = commons.find((id) => id !== host) ?? commons[0];
    expectFail(game, deps, { type: 'wordFound', actor: host, finderId: finder }, 'FORBIDDEN');
    assert.ok(!allowedActions(game, host).includes('wordFound'));
});

test('D8 : Maître hors ligne, l\'hôte déclare et clôt la discussion à sa place', () => {
    const { game, deps, host, commons, advance } = playingWithHostNotMaster();
    const away = run(game, deps, { type: 'setMasterAway', actor: SERVER, away: true });
    assert.equal(away.masterAway, true);
    assert.ok(allowedActions(away, host).includes('wordFound'));
    advance(1000);
    const finder = commons.find((id) => id !== host) ?? commons[0];
    const disc = run(away, deps, { type: 'wordFound', actor: host, finderId: finder });
    const v1 = run(disc, deps, { type: 'closeDiscussion', actor: host });
    assert.equal(v1.phase.name, 'vote1');
});

test('D8 : closeDiscussion refusé à l\'hôte quand le Maître est revenu', () => {
    const { game, deps, host, master, commons, advance } = playingWithHostNotMaster();
    advance(1000);
    const disc = run(game, deps, { type: 'wordFound', actor: master, finderId: commons[0] });
    const back = run(disc, deps, { type: 'setMasterAway', actor: SERVER, away: true }, { type: 'setMasterAway', actor: SERVER, away: false });
    expectFail(back, deps, { type: 'closeDiscussion', actor: host }, 'FORBIDDEN');
});

test('setMasterAway est réservé au serveur', () => {
    const { game, deps, host } = playingWithHostNotMaster();
    expectFail(game, deps, { type: 'setMasterAway', actor: host, away: true }, 'FORBIDDEN');
});

test('point 4 : en fin de manche, la vue expose tous les rôles et la carte du centre', () => {
    const ctx = started(4, { settings: { traitorOptional: true, timerMs: 10 } });
    let game = run(ctx.game, ctx.deps, { type: 'setWord', actor: ctx.master, word: 'A' }, { type: 'startTimer', actor: ctx.host });
    ctx.advance(10);
    game = run(game, ctx.deps, { type: 'timeout', actor: SERVER });
    const v = view(game, 'p2');
    assert.deepEqual(v.result?.roles, game.roles);
    assert.equal(v.result?.centerCard, game.centerCard);
});

test('point 4 : les rôles ne sont jamais exposés avant la fin de manche', () => {
    const { game } = playingWithHostNotMaster();
    assert.equal(view(game, 'p2').result, null);
});
