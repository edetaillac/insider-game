// public/js/client.js
// Point d'entrée du navigateur : connexion, état courant, état local d'interface, rendu en quatre régions.

import { render, renderJoin } from './render.js';
import { unlock, playFor, playWarn } from './audio.js';
import { messageFor, formatCountdown } from './dom.js';

const TOKEN_KEY = 'insider.token';
const MUTED_KEY = 'insider:muted';
// Durée d'affichage d'une carte qui se recache seule, alignée sur l'animation CSS `shrink 5s`
const AUTOHIDE_MS = 5000;

const app = document.getElementById('app');
const screen = document.getElementById('screen');
const dock = document.getElementById('dock');
const banner = document.getElementById('banner');
const toast = document.getElementById('toast');
const phasebar = document.getElementById('phasebar');
const phaseLabel = phasebar.querySelector('[data-phase-label]');
const phaseRank = phasebar.querySelector('[data-phase-rank]');
const phaseRight = phasebar.querySelector('[data-phase-right]');
const sheetLayer = document.getElementById('sheet');

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
        everFlipped: false,
        v1: view && view.phase === 'vote1' && typeof view.me.ballot === 'boolean' ? view.me.ballot : null,
        v2: view && (view.phase === 'vote2' || view.phase === 'tiebreak') && typeof view.me.ballot === 'string' ? view.me.ballot : null,
        finderPicking: false,
        kickConfirm: null
    };
}

let local = freshLocal(null);

/** État d'interface qui survit aux phases : feuilles ouvertes, son coupé (préférence du téléphone). */
const ui = { claimSheet: false, presenceSheet: false, muted: readMuted() };

function readMuted() {
    try {
        return localStorage.getItem(MUTED_KEY) === '1';
    } catch {
        return false;
    }
}

function saveMuted() {
    try {
        localStorage.setItem(MUTED_KEY, ui.muted ? '1' : '0');
    } catch {
        // préférence perdue au rechargement, sans conséquence
    }
}

/** Qui entend : le téléphone de l'hôte, sauf s'il a coupé le son. */
function listener() {
    return { isHost: Boolean(current?.view.me.isHost), muted: ui.muted };
}

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
        // Sous 30 s, tout le bloc chrono passe en fond sombre avec les chiffres en jaune, et le son d'alerte part
        (el.closest('[data-urgent-block]') ?? el).classList.toggle('urgent', remaining < 30_000);
        if (remaining < 30_000 && remaining > 0 && current.view.phase === 'playing') {
            playWarn(String(startedAt), listener());
        }
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

/** Phase du dernier rendu, pour ne jouer l'animation d'entrée qu'au changement d'écran. */
let paintedPhase = null;

/**
 * Applique les quatre régions d'un rendu. `enter` marque une entrée d'écran.
 * La carte et le champ du mot survivent au re-rendu : la rotation 3D, la barre de 5 s,
 * la saisie et le focus vivent dans le DOM et ne doivent pas repartir à chaque état reçu.
 */
