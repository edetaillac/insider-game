import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, joinAll, client, command, waitFor, playToVote1, closeAll } from './helpers.js';

test('un joueur qui revient avec son token reprend sa place, bulletin compris', async () => {
    const srv = await startServer();
    try {
        const players = await joinAll(srv.url, ['Alice', 'Bob', 'Carol', 'Dan']);
        await playToVote1(players);
        const bob = players[1];
        assert.equal((await command(bob.socket, { type: 'vote1', value: true })).ok, true);
        const offline = waitFor(players[0].socket, 'state', (s) => !s.online.includes(bob.latest.view.me.id));
        bob.socket.close();
        await offline;
        const back = client(srv.url, bob.token);
        const state = await waitFor(back, 'state');
        assert.equal(state.view.phase, 'vote1');
        assert.equal(state.view.me.id, bob.latest.view.me.id);
        assert.equal(state.view.me.hasVoted, true);
        assert.ok(state.view.actions.includes('vote1'));
        assert.ok(state.online.includes(bob.latest.view.me.id));
        back.close();
        closeAll(players);
    } finally {
        await srv.stop();
    }
});

test('deux sockets du même token comptent pour un seul joueur en ligne', async () => {
    const srv = await startServer();
    try {
        const players = await joinAll(srv.url, ['Alice', 'Bob', 'Carol', 'Dan']);
        const second = client(srv.url, players[0].token);
        const s = await waitFor(second, 'state');
        assert.equal(s.view.me.id, players[0].latest.view.me.id);
        assert.equal(s.online.length, 4);
        assert.equal(s.view.players.length, 4);
        second.close();
        closeAll(players);
    } finally {
        await srv.stop();
    }
});

test('l\'hôte part en pleine manche : un joueur reprend la main par le transport et la partie repart', async () => {
    const srv = await startServer();
    try {
        const players = await joinAll(srv.url, ['Alice', 'Bob', 'Carol', 'Dan']);
        const [alice, bob] = players;
        assert.equal((await command(alice.socket, { type: 'startRound' })).ok, true);
        assert.equal((await command(bob.socket, { type: 'claimHost' })).error, 'FORBIDDEN');
        const offline = waitFor(bob.socket, 'state', (s) => !s.online.includes(alice.latest.view.me.id));
        alice.socket.close();
        await offline;
        const promoted = waitFor(bob.socket, 'state', (s) => s.view.me.isHost);
        assert.equal((await command(bob.socket, { type: 'claimHost' })).ok, true);
        const state = await promoted;
        assert.equal(state.view.phase, 'roles');
        assert.ok(state.view.actions.includes('reset'));
        closeAll(players.slice(1));
    } finally {
        await srv.stop();
    }
});
