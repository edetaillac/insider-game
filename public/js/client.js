// public/js/client.js
// Point d'entrée du navigateur : connexion socket, état courant, rendu, envoi des commandes.

import { render, renderJoin, patchPresence, patchTimer } from './render.js';
import { unlock, playFor } from './audio.js';
import { messageFor } from './dom.js';

const TOKEN_KEY = 'insider.token';
const screen = document.getElementById('screen');
const toast = document.getElementById('toast');
const banner = document.getElementById('banner');

/** @type {{ view: any, online: string[], serverTime: number, minPlayers: number } | null} */
let current = null;
let offset = 0;
/** @type {ReturnType<typeof setInterval> | null} */
let ticker = null;
let toastTimer = null;

function readToken() {
    try {
        return localStorage.getItem(TOKEN_KEY) ?? undefined;
    } catch {
        return undefined;
    }
}

function saveToken(token) {
    try {
        localStorage.setItem(TOKEN_KEY, token);
    } catch {
        // navigation privée ou stockage refusé : la partie tient tant que l'onglet reste ouvert
    }
}

function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
}

function stopTicker() {
    if (ticker !== null) {
        clearInterval(ticker);
        ticker = null;
    }
}

function startTicker() {
    stopTicker();
    patchTimer(screen, offset);
    ticker = setInterval(() => patchTimer(screen, offset), 250);
}

const socket = io({ auth: (cb) => cb({ token: readToken() }) });

function showJoin(error) {
    current = null;
    stopTicker();
    const typedName = screen.querySelector('input[name="name"]')?.value ?? '';
    screen.innerHTML = renderJoin(error, typedName);
    screen.querySelector('input[name="name"]')?.focus();
}

socket.on('needJoin', () => {
    if (screen.querySelector('form[data-form="join"]')) {
        return;
    }
    showJoin();
});
socket.on('joinFailed', ({ error, message }) => showJoin(error === 'WRONG_PHASE'
    ? 'Partie en cours, attends la fin de la manche.'
    : messageFor({ ok: false, error, message })));
socket.on('joined', ({ token }) => saveToken(token));

socket.on('state', (envelope) => {
    offset = envelope.serverTime - Date.now();
    const previous = current;
    current = envelope;
    if (previous === null || previous.view.version !== envelope.view.version) {
        screen.innerHTML = render(envelope);
        playFor(previous?.view.phase, envelope.view.phase, envelope.view.result?.reason);
    } else {
        patchPresence(screen, envelope);
    }
    if (envelope.view.timer) {
        if (ticker === null) {
            startTicker();
        }
    } else {
        stopTicker();
    }
    banner.hidden = true;
});

socket.on('disconnect', () => {
    banner.hidden = false;
});

socket.on('connect', () => {
    banner.hidden = true;
});

function send(command) {
    socket.emit('command', command, (ack) => {
        if (!ack || !ack.ok) {
            showToast(messageFor(ack ?? { ok: false }));
        }
    });
}

screen.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const flip = target.closest('[data-flip]');
    if (flip) {
        const flipped = flip.toggleAttribute('data-flipped');
        flip.setAttribute('aria-pressed', String(flipped));
        return;
    }
    const cmd = target.closest('[data-cmd]');
    if (cmd) {
        unlock();
        let args = {};
        try {
            args = JSON.parse(cmd.getAttribute('data-args') || '{}');
        } catch {
            args = {};
        }
        send({ type: cmd.getAttribute('data-cmd'), ...args });
    }
});

screen.addEventListener('submit', (event) => {
    const form = /** @type {HTMLFormElement} */ (event.target).closest('form[data-form]');
    if (!form) {
        return;
    }
    event.preventDefault();
    unlock();
    const data = new FormData(form);
    if (form.dataset.form === 'join') {
        socket.emit('join', { name: String(data.get('name') ?? '') });
    } else if (form.dataset.form === 'setWord') {
        send({ type: 'setWord', word: String(data.get('word') ?? '') });
    }
});