function paint(parts, enter = false) {
    const prevCard = screen.querySelector('.card');
    const prevInput = /** @type {HTMLInputElement|null} */ (screen.querySelector('input[name="word"]'));
    const typed = prevInput
        ? { value: prevInput.value, focused: document.activeElement === prevInput, start: prevInput.selectionStart, end: prevInput.selectionEnd }
        : null;
    const tpl = document.createElement('template');
    tpl.innerHTML = `<div class="screen${enter ? ' enter' : ''}">${parts.content}</div>`;
    const nextRoot = /** @type {HTMLElement} */ (tpl.content.firstElementChild);
    const nextCard = nextRoot.querySelector('.card');
    const prevRoot = screen.firstElementChild;
    if (prevCard instanceof HTMLElement && nextCard instanceof HTMLElement && prevRoot
        && prevCard.parentElement === prevRoot && nextCard.parentElement === nextRoot
        && prevCard.dataset.key === nextCard.dataset.key) {
        // Même carte : on remplace ses voisins sans jamais la détacher, sinon le navigateur
        // annule ses animations (barre de 5 s) et la rotation repart de zéro.
        for (const node of [...prevRoot.childNodes]) {
            if (node !== prevCard) {
                node.remove();
            }
        }
        let afterCard = false;
        let anchor = prevCard;
        for (const node of [...nextRoot.childNodes]) {
            if (node === nextCard) {
                afterCard = true;
            } else if (afterCard) {
                anchor.after(node);
                anchor = node;
            } else {
                prevRoot.insertBefore(node, prevCard);
            }
        }
        prevCard.toggleAttribute('data-flipped', nextCard.hasAttribute('data-flipped'));
        prevCard.setAttribute('aria-pressed', nextCard.getAttribute('aria-pressed') ?? 'false');
    } else {
        screen.replaceChildren(nextRoot);
    }
    dock.innerHTML = parts.dock;
    const nextInput = screen.querySelector('input[name="word"]');
    if (typed && nextInput instanceof HTMLInputElement) {
        nextInput.value = typed.value;
        if (typed.focused) {
            nextInput.focus();
            nextInput.setSelectionRange(typed.start ?? typed.value.length, typed.end ?? typed.value.length);
        }
        nextInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (parts.phase) {
        phaseLabel.textContent = parts.phase.label;
        phaseRank.textContent = parts.phase.rank;
        phasebar.hidden = false;
    } else {
        phasebar.hidden = true;
    }
    phaseRight.innerHTML = parts.bar ?? '';
    paintSheet(parts.sheet ?? '');
    if (screen.querySelector('[role="alert"]')) {
        // L'alerte n'est annoncée qu'à son apparition, les rendus suivants la gardent muette
        local.announced = true;
    }
    syncDockHeight();
}

/** Élément focalisé avant l'ouverture d'une feuille, rendu au focus à la fermeture. */
let focusBeforeSheet = null;
let paintedSheet = '';

/** Feuille montante : voile, focus piégé, Échap ferme. L'animation d'entrée ne joue qu'à l'ouverture. */
function paintSheet(html) {
    if (html === paintedSheet) {
        return;
    }
    const wasOpen = paintedSheet !== '';
    const focused = document.activeElement;
    const focusKey = wasOpen && focused && sheetLayer.contains(focused)
        ? (focused.getAttribute('data-ui') ?? focused.getAttribute('data-cmd'))
        : null;
    paintedSheet = html;
    sheetLayer.innerHTML = html;
    sheetLayer.hidden = html === '';
    sheetLayer.classList.toggle('shown', wasOpen && html !== '');
    app.classList.toggle('sheet-open', html !== '');
    if (html !== '' && !wasOpen) {
        focusBeforeSheet = focused;
        sheetLayer.querySelector('.sheet button')?.focus();
    } else if (html !== '' && focusKey) {
        sheetLayer.querySelector(`[data-ui="${focusKey}"], [data-cmd="${focusKey}"]`)?.focus();
    } else if (html === '' && wasOpen && focusBeforeSheet instanceof HTMLElement && focusBeforeSheet.isConnected) {
        focusBeforeSheet.focus();
    }
}

function closeSheets() {
    ui.claimSheet = false;
    ui.presenceSheet = false;
}

document.addEventListener('keydown', (event) => {
    if (sheetLayer.hidden) {
        return;
    }
    if (event.key === 'Escape') {
        closeSheets();
        repaint();
        return;
    }
    if (event.key === 'Tab') {
        const focusables = [...sheetLayer.querySelectorAll('.sheet button')];
        if (focusables.length === 0) {
            return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        } else if (!sheetLayer.contains(document.activeElement)) {
            event.preventDefault();
            first.focus();
        }
    }
});

/** Hauteur du socle exposée en CSS (marge basse du contenu, position du toast). Suit le socle et la rotation. */
function syncDockHeight() {
    app.style.setProperty('--dock-h', `${dock.offsetHeight}px`);
}

if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(syncDockHeight).observe(dock);
}

/* Clavier virtuel : le socle suit le viewport visuel (iOS ne redimensionne pas le layout). */
if (window.visualViewport) {
    const vv = window.visualViewport;
    const followKeyboard = () => {
        const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        dock.style.bottom = covered > 0 ? `${covered}px` : '';
        toast.style.bottom = covered > 0 ? `calc(var(--dock-h) + 12px + ${covered}px)` : '';
    };
    vv.addEventListener('resize', followKeyboard);
    vv.addEventListener('scroll', followKeyboard);
}

function repaint() {
    if (current) {
        const enter = paintedPhase !== current.view.phase;
        paintedPhase = current.view.phase;
        paint(render(current, local, ui), enter);
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
    paint(renderJoin(joinError, typedName), paintedPhase !== 'join');
    paintedPhase = 'join';
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
    if (ui.claimSheet && !envelope.view.actions.includes('claimHost')) {
        // La reprise n'est plus possible : l'hôte est revenu, ou quelqu'un d'autre a repris (2b)
        ui.claimSheet = false;
        const host = envelope.view.players.find((p) => p.isHost);
        const before = previous?.view.players.find((p) => p.isHost);
        if (host && host.id !== envelope.view.me.id) {
            showToast(before && before.id === host.id ? `${host.name} est revenu.` : `${host.name} a déjà repris la main.`);
        }
    }
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
        playFor(previous?.view.phase, envelope.view.phase, envelope.view.result?.reason, listener());
    }
    banner.hidden = true;
});

socket.on('disconnect', () => { banner.hidden = false; });
socket.on('connect', () => { banner.hidden = true; });

function send(command) {
    socket.emit('command', command, (ack) => {
        if (ack && ack.ok) {
            if (command.type === 'claimHost') {
                ui.claimSheet = false;
                repaint();
            }
            return;
        }
        if (command.type === 'claimHost') {
            // Un autre joueur a été plus rapide : la feuille se ferme sur son nom plutôt qu'un refus sec
            ui.claimSheet = false;
            repaint();
            const host = current?.view.players.find((p) => p.isHost);
            if (host && current && host.id !== current.view.me.id && current.view.hostChange?.to === host.id) {
                showToast(`${host.name} a déjà repris la main.`);
                return;
            }
        }
        showToast(messageFor(ack ?? { ok: false }));
    });
}

