import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SERVER } from '../../src/engine/game.js';
import { started, run, expectFail } from './helpers.js';

const NO_VARIANT = { settings: { traitorOptional: false } };

test('setWord par le Maître fixe le mot et passe en word', () => {
    const { game, deps, master } = started(4);
    const next = run(game, deps, { type: 'setWord', actor: master, word: '  Château ' });
    assert.equal(next.phase.name, 'word');
    assert.equal(next.word, 'Château');
});

test('setWord refuse un mot vide et un acteur qui n\'est pas le Maître', () => {
    let ctx;
    for (let seed = 1; seed < 200 && !ctx; seed++) {
        const candidate = started(4, { seed });
        if (candidate.host !== candidate.master) {
            ctx = candidate;
        }
    }
    assert.ok(ctx, 'aucune seed avec un hôte non Maître trouvée');
    const { game, deps, master, commons, host } = ctx;
    expectFail(game, deps, { type: 'setWord', actor: master, word: '   ' }, 'INVALID_ARGUMENT');
    expectFail(game, deps, { type: 'setWord', actor: commons[0], word: 'X' }, 'FORBIDDEN');
    expectFail(game, deps, { type: 'setWord', actor: host, word: 'X' }, 'FORBIDDEN');
});

test('drawWord tire dans deps.words via le rng', () => {
    const { game, deps, master } = started(4, { words: ['Seul'] });
    const next = run(game, deps, { type: 'drawWord', actor: master });
    assert.equal(next.phase.name, 'word');
    assert.equal(next.word, 'Seul');
});

test('drawWord refuse une liste de mots vide', () => {
    const { game, deps, master } = started(4, { words: [] });
    expectFail(game, deps, { type: 'drawWord', actor: master }, 'INVALID_ARGUMENT');
});

test('startTimer par le Maître ou l\'hôte ouvre playing avec la deadline', () => {
    const { game, deps, master, host, at } = started(4, { settings: { timerMs: 1000 } });
    const inWord = run(game, deps, { type: 'setWord', actor: master, word: 'A' });
    for (const actor of new Set([master, host])) {
        const playing = run(inWord, deps, { type: 'startTimer', actor });
        assert.equal(playing.phase.name, 'playing');
        assert.deepEqual(playing.phase, { name: 'playing', startedAt: at(), deadline: at() + 1000 });
    }
});

test('startTimer par un Citoyen non hôte est refusé', () => {
    // Sans variante à 5 joueurs il y a toujours 3 Citoyens : au plus un est l'hôte, il en reste toujours un non hôte.
    const { game, deps, master, commons, host } = started(5, NO_VARIANT);
    const inWord = run(game, deps, { type: 'setWord', actor: master, word: 'A' });
    const citizen = commons.find((id) => id !== host);
    assert.ok(citizen, 'aucun Citoyen non hôte trouvé');
    expectFail(inWord, deps, { type: 'startTimer', actor: citizen }, 'FORBIDDEN');
});

test('startTimer rejoué en playing est refusé (WRONG_PHASE), le chrono ne repart pas', () => {
    const { game, deps, master, host, advance } = started(4);
    const playing = run(game, deps, { type: 'setWord', actor: master, word: 'A' }, { type: 'startTimer', actor: host });
    advance(10_000);
    expectFail(playing, deps, { type: 'startTimer', actor: host }, 'WRONG_PHASE');
});

test('wordFound passe en discussion avec le trouveur et une deadline égale au temps consommé', () => {
    const { game, deps, master, host, commons, advance, at } = started(4);
    const playing = run(game, deps, { type: 'setWord', actor: master, word: 'A' }, { type: 'startTimer', actor: host });
    advance(90_000);
    const disc = run(playing, deps, { type: 'wordFound', actor: master, finderId: commons[0] });
    assert.equal(disc.phase.name, 'discussion');
    assert.deepEqual(disc.phase, { name: 'discussion', finderId: commons[0], startedAt: at(), deadline: at() + 90_000 });
});

test('wordFound refuse le Maître comme trouveur et un joueur inconnu', () => {
    const { game, deps, master, host } = started(4);
    const playing = run(game, deps, { type: 'setWord', actor: master, word: 'A' }, { type: 'startTimer', actor: host });
    expectFail(playing, deps, { type: 'wordFound', actor: master, finderId: master }, 'INVALID_ARGUMENT');
    expectFail(playing, deps, { type: 'wordFound', actor: master, finderId: 'nobody' }, 'INVALID_ARGUMENT');
});

test('timeout est refusé avant la deadline (NOT_YET) et termine en allLose après', () => {
    const { game, deps, master, host, advance } = started(4, { settings: { timerMs: 5000 } });
    const playing = run(game, deps, { type: 'setWord', actor: master, word: 'A' }, { type: 'startTimer', actor: host });
    advance(4999);
    expectFail(playing, deps, { type: 'timeout', actor: SERVER }, 'NOT_YET');
    advance(1);
    const ended = run(playing, deps, { type: 'timeout', actor: SERVER });
    assert.deepEqual(ended.phase, { name: 'ended', outcome: 'allLose', reason: 'timeout', finderId: null, tallies: null, pointed: null });
});

test('timeout par un joueur est refusé', () => {
    const { game, deps, master, host, advance } = started(4, { settings: { timerMs: 10 } });
    const playing = run(game, deps, { type: 'setWord', actor: master, word: 'A' }, { type: 'startTimer', actor: host });
    advance(100);
    expectFail(playing, deps, { type: 'timeout', actor: host }, 'FORBIDDEN');
});

test('closeDiscussion ouvre vote1 avec des bulletins vides', () => {
    const { game, deps, master, host, commons, advance } = started(4);
    const playing = run(game, deps, { type: 'setWord', actor: master, word: 'A' }, { type: 'startTimer', actor: host });
    advance(1000);
    const disc = run(playing, deps, { type: 'wordFound', actor: host, finderId: commons[0] });
    const v1 = run(disc, deps, { type: 'closeDiscussion', actor: master });
    assert.deepEqual(v1.phase, { name: 'vote1', finderId: commons[0], ballots: {} });
});
