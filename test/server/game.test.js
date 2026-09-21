import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, joinAll, command, allInPhase, byRole, host, playToVote1, closeAll, waitFor } from './helpers.js';

test('une partie complète à 4 clients, du join à la fin, sans fuite de secret', async () => {
    const srv = await startServer();
    try {
        const players = await joinAll(srv.url, ['Alice', 'Bob', 'Carol', 'Dan']);
        assert.equal(players[0].latest.view.me.isHost, true);
        assert.equal(players[1].latest.view.me.isHost, false);
        await Promise.all(players.map((p) => (p.latest.online.length === 4 ? Promise.resolve() : waitFor(p.socket, 'state', (s) => s.online.length === 4))));
        assert.equal(players[3].latest.online.length, 4);
        assert.equal(players[3].latest.minPlayers, 4);

        const { master, finder } = await playToVote1(players);
        assert.equal(master.latest.view.word, 'Château');
        for (const p of players) {
            const role = p.latest.view.me.role;
            const seesWord = p.latest.view.word !== null;
            assert.equal(seesWord, role === 'master' || role === 'insider', `${p.name} (${role}) word visibility`);
            assert.equal(p.latest.view.master.id, master.latest.view.me.id);
            assert.equal(p.latest.view.finder.id, finder.latest.view.me.id);
        }

        for (const p of players) {
            assert.equal((await command(p.socket, { type: 'vote1', value: false })).ok, true);
        }
        await allInPhase(players, 'vote2');
        const [insider] = byRole(players, 'insider');
        for (const p of players) {
            assert.equal((await command(p.socket, { type: 'vote2', candidate: insider.latest.view.me.id })).ok, true);
        }
        const finals = await allInPhase(players, 'ended');
        for (const s of finals) {
            assert.equal(s.view.result.outcome, 'commonsWin');
            assert.equal(s.view.result.insiderId, insider.latest.view.me.id);
            assert.equal(s.view.word, 'Château');
            assert.equal(s.view.tallies[insider.latest.view.me.id], 4);
        }
        const h = host(players);
        assert.deepEqual(h.latest.view.actions.slice().sort(), ['reset', 'startRound']);
        closeAll(players);
    } finally {
        await srv.stop();
    }
});

test('un state ne contient jamais les bulletins ni les rôles des autres', async () => {
    const srv = await startServer();
    try {
        const players = await joinAll(srv.url, ['Alice', 'Bob', 'Carol', 'Dan']);
        await playToVote1(players);
        await command(players[1].socket, { type: 'vote1', value: true });
        const votedPredicate = (st) => st.view.players.some((p) => p.hasVoted);
        const s = votedPredicate(players[0].latest)
            ? players[0].latest
            : await waitFor(players[0].socket, 'state', votedPredicate);
        const json = JSON.stringify(s);
        assert.ok(!json.includes('"ballots"'));
        assert.ok(!json.includes('"roles"'));
        assert.equal(players[0].latest.view.players.find((p) => p.id === players[1].latest.view.me.id).hasVoted, true);
        closeAll(players);
    } finally {
        await srv.stop();
    }
});