/** Copie l'adresse complète ; repli : sélectionner le texte affiché. */
async function copyUrl(url) {
    try {
        await navigator.clipboard.writeText(url);
        showToast('Adresse copiée.');
    } catch {
        const shown = screen.querySelector('.share-url');
        if (shown) {
            const range = document.createRange();
            range.selectNodeContents(shown);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
        }
    }
}

/** Actions locales d'interface (data-ui). Chacune met à jour `local` puis re-rend. */
const UI = {
    flip() {
        local.flipped = !local.flipped;
        clearTimeout(autohideTimer);
        if (local.flipped) {
            local.everFlipped = true;
            autohideTimer = setTimeout(() => {
                local.flipped = false;
                repaint();
            }, AUTOHIDE_MS);
        }
    },
    'pick-finder'() { local.finderPicking = true; },
    'cancel-finder'() { local.finderPicking = false; },
    // Le tap sélectionne, « Voter » envoie : le dernier votant peut encore se reprendre (repasse, point 6)
    'select-v1'(arg) { local.v1 = arg === 'true'; },
    'confirm-v1'() {
        if (local.v1 !== null) {
            send({ type: 'vote1', value: local.v1 });
        }
    },
    'select-v2'(arg) { local.v2 = arg; },
    'confirm-vote'() {
        if (local.v2 === null || !current) {
            return;
        }
        send({ type: current.view.phase === 'tiebreak' ? 'tiebreak' : 'vote2', candidate: local.v2 });
    },
    'kick-ask'(arg) { local.kickConfirm = arg; },
    'kick-cancel'() { local.kickConfirm = null; },
    'claim-ask'() { ui.claimSheet = true; },
    'claim-cancel'() { ui.claimSheet = false; },
    presence() { ui.presenceSheet = true; },
    'sheet-close'() { closeSheets(); },
    mute() {
        ui.muted = !ui.muted;
        saveMuted();
    },
    'copy-url'(arg) { copyUrl(arg ?? ''); }
};

/** Motif d'un bouton inactif : son data-reason, sinon la note qui l'accompagne. */
function reasonFor(button) {
    return button.getAttribute('data-reason')
        || button.parentElement?.querySelector('.dock-note')?.textContent
        || 'Pas encore possible.';
}

function onAction(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const blocked = target.closest('[aria-disabled="true"]');
    if (blocked) {
        showToast(reasonFor(blocked));
        return;
    }
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
phasebar.addEventListener('click', onAction);
sheetLayer.addEventListener('click', onAction);

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
        const word = String(data.get('word') ?? '').trim();
        if (word !== '') {
            send({ type: 'setWord', word });
        }
    }
}

screen.addEventListener('submit', onSubmit);

/*
 * Bloc secret (ADR D7) : l'appui maintenu révèle, le relâchement masque. Pas de durée minimale,
 * ni son ni vibration. L'état vit dans le DOM et se perd au re-rendu : le rendu par défaut est masqué.
 */
function hold(block, pressed) {
    block.setAttribute('aria-pressed', String(pressed));
}

screen.addEventListener('pointerdown', (event) => {
    const block = /** @type {HTMLElement} */ (event.target).closest('[data-hold]');
    if (!(block instanceof HTMLElement)) {
        return;
    }
    hold(block, true);
    const release = () => {
        hold(block, false);
        for (const type of ['pointerup', 'pointercancel', 'pointerleave', 'blur']) {
            block.removeEventListener(type, release);
        }
    };
    for (const type of ['pointerup', 'pointercancel', 'pointerleave', 'blur']) {
        block.addEventListener(type, release);
    }
});

screen.addEventListener('keydown', (event) => {
    const block = /** @type {HTMLElement} */ (event.target).closest?.('[data-hold]');
    if (block instanceof HTMLElement && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault();
        if (!event.repeat) {
            hold(block, true);
        }
    }
});

screen.addEventListener('keyup', (event) => {
    const block = /** @type {HTMLElement} */ (event.target).closest?.('[data-hold]');
    if (block instanceof HTMLElement && (event.key === ' ' || event.key === 'Enter')) {
        hold(block, false);
    }
});

screen.addEventListener('focusout', (event) => {
    const block = /** @type {HTMLElement} */ (event.target).closest?.('[data-hold]');
    if (block instanceof HTMLElement) {
        hold(block, false);
    }
});

/* Pas de menu contextuel ni de loupe sur un appui long */
screen.addEventListener('contextmenu', (event) => {
    if (/** @type {HTMLElement} */ (event.target).closest('[data-hold]')) {
        event.preventDefault();
    }
});

/* Le CTA du socle peut soumettre un formulaire du contenu : il porte data-submit="<form id>". */
dock.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target).closest('[data-submit]');
    if (target && target.getAttribute('aria-disabled') !== 'true') {
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
