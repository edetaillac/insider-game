// src/server/app.js
// Transport : Express sert la coquille et les fichiers statiques, socket.io porte le jeu.
// Un socket est soit attaché à un joueur (token reconnu ou join réussi), soit en attente de join.

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
// @ts-ignore express n'expose pas de types et aucun @types/express n'est installe
import express from 'express';
// @ts-ignore express-ejs-layouts n'expose pas de types
import expressLayouts from 'express-ejs-layouts';
import { Server } from 'socket.io';
import { createTable } from './table.js';

/** @typedef {import('../engine/types.js').PlayerId} PlayerId */
/** @typedef {import('../engine/types.js').Settings} Settings */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * @param {{ settings?: Partial<Settings>, words: readonly string[], now?: () => number, shareUrl?: string|null }} options
 */
export function createApp({ settings = {}, words, now, shareUrl = null }) {
    const table = createTable({ settings, words, now, shareUrl });

    const app = express();
    app.use(expressLayouts)
        .set('view engine', 'ejs')
        .set('views', `${ROOT}views`)
        .set('layout', 'layouts/layout')
        .use('/static', express.static(`${ROOT}public`))
        .get('/', (/** @type {any} */ req, /** @type {any} */ res) => {
            res.render('index');
        });

    const httpServer = createServer(app);
    const io = new Server(httpServer);

    /** @type {Map<string, PlayerId>} socketId -> playerId */
    const attached = new Map();

    /**
     * @param {import('socket.io').Socket} socket
     * @param {PlayerId} playerId
     */
    function attach(socket, playerId) {
        attached.set(socket.id, playerId);
        table.connect(playerId, socket.id);
        socket.emit('state', table.snapshot(playerId));
    }

    function broadcast() {
        for (const [socketId, playerId] of attached) {
            if (!table.game.players.some((p) => p.id === playerId)) {
                continue;
            }
            io.to(socketId).emit('state', table.snapshot(playerId));
        }
    }

    table.onChange((event) => {
        if (event.type === 'kicked') {
            for (const [socketId, playerId] of attached) {
                if (playerId === event.playerId) {
                    attached.delete(socketId);
                    io.to(socketId).emit('needJoin');
                }
            }
            return;
        }
        broadcast();
    });

    io.on('connection', (socket) => {
        const auth = /** @type {{ token?: unknown }} */ (socket.handshake.auth);
        const playerId = table.resolve(auth?.token);
        if (playerId !== null) {
            attach(socket, playerId);
        } else {
            socket.emit('needJoin');
        }

        socket.on('join', (payload) => {
            if (attached.has(socket.id)) {
                return;
            }
            const name = typeof payload?.name === 'string' ? payload.name : '';
            const result = table.join(name);
            if (!result.ok) {
                socket.emit('joinFailed', { error: result.error, message: result.message });
                return;
            }
            socket.emit('joined', { token: result.token });
            attach(socket, result.playerId);
        });

        socket.on('command', (payload, ack) => {
            const reply = typeof ack === 'function' ? ack : () => {};
            const actor = attached.get(socket.id);
            if (actor === undefined) {
                reply({ ok: false, error: 'FORBIDDEN', message: 'join first' });
                return;
            }
            const result = table.dispatch(actor, payload);
            reply(result.ok ? { ok: true } : { ok: false, error: result.error, message: result.message });
        });

        socket.on('disconnect', () => {
            const actor = attached.get(socket.id);
            attached.delete(socket.id);
            if (actor !== undefined) {
                table.disconnect(actor, socket.id);
            }
        });
    });

    return {
        app,
        httpServer,
        io,
        table,
        close() {
            table.close();
            io.close();
        }
    };
}
