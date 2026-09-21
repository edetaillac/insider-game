// public/js/render.js
// Un écran par phase, dérivé de la vue serveur et d'un état local d'interface.
// render() est pure : (envelope, local) -> { phase, content, dock, counter }.

import { escapeHtml as e, PHASE_BAR, initial, svg, ROLE_LABELS, ROLE_HINTS } from './dom.js';

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

/* §2 Salon */
function lobby(envelope, local) {
    const { view, online, minPlayers } = envelope;
    const isHost = view.me.isHost;
    const rows = view.players.map((p) => {
        const isMe = p.id === view.me.id;
        const isOnline = online.includes(p.id);
        const status = isMe ? 'Toi' : (isOnline ? 'En ligne' : 'Hors ligne');
        let trailing = '';
        if (isHost && !p.isHost) {
            trailing = local.kickConfirm === p.id
                ? `<span class="confirm-inline">Retirer ? ${cmdButton('kick', 'Oui', { id: p.id }, 'mini mini-yes')}${uiButton('kick-cancel', 'Non', '', 'mini mini-no')}</span>`
                : `<button type="button" class="icon-btn" data-ui="kick-ask" data-arg="${e(p.id)}" aria-label="Retirer ${e(p.name)}">${svg('cross')}</button>`;
        }
        return `<li class="row">${avatar(p.name, 'avatar avatar-40 ink')}<div class="row-main"><span class="row-name">${e(p.name)}</span><span class="row-status${isOnline || isMe ? '' : ' off'}">${e(status)}</span></div>${p.isHost ? '<span class="chip-host">Hôte</span>' : ''}${trailing}</li>`;
    }).join('');
    const url = envelope.shareUrl ?? (typeof location !== 'undefined' ? location.origin : '');
    const enough = view.players.length >= minPlayers;
    const hostName = view.players.find((p) => p.isHost)?.name ?? 'l\'hôte';
    let dock;
    if (can(view, 'startRound')) {
        dock = enough
            ? `${note('Tu es hôte : les autres attendent ton signal.')}${cmdButton('startRound', 'Lancer la partie')}`
            : `${note(`Il faut au moins ${minPlayers} joueurs.`)}${disabledButton('Lancer la partie')}`;
    } else {
        dock = `${note(`${hostName} lance la partie quand tout le monde est là.`)}${disabledButton('En attente de l\'hôte')}`;
    }
    return {
        content: `<h1 class="h2">Salon</h1>
        <p class="p" style="margin-top:4px">${view.players.length} ${view.players.length > 1 ? 'joueurs' : 'joueur'} à table · ${minPlayers} minimum pour lancer</p>
        <ul class="rows mt-14">${rows}</ul>
        <div class="well mt-14"><p>Partage cette adresse pour qu'un joueur rejoigne. On peut encore entrer jusqu'au lancement.</p><span class="share-url">${e(url)}</span></div>`,
        dock
    };
}

/* §3 puis §4 ou §5 : rôles */
function roles(envelope, local) {
    const { view } = envelope;
    if (!view.me.hasSeen) {
        return {
            content: `<div class="center"><p class="p" style="margin:0 auto 14px">Personne d'autre ne voit ta carte.</p></div>
            ${card(local, 'Ton rôle', { over: 'Tu es', secret: ROLE_LABELS[view.me.role], secretCls: 'role', text: ROLE_HINTS[view.me.role] })}
            <div class="mt-20">${progress(view, (p) => p.hasSeen, (n, total) => `${n} sur ${total} ont vu leur carte`)}</div>`,
            dock: cmdButton('seenRole', 'J\'ai vu ma carte')
        };
    }
    if (can(view, 'setWord')) {
        return {
            content: `<span class="pill">Tu mènes la manche</span>
            <h1 class="h2 mt-14">Choisis le mot</h1>
            <p class="p narrow">Un nom commun que les autres peuvent deviner par questions fermées.</p>
            <form id="word-form" data-form="setWord" autocomplete="off" class="mt-14">
                <input class="field" type="text" name="word" placeholder="Mot à faire deviner" maxlength="40" />
            </form>
            <div class="or">ou</div>
            ${cmdButton('drawWord', 'Tirer un mot au hasard', {}, 'btn btn-outline')}`,
            dock: `<button type="button" class="btn btn-primary btn-disabled" aria-disabled="true" data-submit="word-form">Valider le mot</button>`
        };
    }
    const masterName = view.master?.name ?? 'Le Maître';
    return {
        content: `<div class="center">${dots()}<h1 class="h3">${e(masterName)} choisit le mot</h1>
        <p class="lead" style="max-width:28ch">Rien à faire pour l'instant. Pose ton téléphone.</p></div>
        <div class="mt-20">${roleRecall(view, ROLE_LABELS, ROLE_HINTS)}</div>`,
        dock: disabledButton('Continuer')
    };
}

/* §6 Le rituel du mot */
function word(envelope, local) {
    const { view } = envelope;
    const back = view.word !== null
        ? { over: 'Le mot', secret: view.word, secretCls: 'word', text: 'Ne le dis pas. Réponds seulement oui, non, je ne sais pas.' }
        : { over: 'Le mot', secret: 'Tu ne connais pas le mot', secretCls: 'neutral', text: 'Garde la carte à l\'écran, comme les autres.' };
    const dock = can(view, 'startTimer')
        ? `${note('Lance le chrono quand tout le monde a regardé.')}${cmdButton('startTimer', 'Lancer le chrono')}`
        : `${note('L\'hôte lance le chrono quand tout le monde a regardé.')}${disabledButton('Lancer le chrono')}`;
    return {
        content: `<div class="center"><p class="p narrow" style="margin:0 auto 14px">Tout le monde retourne la même carte, en même temps. Rien ne trahit qui lit vraiment.</p></div>
        ${card(local, 'Le mot', back)}
        <div class="mt-20">${progress(view, (p) => p.hasSeen, (n, total) => `${n} sur ${total} ont regardé`)}</div>`,
        dock
    };
}

const SCREENS = {
    lobby,
    roles,
    word,
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
