// public/js/client.js
// Point d'entrée du navigateur : connexion, état courant, état local d'interface, rendu en quatre régions.

import { render, renderJoin } from './render.js';
import { unlock, playFor } from './audio.js';
import { messageFor, formatCountdown } from './dom.js';

const TOKEN_KEY = 'insider.token';
// Durée d'affichage d'une carte qui se recache seule, alignée sur l'animation CSS `shrink 5s`
const AUTOHIDE_MS = 5000;

const app = document.getElementById('app');
const screen = document.getElementById('screen');
const dock = document.getElementById('dock');
const banner = document.getElementById('banner');
const toast = document.getElementById('toast');
const counter = document.getElementById('counter');
const phasebar = document.getElementById('phasebar');
const phaseLabel = phasebar.querySelector('[data-phase-label]');
const phaseRank = phasebar.querySelector('[data-phase-rank]');

/** @type {{ view: any, online: string[], serverTime: number, minPlayers: number, shareUrl: string|null } | null} */
let current = null;
let offset = 0;
/** @type {ReturnType<typeof setInterval> | null} */
let ticker = null;
let toastTimer = null;
let autohideTimer = null;
let joinError = '';

/** État local d'interface, remis à zéro à chaque changement de phase. */
function freshLocal(view) {
    return {
        phase: view ? view.phase : null,
        flipped: false,
        v1: view && view.phase === 'vote1' && typeof view.me.ballot === 'boolean' ? view.me.ballot : null,
        v2: view && (view.phase === 'vote2' || view.phase === 'tiebreak') && typeof view.me.ballot === 'string' ? view.me.ballot : null,
        finderPicking: false,
        kickConfirm: null
    };
}

let local = freshLocal(null);

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
        // stockage refusé : la partie tient tant que l'onglet reste ouvert
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

/** Écrit le chrono et la barre de progression depuis la deadline, sans re-rendre. */
function patchTimer() {
    const el = screen.querySelector('[data-timer]');
    if (!el || !current || !current.view.timer) {
        return;
    }
    const { startedAt, deadline } = current.view.timer;
    const now = Date.now() + offset;
    const remaining = deadline - now;
    el.textContent = formatCountdown(remaining);
    if (el.hasAttribute('data-urgent-able')) {
        el.classList.toggle('urgent', remaining < 30_000);
    }
    const fill = screen.querySelector('.timer-fill');
    if (fill) {
        const fraction = Math.max(0, Math.min(1, remaining / (deadline - startedAt)));
        fill.style.transform = `scaleX(${fraction})`;
    }
}

function startTicker() {
    if (ticker === null) {
        ticker = setInterval(patchTimer, 250);
    }
    patchTimer();
}

/** Applique les quatre régions d'un rendu. */
function paint(parts) {
    screen.innerHTML = `<div class="screen">${parts.content}</div>`;
    dock.innerHTML = parts.dock;
    if (parts.phase) {
        phaseLabel.textContent = parts.phase.label;
        phaseRank.textContent = parts.phase.rank;
        phasebar.hidden = false;
    } else {
        phasebar.hidden = true;
    }
    if (parts.counter) {
        counter.textContent = parts.counter;
        counter.hidden = false;
    } else {
        counter.hidden = true;
    }
    app.style.setProperty('--dock-h', `${dock.offsetHeight}px`);
}

function repaint() {
    if (current) {
        paint(render(current, local));
        if (current.view.timer) {
            startTicker();
        } else {
            stopTicker();
        }
    }
}

function showJoin(error) {
    current = null;
    local = freshLocal(null);
    stopTicker();
    joinError = error ?? '';
    const typedName = screen.querySelector('input[name="name"]')?.value ?? '';
    paint(renderJoin(joinError, typedName));
    screen.querySelector('input[name="name"]')?.focus();
}

const socket = io({ auth: (cb) => cb({ token: readToken() }) });

socket.on('needJoin', () => {
    if (screen.querySelector('form[data-form="join"]')) {
        return;
    }
    showJoin();
});

socket.on('joinFailed', ({ error, message }) => {
    const text = error === 'WRONG_PHASE'
        ? 'Partie en cours, attends la fin de la manche.'
        : messageFor({ ok: false, error, message });
    showJoin(text);
});

socket.on('joined', ({ token }) => saveToken(token));

socket.on('state', (envelope) => {
    offset = envelope.serverTime - Date.now();
    const previous = current;
    current = envelope;
    if (previous === null || previous.view.phase !== envelope.view.phase) {
        clearTimeout(autohideTimer);
        local = freshLocal(envelope.view);
    }
    const versionChanged = previous === null || previous.view.version !== envelope.view.version;
    const typing = document.activeElement && document.activeElement.tagName === 'INPUT' && screen.contains(document.activeElement);
    if (versionChanged || !typing) {
        repaint();
    }
    if (versionChanged) {
        playFor(previous?.view.phase, envelope.view.phase, envelope.view.result?.reason);
    }
    banner.hidden = true;
});

socket.on('disconnect', () => { banner.hidden = false; });
socket.on('connect', () => { banner.hidden = true; });

function send(command) {
    socket.emit('command', command, (ack) => {
        if (!ack || !ack.ok) {
            showToast(messageFor(ack ?? { ok: false }));
        }
    });
}

/** Actions locales d'interface (data-ui). Chacune met à jour `local` puis re-rend. */
const UI = {
    flip() {
        local.flipped = !local.flipped;
        clearTimeout(autohideTimer);
        if (local.flipped) {
            if (current && current.view.phase === 'word') {
                send({ type: 'seenWord' });
            }
            autohideTimer = setTimeout(() => {
                local.flipped = false;
                repaint();
            }, AUTOHIDE_MS);
        }
    },
    'pick-finder'() { local.finderPicking = true; },
    'cancel-finder'() { local.finderPicking = false; },
    'select-v1'(arg) {
        local.v1 = arg === 'true';
        send({ type: 'vote1', value: local.v1 });
    },
    'select-v2'(arg) { local.v2 = arg; },
    'confirm-vote'() {
        if (local.v2 === null || !current) {
            return;
        }
        send({ type: current.view.phase === 'tiebreak' ? 'tiebreak' : 'vote2', candidate: local.v2 });
    },
    'kick-ask'(arg) { local.kickConfirm = arg; },
    'kick-cancel'() { local.kickConfirm = null; }
};

function onAction(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const ui = target.closest('[data-ui]');
    if (ui) {
        unlock();
        const action = ui.getAttribute('data-ui');
        if (Object.hasOwn(UI, action)) {
            UI[action](ui.getAttribute('data-arg'));
            repaint();
        }
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
}

screen.addEventListener('click', onAction);
dock.addEventListener('click', onAction);

function onSubmit(event) {
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
}

screen.addEventListener('submit', onSubmit);

/* Le CTA du socle peut soumettre un formulaire du contenu : il porte data-submit="<form id>". */
dock.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target).closest('[data-submit]');
    if (target) {
        const form = /** @type {HTMLFormElement|null} */ (document.getElementById(target.getAttribute('data-submit')));
        form?.requestSubmit();
    }
});

/* Champ du mot : le CTA "Valider le mot" s'active quand le champ n'est plus vide. */
screen.addEventListener('input', (event) => {
    const input = /** @type {HTMLInputElement} */ (event.target);
    if (input.name === 'word') {
        const cta = dock.querySelector('[data-submit="word-form"]');
        if (cta) {
            const empty = input.value.trim() === '';
            cta.classList.toggle('btn-disabled', empty);
            cta.setAttribute('aria-disabled', String(empty));
        }
    }
});
