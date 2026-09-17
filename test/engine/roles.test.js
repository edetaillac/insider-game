import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, apply, SERVER } from '../../src/engine/game.js';
import { mulberry32 } from '../../src/engine/rng.js';
import { lobby, started, run, expectFail, withRole } from './helpers.js';

test('startRound distribue un Maître, un Traître, le reste Citoyens, sans variante', () => {
    for (const n of [4, 8]) {
        const { game } = started(n, { settings: { traitorOptional: false } });
        assert.equal(game.phase.name, 'roles');
        assert.equal(game.word, null);
        assert.equal(game.centerCard, null);
        assert.equal(withRole(game, 'master').length, 1);
        assert.equal(withRole(game, 'insider').length, 1);
        assert.equal(withRole(game, 'common').length, n - 2);
        assert.equal(Object.keys(game.roles).length, n);
    }
});

test('startRound avec variante : la carte du centre est tirée, un seul Traître entre joueurs et centre', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const { game } = started(5, { seed });
        assert.equal(withRole(game, 'master').length, 1);
        assert.ok(game.centerCard === 'insider' || game.centerCard === 'common');
        const insiders = withRole(game, 'insider').length + (game.centerCard === 'insider' ? 1 : 0);
        assert.equal(insiders, 1, `seed ${seed}`);
        assert.equal(Object.keys(game.roles).length, 5);
    }
});

test('le Maître n\'est jamais la carte du centre et tous les joueurs ont un rôle', () => {
    for (const seed of [11, 12, 13, 14, 15]) {
        const { game } = started(6, { seed });
        assert.notEqual(game.centerCard, 'master');
        for (const p of game.players) {
            assert.ok(['master', 'insider', 'common'].includes(game.roles[p.id]));
        }
    }
});

test('la carte du centre est le Traître avec une fréquence proche de 1/(n-1)', () => {
    const n = 6;
    const trials = 1000;
    let centerInsider = 0;
    for (let seed = 1; seed <= trials; seed++) {
        const { game } = started(n, { seed });
        if (game.centerCard === 'insider') {
            centerInsider += 1;
        }
    }
    const freq = centerInsider / trials;
    const expected = 1 / (n - 1);
    assert.ok(Math.abs(freq - expected) < expected * 0.2, `fréquence ${freq}, attendu ${expected}`);
});

test('startRound refuse sous minPlayers et pour un non hôte', () => {
    const { game, deps } = lobby(3);
    expectFail(game, deps, { type: 'startRound', actor: 'p1' }, 'TOO_FEW_PLAYERS');
    const four = lobby(4);
    expectFail(four.game, four.deps, { type: 'startRound', actor: 'p2' }, 'FORBIDDEN');
});

test('startRound refuse avec trop de joueurs (TOO_MANY_PLAYERS)', () => {
    const { game, deps } = lobby(5, { settings: { traitorOptional: false } });
    const tooMany = { ...game, settings: { ...game.settings, maxPlayers: 4 } };
    expectFail(tooMany, deps, { type: 'startRound', actor: 'p1' }, 'TOO_MANY_PLAYERS');
});

test('startRound depuis ended relance une manche et remet le mot à null', () => {
    const { game, deps, host } = started(4);
    const ended = { ...game, phase: /** @type {const} */ ({ name: 'ended', outcome: 'allLose', reason: 'timeout', finderId: null, tallies: null, pointed: null }), word: 'Ancien' };
    const again = run(ended, deps, { type: 'startRound', actor: host });
    assert.equal(again.phase.name, 'roles');
    assert.equal(again.word, null);
    assert.equal(withRole(again, 'master').length, 1);
});

test('startRound est déterministe pour une seed donnée', () => {
    const a = started(6, { seed: 99 });
    const b = started(6, { seed: 99 });
    assert.deepEqual(a.game.roles, b.game.roles);
    assert.equal(a.game.centerCard, b.game.centerCard);
});

test('startRound ne mute pas l\'état d\'entrée', () => {
    const { game, deps } = lobby(4);
    const before = structuredClone(game);
    const r = apply(game, { type: 'startRound', actor: 'p1' }, deps);
    assert.ok(r.ok);
    assert.deepEqual(game, before);
});

test('addPlayer en phase roles est refusé (WRONG_PHASE)', () => {
    const { game, deps } = started(4);
    expectFail(game, deps, { type: 'addPlayer', actor: SERVER, id: 'p9', name: 'Tard' }, 'WRONG_PHASE');
});

test('mulberry32 alimente bien le tirage : deux seeds donnent des Maîtres différents sur 20 essais', () => {
    const masters = new Set();
    for (let seed = 1; seed <= 20; seed++) {
        const g = createGame({ traitorOptional: false });
        const deps = { rng: mulberry32(seed), now: () => 0, words: ['x'] };
        let game = g;
        for (let i = 1; i <= 4; i++) {
            game = run(game, deps, { type: 'addPlayer', actor: SERVER, id: `p${i}`, name: `J${i}`, isHost: i === 1 });
        }
        game = run(game, deps, { type: 'startRound', actor: 'p1' });
        masters.add(withRole(game, 'master')[0]);
    }
    assert.ok(masters.size > 1);
});
