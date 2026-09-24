// public/js/audio.js
// Les navigateurs mobiles bloquent le son sans geste utilisateur : on débloque au premier tap,
// on précharge les sons, on demande le Wake Lock pour tout le monde.
// Seul le téléphone de l'hôte joue les sons, et seulement quatre, aux moments où les téléphones sont posés
// (handoff 2026-09-24, lot 5). Jamais de son lié à un rôle (ADR D6).

export const SOUNDS = Object.freeze(['go', 'warn', 'dong', 'tada']);

const VOLUME = 0.7;

/** @type {Map<string, HTMLAudioElement>} */
const cache = new Map();
let unlocked = false;
/** @type {any} */
let wakeLock = null;

/**
 * Son d'une transition de phase, jamais au premier rendu ni sans changement de phase.
 * @param {string|undefined} previousPhase
 * @param {string} phase
 * @param {string|undefined} [reason]
 * @returns {string|null}
 */
export function soundFor(previousPhase, phase, reason) {
    if (previousPhase === undefined || previousPhase === phase) {
        return null;
    }
    if (phase === 'playing') {
        return 'go';
    }
    if (phase === 'ended') {
        return reason === 'timeout' ? 'dong' : 'tada';
    }
    return null;
}

/** @param {{ isHost: boolean, muted: boolean }} who */
export function audible({ isHost, muted }) {
    return Boolean(isHost) && !muted;
}

/** Laisse passer une seule fois chaque clé : une clé par manche pour le son des 30 s. */
export function createWarnGate() {
    /** @type {string|null} */
    let last = null;
    return (/** @type {string} */ key) => {
        if (key === last) {
            return false;
        }
        last = key;
        return true;
    };
}

const warnGate = createWarnGate();

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => { wakeLock = null; });
        }
    } catch {
        wakeLock = null;
    }
}

/** À appeler depuis un gestionnaire d'événement utilisateur (tap, submit). */
export async function unlock() {
    if (unlocked) {
        return;
    }
    unlocked = true;
    for (const name of SOUNDS) {
        const audio = new Audio(`/static/sound/${name}.mp3`);
        audio.preload = 'auto';
        audio.volume = VOLUME;
        cache.set(name, audio);
    }
    try {
        await Promise.all([...cache.values()].map(async (audio) => {
            audio.muted = true;
            await audio.play();
            audio.pause();
            audio.currentTime = 0;
            audio.muted = false;
        }));
    } catch {
        // Le déblocage a échoué, les sons resteront silencieux jusqu'au prochain geste
        unlocked = false;
        return;
    }
    await requestWakeLock();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && wakeLock === null) {
            requestWakeLock();
        }
    });
}

/** @param {string|null} name */
function play(name) {
    const audio = name && unlocked ? cache.get(name) : undefined;
    if (!audio) {
        return;
    }
    audio.currentTime = 0;
    audio.play().catch(() => {});
}

/**
 * @param {string|undefined} previousPhase
 * @param {string} phase
 * @param {string|undefined} reason
 * @param {{ isHost: boolean, muted: boolean }} who
 */
export function playFor(previousPhase, phase, reason, who) {
    if (!audible(who)) {
        return;
    }
    play(soundFor(previousPhase, phase, reason));
}

/**
 * Plus que 30 s : une fois par manche, au même seuil que le passage du chrono en `.urgent`.
 * @param {string} roundKey
 * @param {{ isHost: boolean, muted: boolean }} who
 */
export function playWarn(roundKey, who) {
    if (warnGate(roundKey) && audible(who)) {
        play('warn');
    }
}
