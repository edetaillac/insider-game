// public/js/dom.js
// Helpers purs du client, testables sous node : aucune référence au DOM ici.

export const ROLE_LABELS = Object.freeze({ master: 'Maître du jeu', insider: 'Traître', common: 'Citoyen' });

export const ROLE_HINTS = Object.freeze({
    master: 'Tu choisis le mot et tu réponds aux questions.',
    insider: 'Tu connais le mot. Fais-le trouver sans te faire repérer.',
    common: 'Trouve le mot, puis démasque le Traître.'
});

/** Libellé et rang de la barre de phase (handoff, "Barre de phase"). */
export const PHASE_BAR = Object.freeze({
    lobby: { label: 'Salon', rank: '' },
    roles: { label: 'Les rôles', rank: '1 / 6' },
    rolesWord: { label: 'Choix du mot', rank: '2 / 6' },
    word: { label: 'Le mot', rank: '2 / 6' },
    playing: { label: 'Enquête', rank: '3 / 6' },
    discussion: { label: 'Discussion', rank: '4 / 6' },
    vote1: { label: 'Premier vote', rank: '5 / 6' },
    vote2: { label: 'Second vote', rank: '6 / 6' },
    tiebreak: { label: 'Second vote', rank: '6 / 6' },
    ended: { label: 'Résultat', rank: '' }
});

const ERROR_MESSAGES = Object.freeze({
    WRONG_PHASE: 'Cette action n\'est plus possible.',
    FORBIDDEN: 'Tu n\'as pas le droit de faire ça.',
    INVALID_ARGUMENT: 'Demande invalide.',
    TOO_FEW_PLAYERS: 'Pas assez de joueurs.',
    TOO_MANY_PLAYERS: 'La table est pleine.',
    DUPLICATE_NAME: 'Ce prénom est déjà pris.',
    DUPLICATE_ID: 'Ce joueur existe déjà.',
    UNKNOWN_PLAYER: 'Joueur inconnu.',
    NOT_YET: 'Pas encore.'
});

/** @param {unknown} value */
export function escapeHtml(value) {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** @param {number} ms */
export function formatCountdown(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Première lettre d'un prénom, en capitale, pour les pastilles. */
export function initial(name) {
    const trimmed = String(name ?? '').trim();
    return trimmed ? trimmed[0].toLocaleUpperCase('fr') : '?';
}

/** Issue de la manche, en deux lignes maximum (handoff §12). */
export function outcomeTitle(result) {
    switch (result.outcome) {
        case 'commonsWin':
            return 'Les Citoyens gagnent';
        case 'insiderWins':
            return 'Le Traître gagne';
        case 'allWin':
            return 'Tout le monde gagne';
        case 'allLose':
        default:
            return result.reason === 'timeout' ? 'Le temps est écoulé' : 'Tout le monde perd';
    }
}

/** Phrase complète, utilisée par les messages et les tests historiques. */
export function outcomeSentence(result) {
    switch (result.outcome) {
        case 'commonsWin':
            return 'Les Citoyens gagnent !';
        case 'insiderWins':
            return 'Le Traître gagne !';
        case 'allWin':
            return 'Tout le monde gagne, il n\'y avait pas de Traître !';
        case 'allLose':
        default:
            return result.reason === 'timeout' ? 'Le temps est écoulé, tout le monde perd.' : 'Tout le monde perd.';
    }
}

/** @param {{ ok: boolean, error?: string, message?: string }} ack */
export function messageFor(ack) {
    if (ack.error && Object.hasOwn(ERROR_MESSAGES, ack.error)) {
        return ERROR_MESSAGES[ack.error];
    }
    return ack.message || 'Erreur inconnue.';
}

/** Glyphes SVG en ligne, un seul trait, 24x24. */
const ICONS = Object.freeze({
    check: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
    cross: '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
    arrow: '<path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'
});

/** @param {'check'|'cross'|'arrow'} name @param {number} [size] */
export function svg(name, size = 20) {
    return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}
