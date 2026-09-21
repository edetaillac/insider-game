import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, joinAll, command, allInPhase, byRole, host, closeAll } from './helpers.js';

test('le chrono serveur termine la partie en allLose sans commande client', async () => {
    const srv = await startServer({ timerMs: 300 });
    try {
        const players = await joinAll(srv.url, ['Alice', 'Bob', 'Carol', 'Dan']);
        const h = host(players);
        await command(h.socket, { type: 'startRound' });
        await allInPhase(players, 'roles');
        const [master] = byRole(players, 'master');
        await command(master.socket, { type: 'setWord', word: 'Château' });
        await allInPhase(players, 'word');
        const started = Date.now();
        await command(h.socket, { type: 'startTimer' });
        const finals = await allInPhase(players, 'ended');
        assert.ok(Date.now() - started >= 250, 'trop tôt');
        for (const s of finals) {
            assert.equal(s.view.result.reason, 'timeout');
            assert.equal(s.view.result.outcome, 'allLose');
            assert.equal(s.view.word, 'Château');
            assert.equal(s.view.finder, null);
        }
        closeAll(players);
    } finally {
        await srv.stop();
    }
});
