import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createApp } from '../../src/server/app.js';

/** Démarre un serveur réel sur un port éphémère. */
export async function startServer(settings = {}, { words = ['Château', 'Abeille', 'Piano'], now } = {}) {
    const srv = createApp({ settings: { minPlayers: 4, traitorOptional: false, ...settings }, words, now });
    await new Promise((resolve) => srv.httpServer.listen(0, () => resolve(undefined)));
    const address = /** @type {import('node:net').AddressInfo} */ (srv.httpServer.address());
    const url = `http://127.0.0.1:${address.port}`;
    return {
        ...srv,
        url,
        stop: () => new Promise((resolve) => {
            srv.close();
            srv.httpServer.close(() => resolve(undefined));
        })
    };
}

/** Un client socket.io sans reconnexion automatique, pour garder les tests déterministes. */
export function client(url, token) {
    return connect(url, { auth: { token }, forceNew: true, reconnection: false, transports: ['websocket'] });
}

/** Attend un événement qui satisfait le prédicat, ou échoue après timeout. */
export function waitFor(socket, event, predicate = () => true, timeout = 2000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(event, handler);
            reject(new Error(`timeout waiting for ${event}`));
        }, timeout);
        function handler(payload) {
            if (predicate(payload)) {
                clearTimeout(timer);
                socket.off(event, handler);
                resolve(payload);
            }
        }
        socket.on(event, handler);
    });
}

/** Réussit si aucun événement de ce type n'arrive pendant `ms`. */
export function expectSilence(socket, event, ms = 200) {
    return new Promise((resolve, reject) => {
        function handler(payload) {
            clearTimeout(timer);
            socket.off(event, handler);
            reject(new Error(`unexpected ${event}: ${JSON.stringify(payload).slice(0, 200)}`));
        }
        const timer = setTimeout(() => {
            socket.off(event, handler);
            resolve(undefined);
        }, ms);
        socket.on(event, handler);
    });
}

/** Envoie une commande et renvoie l'ack. */
export function command(socket, payload) {
    return new Promise((resolve) => socket.emit('command', payload, resolve));
}

/** Fait rejoindre n joueurs. Chaque entrée garde le dernier state reçu dans `latest`. */
export async function joinAll(url, names) {
    const players = [];
    for (const name of names) {
        const socket = client(url);
        await waitFor(socket, 'needJoin');
        const joined = waitFor(socket, 'joined');
        const first = waitFor(socket, 'state');
        socket.emit('join', { name });
        const { token } = await joined;
        const state = await first;
        const entry = { name, socket, token, latest: state };
        socket.on('state', (s) => { entry.latest = s; });
        players.push(entry);
    }
    return players;
}

/** Attend que tous les joueurs aient reçu un state dans la phase donnée. */
export function allInPhase(players, phase) {
    return Promise.all(players.map((p) => (p.latest.view.phase === phase
        ? Promise.resolve(p.latest)
        : waitFor(p.socket, 'state', (s) => s.view.phase === phase))));
}

export function byRole(players, role) {
    return players.filter((p) => p.latest.view.me.role === role);
}

export function host(players) {
    const h = players.find((p) => p.latest.view.me.isHost);
    assert.ok(h, 'no host');
    return h;
}

/** Amène une table de 4 joueurs jusqu'en vote1 (mot trouvé par un Citoyen). */
export async function playToVote1(players) {
    const h = host(players);
    assert.equal((await command(h.socket, { type: 'startRound' })).ok, true);
    await allInPhase(players, 'roles');
    const [master] = byRole(players, 'master');
    assert.equal((await command(master.socket, { type: 'setWord', word: 'Château' })).ok, true);
    await allInPhase(players, 'word');
    assert.equal((await command(master.socket, { type: 'startTimer' })).ok, true);
    await allInPhase(players, 'playing');
    const [finder] = byRole(players, 'common');
    assert.equal((await command(master.socket, { type: 'wordFound', finderId: finder.latest.view.me.id })).ok, true);
    await allInPhase(players, 'discussion');
    assert.equal((await command(master.socket, { type: 'closeDiscussion' })).ok, true);
    await allInPhase(players, 'vote1');
    return { master, finder };
}

export function closeAll(players) {
    for (const p of players) {
        p.socket.close();
    }
}
