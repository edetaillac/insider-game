import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soundFor, audible, createWarnGate, SOUNDS } from '../../public/js/audio.js';

test('quatre sons seulement : go, warn, dong, tada', () => {
    assert.deepEqual([...SOUNDS].sort(), ['dong', 'go', 'tada', 'warn']);
});

test('soundFor : départ du chrono, temps écoulé, fin de manche', () => {
    assert.equal(soundFor('word', 'playing'), 'go');
    assert.equal(soundFor('playing', 'ended', 'timeout'), 'dong');
    assert.equal(soundFor('vote2', 'ended', 'vote2'), 'tada');
});

test('soundFor : aucun son sur roles, word, discussion, votes, ni au premier rendu', () => {
    for (const phase of ['lobby', 'roles', 'word', 'discussion', 'vote1', 'vote2', 'tiebreak']) {
        assert.equal(soundFor('lobby', phase), null, phase);
    }
    assert.equal(soundFor(undefined, 'playing'), null);
    assert.equal(soundFor('playing', 'playing'), null);
});

test('audible : muet si non-hôte ou coupé', () => {
    assert.equal(audible({ isHost: true, muted: false }), true);
    assert.equal(audible({ isHost: false, muted: false }), false);
    assert.equal(audible({ isHost: true, muted: true }), false);
});

test('warn : une seule fois par manche', () => {
    const gate = createWarnGate();
    assert.equal(gate('manche-1'), true);
    assert.equal(gate('manche-1'), false);
    assert.equal(gate('manche-2'), true);
});
