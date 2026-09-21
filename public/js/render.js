// public/js/render.js
// Un écran par phase, dérivé de la vue serveur et d'un état local d'interface.
// render() est pure : (envelope, local) -> { phase, content, dock, counter }.

import { escapeHtml as e, PHASE_BAR, initial, svg } from './dom.js';

/* Briques partagées */

export function can(view, type) {
    return view.actions.includes(type);
}

export function playerName(view, id) {
    return view.players.find((p) => p.id === id)?.name ?? '?';
}

/** Bouton de commande serveur. */
export function cmdButton(type, label, args = {}, cls = 'btn btn-primary') {
    return `<button type="button" class="${cls}" data-cmd="${e(type)}" data-args='${e(JSON.stringify(args))}'>${e(label)}</button>`;
}

/** Bouton d'action locale (data-ui). */
export function uiButton(action, label, arg = '', cls = 'btn btn-primary', inner = '') {
    return `<button type="button" class="${cls}" data-ui="${e(action)}"${arg !== '' ? ` data-arg="${e(arg)}"` : ''}>${inner || e(label)}</button>`;
}

/** Bouton inactif qui porte son motif. */
export function disabledButton(label) {
    return `<button type="button" class="btn btn-disabled" aria-disabled="true">${e(label)}</button>`;
}

export function note(text) {
    return text ? `<p class="dock-note">${e(text)}</p>` : '';
}

export function avatar(name, cls = 'avatar') {
    return `<span class="${cls}" aria-hidden="true">${e(initial(name))}</span>`;
}

/** Progression collective (handoff "Composant : progression collective"). */
export function progress(view, done, label) {
    const items = view.players.map((p) => avatar(p.name, `avatar${done(p) ? ' on' : ''}`)).join('');
    const count = view.players.filter(done).length;
    return `<div class="well progress"><p class="label">${e(label(count, view.players.length))}</p><div class="avatars">${items}</div></div>`;
}

/** Rappel du rôle, encadré (handoff §5). */
export function roleRecall(view, roleLabels, roleHints) {
    if (!view.me.role) {
        return '';
    }
    return `<div class="well well-lg role-recall"><p class="label">Ton rôle</p><p class="name">${e(roleLabels[view.me.role])}</p><p class="p" style="margin:0">${e(roleHints[view.me.role])}</p></div>`;
}

/**
 * Carte à retourner. `front` : titre. `back` : { over, secret, secretCls, text }.
 * La barre de temps se vide en 5 s dès que la carte est retournée.
 */
export function card(local, front, back) {
    return `<button type="button" class="card" data-ui="flip" aria-pressed="${local.flipped ? 'true' : 'false'}"${local.flipped ? ' data-flipped' : ''}>
        <span class="card-face card-front"><span class="card-eye"></span><span class="card-title">${e(front)}</span><span class="card-hint">Touche pour révéler</span></span>
        <span class="card-face card-back"><span class="card-over">${e(back.over)}</span><span class="card-secret ${e(back.secretCls)}">${e(back.secret)}</span><span class="card-text">${e(back.text)}</span><span class="timebar"></span></span>
    </button>`;
}

export function dots() {
    return '<div class="dots" aria-hidden="true"><i></i><i></i><i></i></div>';
}

/* Écrans (remplacés par les Tasks 4 à 6). Chaque fonction renvoie { content, dock, phase? }. */

function fallback(envelope) {
    const { view } = envelope;
    const actions = view.actions.map((type) => cmdButton(type, type, {}, 'btn btn-outline')).join('');
    return {
        content: `<p class="eyebrow">${e(view.phase)}</p><p class="p">Écran en cours de refonte.</p>`,
        dock: actions
    };
}

const SCREENS = {
    lobby: fallback,
    roles: fallback,
    word: fallback,
    playing: fallback,
    discussion: fallback,
    vote1: fallback,
    vote2: fallback,
    tiebreak: fallback,
    ended: fallback
};

/** Barre de phase : `roles` bascule sur "Le mot" une fois la carte vue. */
function phaseBar(view) {
    if (view.phase === 'roles' && view.me.hasSeen) {
        return PHASE_BAR.rolesWord;
    }
    return PHASE_BAR[view.phase] ?? { label: view.phase, rank: '' };
}

/**
 * @param {{ view: any, online: string[], serverTime: number, minPlayers: number, shareUrl: string|null }} envelope
 * @param {{ flipped: boolean, v1: boolean|null, v2: string|null, finderPicking: boolean, kickConfirm: string|null }} local
 */
export function render(envelope, local) {
    const { view } = envelope;
    const screen = (SCREENS[view.phase] ?? fallback)(envelope, local);
    return {
        phase: screen.phase ?? phaseBar(view),
        content: screen.content,
        dock: screen.dock ?? '',
        counter: String(view.players.length)
    };
}

/** Écran d'accueil (handoff §1). */
export function renderJoin(error = '', name = '') {
    return {
        phase: null,
        counter: '',
        content: `<h1 class="h1" style="font-size:38px;margin:24px 0 8px">Qui es-tu ?</h1>
        <p class="lead">Ton prénom s'affiche pour les autres joueurs pendant toute la manche.</p>
        <form id="join-form" data-form="join" autocomplete="off">
            <label class="field-label" for="join-name">Prénom</label>
            <input id="join-name" class="field" type="text" name="name" placeholder="Ton prénom" maxlength="20" required value="${e(name)}" />
            <p class="field-error" role="alert">${e(error)}</p>
        </form>
        <div class="well mt-14"><p>Le premier arrivé devient <strong>hôte</strong> : il lance la partie et gère la table.</p></div>`,
        dock: `<button type="button" class="btn btn-primary" data-submit="join-form">Rejoindre la table</button>`
    };
}

export { SCREENS, svg };
