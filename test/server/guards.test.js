import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, joinAll, client, command, waitFor, expectSilence, host, closeAll } from './helpers.js';

test('une commande hors phase est refusée par ack sans émettre de state', async () => {
    const srv = await startServer();
    try {
        const players = await joinAll(srv.url, ['Alice', 'Bob', 'Carol', 'Dan']);
        const before = players[0].latest.view.version;
        const silence = expectSilence(players[1].socket, 'state');
        const ack = await command(players[0].socket, { type: 'vote1', value: true });
        assert.equal(ack.ok, false);
        assert.equal(ack.error, 'WRONG_PHASE');
        await silence;
        assert.equal(players[0].latest.view.version, before);
        closeAll(players);
    } finally {
        await srv.stop();
    }
});

test('un socket non attaché reçoit needJoin et ses commandes sont FORBIDDEN', async () => {
    const srv = await startServer();
    try {
        const stranger = client(srv.url, 'token-invente');
        await waitFor(stranger, 'needJoin');
        const ack = await command(stranger, { type: 'startRound' });
        assert.equal(ack.error, 'FORBIDDEN');
        stranger.close();
    } finally {
        await srv.stop();
    }
});

test('join refuse un nom vide et un doublon avec un message', async () => {
    const srv = await startServer();
    try {
        const players = await joinAll(srv.url, ['Alice']);
        const s = client(srv.url);
        await waitFor(s, 'needJoin');
        const failed = waitFor(s, 'joinFailed');
        s.emit('join', { name: 'Alice' });
        const r = await failed;
        assert.equal(r.error, 'DUPLICATE_NAME');
        assert.ok(typeof r.message === 'string' && r.message.length > 0);
        const failed2 = waitFor(s, 'joinFailed');
        s.emit('join', { name: '   ' });
        assert.equal((await failed2).error, 'INVALID_ARGUMENT');
        const failed3 = waitFor(s, 'joinFailed');
        s.emit('join', { nope: 1 });
        assert.equal((await failed3).error, 'INVALID_ARGUMENT');
        s.close();
        closeAll(players);
    } finally {
        await srv.stop();
    }
});

test('kick : refusé à un non hôte et à l\'hôte sur lui-même, sinon le joueur retiré reçoit needJoin', async () => {
    const srv = await startServer();
    try {
        const players = await joinAll(srv.url, ['Alice', 'Bob', 'Carol', 'Dan']);
        const h = host(players);
        const bob = players[1];
        assert.equal((await command(bob.socket, { type: 'kick', id: h.latest.view.me.id })).error, 'FORBIDDEN');
        assert.equal((await command(h.socket, { type: 'kick', id: h.latest.view.me.id })).error, 'FORBIDDEN');
        const kicked = waitFor(bob.socket, 'needJoin');
        const others = waitFor(players[2].socket, 'state', (s) => s.view.players.length === 3);
        assert.equal((await command(h.socket, { type: 'kick', id: bob.latest.view.me.id })).ok, true);
        await kicked;
        const s = await others;
        assert.ok(!s.view.players.some((p) => p.name === 'Bob'));
        assert.equal((await command(bob.socket, { type: 'startRound' })).error, 'FORBIDDEN');
        const again = client(srv.url, bob.token);
        await waitFor(again, 'needJoin');
        again.close();
        closeAll(players);
    } finally {
        await srv.stop();
    }
});

test('un actor glissé dans le payload est ignoré', async () => {
    const srv = await startServer();
    try {
        const players = await joinAll(srv.url, ['Alice', 'Bob', 'Carol', 'Dan']);
        const h = host(players);
        const ack = await command(players[1].socket, { type: 'startRound', actor: h.latest.view.me.id });
        assert.equal(ack.error, 'FORBIDDEN');
        closeAll(players);
    } finally {
        await srv.stop();
    }
});
