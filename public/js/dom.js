// public/js/dom.js
// Helpers purs du client, testables sous node : aucune référence au DOM ici.

export const ROLE_LABELS = Object.freeze({ master: 'Maître du jeu', insider: 'Traître', common: 'Citoyen' });

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

/** @param {{ outcome: string, reason: string }} result */
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
