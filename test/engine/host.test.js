import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SERVER, ALL_PHASES, allowedActions } from '../../src/engine/game.js';
import { lobby, started, run, expectFail } from './helpers.js';

test('setHost transfère le rôle d\'hôte : un seul hôte, l\'ancien redevient joueur', () => {
    const { game, deps } = lobby(3);
    const next = run(game, deps, { type: 'setHost', actor: SERVER, id: 'p2' });
    assert.deepEqual(next.players.map((p) => p.isHost), [false, true, false]);
    assert.equal(next.version, game.version + 1);
});

test('setHost est accepté en pleine manche et ne touche ni la phase ni les rôles', () => {
    const { game, deps } = started(4, { settings: { traitorOptional: false } });
    const next = run(game, deps, { type: 'setHost', actor: SERVER, id: 'p3' });
    assert.equal(next.phase.name, game.phase.name);
    assert.deepEqual(next.roles, game.roles);
    assert.equal(next.players.find((p) => p.isHost)?.id, 'p3');
});

test('setHost est réservé au serveur et refuse un joueur inconnu', () => {
    const { game, deps } = lobby(3);
    expectFail(game, deps, { type: 'setHost', actor: 'p2', id: 'p2' }, 'FORBIDDEN');
    expectFail(game, deps, { type: 'setHost', actor: SERVER, id: 'ghost' }, 'UNKNOWN_PLAYER');
});

test('le nouvel hôte obtient les commandes d\'hôte, l\'ancien les perd', () => {
    const { game, deps } = lobby(4);
    const next = run(game, deps, { type: 'setHost', actor: SERVER, id: 'p2' });
    assert.ok(allowedActions(next, 'p2').includes('startRound'));
    assert.ok(!allowedActions(next, 'p1').includes('startRound'));
    assert.ok(!allowedActions(next, 'p2').includes('setHost'));
});

test('setHost est autorisé dans toutes les phases', async () => {
    const { PHASES_BY_COMMAND } = await import('../../src/engine/game.js');
    assert.deepEqual(PHASES_BY_COMMAND.setHost, ALL_PHASES);
});
