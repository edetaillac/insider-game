import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, apply, SERVER, CENTER, DEFAULT_SETTINGS } from '../../src/engine/game.js';
import { makeDeps, lobby, run, expectFail } from './helpers.js';

test('createGame part en lobby, version 0, sans joueur, avec les défauts', () => {
    const game = createGame();
    assert.equal(game.phase.name, 'lobby');
    assert.equal(game.version, 0);
    assert.deepEqual(game.players, []);
    assert.equal(game.roles, null);
    assert.equal(game.centerCard, null);
    assert.equal(game.word, null);
    assert.deepEqual(game.settings, DEFAULT_SETTINGS);
});

test('createGame fusionne les settings fournis', () => {
    const game = createGame({ traitorOptional: false, timerMs: 1000 });
    assert.equal(game.settings.traitorOptional, false);
    assert.equal(game.settings.timerMs, 1000);
    assert.equal(game.settings.minPlayers, 4);
});

test('addPlayer ajoute dans l\'ordre d\'arrivée et incrémente la version', () => {
    const { game } = lobby(3);
    assert.deepEqual(game.players.map((p) => p.id), ['p1', 'p2', 'p3']);
    assert.equal(game.players[0].isHost, true);
    assert.equal(game.players[1].isHost, false);
    assert.equal(game.version, 3);
});

test('addPlayer refuse un nom vide, un nom en doublon, un id en doublon', () => {
    const { game, deps } = lobby(2);
    expectFail(game, deps, { type: 'addPlayer', actor: SERVER, id: 'p9', name: '   ' }, 'INVALID_ARGUMENT');
    expectFail(game, deps, { type: 'addPlayer', actor: SERVER, id: 'p9', name: 'Joueur 1' }, 'DUPLICATE_NAME');
    expectFail(game, deps, { type: 'addPlayer', actor: SERVER, id: 'p1', name: 'Autre' }, 'DUPLICATE_NAME');
});

test('addPlayer refuse un id absent, vide, ou réservé (center, server)', () => {
    const { game, deps } = lobby(2);
    expectFail(game, deps, /** @type {any} */ ({ type: 'addPlayer', actor: SERVER, name: 'Neuf' }), 'INVALID_ARGUMENT');
    expectFail(game, deps, { type: 'addPlayer', actor: SERVER, id: '   ', name: 'Neuf' }, 'INVALID_ARGUMENT');
    expectFail(game, deps, { type: 'addPlayer', actor: SERVER, id: CENTER, name: 'Neuf' }, 'INVALID_ARGUMENT');
    expectFail(game, deps, { type: 'addPlayer', actor: SERVER, id: SERVER, name: 'Neuf' }, 'INVALID_ARGUMENT');
});

test('addPlayer trim le nom', () => {
    const { deps } = makeDeps();
    const game = run(createGame(), deps, { type: 'addPlayer', actor: SERVER, id: 'a', name: '  Zoé  ' });
    assert.equal(game.players[0].name, 'Zoé');
});

test('addPlayer refuse au-delà du maximum, 7 avec la variante, 8 sans', () => {
    const withVariant = lobby(7);
    expectFail(withVariant.game, withVariant.deps, { type: 'addPlayer', actor: SERVER, id: 'p8', name: 'Huit' }, 'TOO_MANY_PLAYERS');
    const without = lobby(8, { settings: { traitorOptional: false } });
    assert.equal(without.game.players.length, 8);
    expectFail(without.game, without.deps, { type: 'addPlayer', actor: SERVER, id: 'p9', name: 'Neuf' }, 'TOO_MANY_PLAYERS');
});

test('addPlayer par un joueur est refusé, c\'est une commande serveur', () => {
    const { game, deps } = lobby(2);
    expectFail(game, deps, { type: 'addPlayer', actor: 'p1', id: 'p9', name: 'X' }, 'FORBIDDEN');
});

test('removePlayer retire le joueur, refuse un inconnu', () => {
    const { game, deps } = lobby(3);
    const next = run(game, deps, { type: 'removePlayer', actor: SERVER, id: 'p2' });
    assert.deepEqual(next.players.map((p) => p.id), ['p1', 'p3']);
    expectFail(next, deps, { type: 'removePlayer', actor: SERVER, id: 'p2' }, 'UNKNOWN_PLAYER');
});

test('reset en lobby est accepté par l\'hôte seul et laisse les joueurs', () => {
    const { game, deps } = lobby(3);
    expectFail(game, deps, { type: 'reset', actor: 'p2' }, 'FORBIDDEN');
    const next = run(game, deps, { type: 'reset', actor: 'p1' });
    assert.equal(next.phase.name, 'lobby');
    assert.equal(next.players.length, 3);
});

test('une commande inconnue renvoie INVALID_ARGUMENT', () => {
    const { game, deps } = lobby(2);
    const r = apply(game, /** @type {any} */ ({ type: 'dance', actor: 'p1' }), deps);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'INVALID_ARGUMENT');
});

test('une commande dont le type est une clé héritée de Object renvoie INVALID_ARGUMENT sans lever', () => {
    const { game, deps } = lobby(2);
    expectFail(game, deps, /** @type {any} */ ({ type: 'toString', actor: 'p1' }), 'INVALID_ARGUMENT');
    expectFail(game, deps, /** @type {any} */ ({ type: '__proto__', actor: 'p1' }), 'INVALID_ARGUMENT');
    expectFail(game, deps, /** @type {any} */ ({ type: 'constructor', actor: 'p1' }), 'INVALID_ARGUMENT');
    expectFail(game, deps, /** @type {any} */ ({ type: 'hasOwnProperty', actor: 'p1' }), 'INVALID_ARGUMENT');
});

test('un échec ne modifie pas l\'état d\'entrée', () => {
    const { game, deps } = lobby(2);
    const before = structuredClone(game);
    apply(game, { type: 'addPlayer', actor: SERVER, id: 'p1', name: 'Doublon' }, deps);
    assert.deepEqual(game, before);
});
