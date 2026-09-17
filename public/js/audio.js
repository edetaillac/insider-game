// public/js/audio.js
// Les navigateurs mobiles bloquent le son sans geste utilisateur : on débloque au premier tap,
// on précharge les sons, on demande le Wake Lock. Un son par transition de phase.

const SOUND_BY_PHASE = Object.freeze({
    roles: 'mysterious',
    word: 'message',
    playing: 'go',
    discussion: 'ding',
    vote1: 'message',
    vote2: 'message',
    tiebreak: 'message',
    ended: 'tada'
});

/** @type {Map<string, HTMLAudioElement>} */
const cache = new Map();
let unlocked = false;
/** @type {any} */
let wakeLock = null;

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
    for (const name of new Set([...Object.values(SOUND_BY_PHASE), 'dong'])) {
        const audio = new Audio(`/static/sound/${name}.mp3`);
        audio.preload = 'auto';
        cache.set(name, audio);
    }
    try {
        const probe = cache.get('ding');
        probe.muted = true;
        await probe.play();
        probe.pause();
        probe.currentTime = 0;
        probe.muted = false;
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

/**
 * Joue le son de la transition, jamais au premier rendu ni sans changement de phase.
 * @param {string|undefined} previousPhase
 * @param {string} phase
 * @param {string|undefined} reason
 */
export function playFor(previousPhase, phase, reason) {
    if (!unlocked || previousPhase === undefined || previousPhase === phase) {
        return;
    }
    const name = phase === 'ended' && reason === 'timeout' ? 'dong' : SOUND_BY_PHASE[phase];
    const audio = name ? cache.get(name) : undefined;
    if (!audio) {
        return;
    }
    audio.currentTime = 0;
    audio.play().catch(() => {});
}
