// public/js/dom.js
// Helpers purs du client, testables sous node : aucune référence au DOM ici.

export const ROLE_LABELS = Object.freeze({ master: 'Maître du jeu', insider: 'Traître', common: 'Citoyen' });

export const ROLE_HINTS = Object.freeze({
    master: 'Tu choisis le mot et tu réponds aux questions.',
    insider: 'Tu connais le mot. Fais-le trouver sans te faire repérer.',
    common: 'Trouve le mot, puis démasque le Traître.'
});

/** Avec la variante, le Maître et les Citoyens savent qu'il peut n'y avoir aucun Traître (le Traître, lui, sait qu'il existe). */
const VARIANT_HINTS = Object.freeze({
    master: 'Tu choisis le mot et tu réponds aux questions. Il peut n\'y avoir aucun Traître.',
    common: 'Trouve le mot, puis démasque le Traître, s\'il y en a un.'
});

/** @param {'master'|'insider'|'common'} role @param {boolean} traitorOptional */
export function roleHint(role, traitorOptional) {
    return (traitorOptional && VARIANT_HINTS[role]) || ROLE_HINTS[role];
}

/** Libellé et rang de la barre de phase (handoff, "Barre de phase"). */
export const PHASE_BAR = Object.freeze({
    lobby: { label: 'Salon', rank: '' },
    roles: { label: 'Les rôles', rank: '1/6' },
    rolesWord: { label: 'Choix du mot', rank: '2/6' },
    word: { label: 'Le mot', rank: '2/6' },
    playing: { label: 'Enquête', rank: '3/6' },
    discussion: { label: 'Discussion', rank: '4/6' },
    vote1: { label: 'Premier vote', rank: '5/6' },
    vote2: { label: 'Second vote', rank: '6/6' },
    tiebreak: { label: 'Second vote', rank: '6/6' },
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

const VOWELS = new Set('aeiouyàâäéèêëîïôöùûüÿœæ');

/**
 * Initiales distinctes (handoff repasse, point 8) : une lettre, sinon la première consonne qui suit,
 * sinon la deuxième lettre. Deux caractères au plus.
 * @param {Array<{ id: string, name: string }>} players
 * @returns {Map<string, string>}
 */
export function initials(players) {
    const first = new Map(players.map((p) => [p.id, initial(p.name)]));
    const result = new Map(first);
    const groups = new Map();
    for (const p of players) {
        groups.set(first.get(p.id), [...(groups.get(first.get(p.id)) ?? []), p]);
    }
    for (const [letter, group] of groups) {
        if (group.length < 2) {
            continue;
        }
        const rest = (p) => [...String(p.name).trim().slice(1).toLocaleLowerCase('fr')];
        const consonant = (p) => letter + (rest(p).find((c) => /\p{L}/u.test(c) && !VOWELS.has(c)) ?? rest(p)[0] ?? '');
        const second = (p) => letter + (rest(p)[0] ?? '');
        const tries = group.map(consonant);
        group.forEach((p, i) => {
            const clash = tries.filter((t) => t === tries[i]).length > 1;
            result.set(p.id, clash ? second(p) : tries[i]);
        });
    }
    return result;
}

/**
 * Phrase qui dit ce qui a décidé la manche (handoff repasse, point 4).
 * @param {{ players: Array<{ id: string, name: string }>, result: any }} view
 * @param {string|null} finderId
 */
export function outcomeStory(view, finderId) {
    const r = view.result;
    const name = (id) => view.players.find((p) => p.id === id)?.name ?? '?';
    const roleOf = (id) => r.roles?.[id];
    if (r.reason === 'timeout') {
        return 'Personne n\'a trouvé le mot avant la fin du chrono.';
    }
    if (r.reason === 'vote1') {
        const accused = r.pointed ?? finderId;
        const yes = r.tallies?.[accused] ?? 0;
        const who = `${yes} ${yes > 1 ? 'joueurs' : 'joueur'} sur ${view.players.length} ${yes > 1 ? 'ont' : 'a'} accusé ${name(accused)}`;
        return roleOf(accused) === 'insider' ? `Au vote 1, ${who}. C'était bien le Traître.` : `Au vote 1, ${who}, qui était Citoyen.`;
    }
    const pointed = r.pointed;
    let tail;
    if (pointed === 'center') {
        tail = r.centerCard === 'insider'
            ? 'La majorité a vu juste : il n\'y avait pas de Traître.'
            : 'La majorité a pointé « Personne », mais il y avait un Traître.';
    } else if (roleOf(pointed) === 'insider') {
        tail = r.reason === 'tiebreak' ? `${name(pointed)} a été désigné. C'était bien le Traître.` : `Au vote 2, ${name(pointed)} a été le plus pointé. C'était bien le Traître.`;
    } else if (r.centerCard === 'insider') {
        tail = 'Il n\'y avait pas de Traître, et un Citoyen a été accusé.';
    } else {
        tail = r.reason === 'tiebreak' ? `${name(pointed)} a été désigné, mais c'était un Citoyen.` : `Au vote 2, ${name(pointed)} a été le plus pointé, mais c'était un Citoyen.`;
    }
    return r.reason === 'tiebreak' ? `Égalité au vote 2, ${name(finderId)} a départagé. ${tail}` : tail;
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
    arrow: '<path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
    speaker: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    'speaker-off': '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
});

/** @param {'check'|'cross'|'arrow'|'speaker'|'speaker-off'} name @param {number} [size] */
export function svg(name, size = 20) {
    return `<svg class="icon" data-icon="${name}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}
