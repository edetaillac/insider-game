// public/js/render.js
// Un écran par phase, dérivé de la vue serveur et d'un état local d'interface.
// render() est pure : (envelope, local) -> { phase, content, dock, counter }.

import { escapeHtml as e, PHASE_BAR, initial, svg, ROLE_LABELS, ROLE_HINTS, outcomeTitle } from './dom.js';

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

/** Bouton inactif. `reason` est affiché en toast au tap (repli : la note du socle). */
export function disabledButton(label, reason = '') {
    return `<button type="button" class="btn btn-disabled" aria-disabled="true"${reason ? ` data-reason="${e(reason)}"` : ''}>${e(label)}</button>`;
}

/** Bouton "vote enregistré" : inactif mais lisible comme une confirmation. */
function registeredButton() {
    return `<button type="button" class="btn btn-registered" aria-disabled="true" data-reason="Ton vote est enregistré. Touche une autre réponse pour le changer.">Vote enregistré</button>`;
}

/** Accusé de lecture d'une carte : actif seulement une fois la carte retournée au moins une fois. */
function seenDock(local, type, label) {
    return local.everFlipped
        ? cmdButton(type, label)
        : `${note('Retourne ta carte d\'abord.')}${disabledButton(label, 'Retourne ta carte d\'abord.')}`;
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
    return `<button type="button" class="card" data-ui="flip" data-key="${e(front)}" aria-pressed="${local.flipped ? 'true' : 'false'}"${local.flipped ? ' data-flipped' : ''}>
        <span class="card-face card-front"><span class="card-eye"></span><span class="card-title">${e(front)}</span><span class="card-hint">Touche pour révéler</span></span>
        <span class="card-face card-back"><span class="card-over">${e(back.over)}</span><span class="card-secret ${e(back.secretCls)}">${e(back.secret)}</span><span class="card-text">${e(back.text)}</span><span class="timebar"></span></span>
    </button>`;
}

export function dots() {
    return '<div class="dots" aria-hidden="true"><i></i><i></i><i></i></div>';
}

/* Écrans (remplacés par les Tasks 4 à 6). Chaque fonction renvoie { content, dock, phase? }. */

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
            dock: seenDock(local, 'seenRole', 'J\'ai vu ma carte')
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
            dock: `<button type="button" class="btn btn-primary btn-disabled" aria-disabled="true" data-reason="Écris un mot d'abord." data-submit="word-form">Valider le mot</button>`
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
    // Les deux textes font la même longueur : les faces révélées gardent la même silhouette
    const back = view.word !== null
        ? { over: 'Le mot', secret: view.word, secretCls: 'word', text: 'Ne le dis pas. Réponds seulement oui, non, je ne sais pas.' }
        : { over: 'Le mot', secret: 'Tu ne connais pas le mot', secretCls: 'neutral', text: 'Garde la carte à l\'écran, comme tout le monde, sans rien dire.' };
    let dock;
    if (!view.me.hasSeen) {
        dock = seenDock(local, 'seenWord', 'J\'ai regardé');
    } else if (can(view, 'startTimer')) {
        dock = `${note('Lance le chrono quand tout le monde a regardé.')}${cmdButton('startTimer', 'Lancer le chrono')}`;
    } else {
        dock = `${note('L\'hôte lance le chrono quand tout le monde a regardé.')}${disabledButton('Lancer le chrono')}`;
    }
    return {
        content: `<div class="center"><p class="p narrow" style="margin:0 auto 14px">Tout le monde retourne la même carte, en même temps. Rien ne trahit qui lit vraiment.</p></div>
        ${card(local, 'Le mot', back)}
        <div class="mt-20">${progress(view, (p) => p.hasSeen, (n, total) => `${n} sur ${total} ont regardé`)}</div>`,
        dock
    };
}

function timerBlock(view, { small = false, urgentAble = true } = {}) {
    if (!view.timer) {
        return '';
    }
    return `<p class="timer${small ? ' timer-sm' : ''}" data-timer${urgentAble ? ' data-urgent-able' : ''}>--:--</p>`;
}

const RULE_WELL = '<div class="well well-lg"><p class="label">Règle du tour</p><p>Questions fermées uniquement. Le Maître ne répond que <strong>oui</strong>, <strong>non</strong> ou <strong>je ne sais pas</strong>. Si le temps s\'écoule, tout le monde perd.</p></div>';

/* §8 Qui a trouvé (écran plein) */
function finderScreen(view) {
    const rows = view.players
        .filter((p) => p.id !== view.master?.id)
        .map((p) => `<button type="button" class="pick" data-cmd="wordFound" data-args='${e(JSON.stringify({ finderId: p.id }))}'>${avatar(p.name, 'avatar avatar-40 gold')}<span>${e(p.name)}</span>${svg('arrow')}</button>`)
        .join('');
    return {
        content: `${timerBlock(view, { small: true })}<h1 class="h2 mt-14">Qui a trouvé ?</h1><p class="p">Le chrono continue pendant ton choix.</p><div class="rows mt-14">${rows}</div>`,
        dock: uiButton('cancel-finder', 'Retour au chrono', '', 'btn btn-secondary')
    };
}

/* §7 L'enquête */
function playing(envelope, local) {
    const { view } = envelope;
    if (local.finderPicking && can(view, 'wordFound')) {
        return finderScreen(view);
    }
    const isMaster = view.me.role === 'master';
    let wordBlock = '';
    if (view.word !== null) {
        const wordNote = isMaster ? 'Visible seulement par toi et le Traître.' : 'Tu connais le mot. Personne ne doit le deviner sur ton visage.';
        wordBlock = `<div class="dark"><p class="dark-label">${isMaster ? 'Le mot à faire deviner' : 'Le mot'}</p><p class="dark-word">${e(view.word)}</p><p class="dark-note">${e(wordNote)}</p></div>`;
    }
    const dock = can(view, 'wordFound')
        ? uiButton('pick-finder', 'Le mot a été trouvé', '', isMaster ? 'btn btn-accent' : 'btn btn-primary')
        : `${note('Le Maître ou l\'hôte déclare le mot trouvé.')}${disabledButton('Le mot a été trouvé')}`;
    return {
        content: `<div class="timer-block center" data-urgent-block>${timerBlock(view)}<p class="eyebrow" style="margin:8px 0 0">Temps restant</p></div>
        <div class="timer-track"><div class="timer-fill"></div></div>
        <div class="stack mt-20">${wordBlock}${RULE_WELL}</div>`,
        dock
    };
}

/* §9 Discussion */
function discussion(envelope) {
    const { view } = envelope;
    const finder = view.finder?.name ?? '?';
    const isMaster = view.me.role === 'master';
    const wordSub = isMaster && view.word !== null ? `Le mot était <span class="gold">${e(view.word)}</span>` : 'Le mot a été trouvé';
    const dock = can(view, 'closeDiscussion')
        ? cmdButton('closeDiscussion', 'Passer au vote')
        : `${note('Le Maître passe au vote quand vous êtes prêts.')}${disabledButton('Passer au vote')}`;
    return {
        content: `<div class="found-banner">${avatar(finder, 'avatar avatar-44 gold')}<div><p class="title">${e(finder)} a trouvé</p><p class="sub">${wordSub}</p></div></div>
        <div class="well well-lg mt-14"><p class="label">Discussion, temps indicatif</p>${timerBlock(view, { small: true, urgentAble: false })}<p class="p" style="margin-top:10px">Reprenez le fil des questions. Qui savait déjà ? Qui a orienté ? Le Maître passe au vote quand vous êtes prêts.</p></div>`,
        dock
    };
}

/* §10 Premier vote */
function vote1(envelope, local) {
    const { view } = envelope;
    const finder = view.finder?.name ?? '?';
    const selected = local.v1 !== null ? local.v1 : (typeof view.me.ballot === 'boolean' ? view.me.ballot : null);
    const opt = (value, label, cls) => uiButton('select-v1', label, String(value), `opt ${cls}${selected === value ? ' selected' : ''}`, `<span>${e(label)}</span>${svg('check', 20)}`);
    const dock = view.me.hasVoted
        ? registeredButton()
        : disabledButton('Choisis une réponse', 'Touche Oui ou Non pour voter.');
    return {
        content: `<p class="eyebrow">Vote 1 sur 2</p>
        <h1 class="h1">${e(finder)} est-il<br>le Traître ?</h1>
        <p class="p narrow">Majorité stricte. Si elle est atteinte, la manche s'arrête immédiatement.</p>
        <div class="vote1">${opt(true, 'Oui, c\'est lui', 'opt-yes')}${opt(false, 'Non', 'opt-no')}</div>
        <div class="mt-20">${progress(view, (p) => p.hasVoted, (n, total) => `${n} sur ${total} ont voté`)}</div>
        <p class="p" style="font-size:13px">Ton vote reste modifiable tant que tout le monde n'a pas voté.</p>`,
        dock
    };
}

/* Ligne de candidat partagée par vote2 et tiebreak. Inerte (div) quand le joueur ne choisit pas. */
function candidateRow(view, c, selected, score, interactive = true) {
    const isCenter = c.id === 'center';
    const label = isCenter ? 'Personne, il n\'y a pas de Traître' : c.name;
    const cls = `cand${isCenter ? ' cand-center' : ''}${selected ? ' selected' : ''}`;
    const inner = isCenter
        ? `<span>${e(label)}</span>${score !== null ? `<span class="score">${score}</span>` : ''}${svg('check', 20)}`
        : `${avatar(c.name, 'avatar avatar-40')}<span>${e(c.name)}</span>${score !== null ? `<span class="score">${score}</span>` : ''}${svg('check', 20)}`;
    return interactive ? uiButton('select-v2', label, c.id, cls, inner) : `<div class="${cls}">${inner}</div>`;
}

/* §11 Second vote */
function vote2(envelope, local) {
    const { view } = envelope;
    const chosen = local.v2 ?? (typeof view.me.ballot === 'string' ? view.me.ballot : null);
    const rows = (view.candidates ?? []).map((c) => candidateRow(view, c, chosen === c.id, null)).join('');
    const confirmed = view.me.hasVoted && chosen === view.me.ballot;
    let dock;
    if (chosen === null) {
        dock = disabledButton('Choisis un joueur', 'Touche un joueur de la liste pour voter.');
    } else if (confirmed) {
        dock = registeredButton();
    } else {
        dock = uiButton('confirm-vote', 'Confirmer mon vote');
    }
    return {
        content: `<p class="eyebrow">Vote 2 sur 2</p>
        <h1 class="h1">Qui est le Traître ?</h1>
        <p class="p">Le plus pointé révèle son rôle.</p>
        <div class="rows mt-14">${rows}</div>
        <div class="mt-20">${progress(view, (p) => p.hasVoted, (n, total) => `${n} sur ${total} ont voté`)}</div>`,
        dock
    };
}

/* §11 Égalité */
function tiebreak(envelope, local) {
    const { view } = envelope;
    const decides = can(view, 'tiebreak');
    const finder = view.finder?.name ?? 'Le trouveur';
    const chosen = local.v2;
    const rows = (view.candidates ?? []).map((c) => candidateRow(view, c, decides && chosen === c.id, view.tallies?.[c.id] ?? 0, decides)).join('');
    const dock = decides
        ? (chosen === null ? disabledButton('Choisis un joueur', 'Touche un des ex aequo pour départager.') : uiButton('confirm-vote', 'Départager'))
        : `${note(`${finder} départage.`)}${disabledButton('En attente')}`;
    return {
        content: `<p class="eyebrow">Vote 2 sur 2</p>
        <h1 class="h1">Égalité</h1>
        <p class="p">${decides ? 'À toi de départager : le plus pointé révèle son rôle.' : `${e(finder)} départage entre les ex aequo.`}</p>
        <div class="rows mt-14">${rows}</div>`,
        dock
    };
}

/* §12 Résultat */
function ended(envelope) {
    const { view } = envelope;
    const r = view.result;
    const reveal = r?.insiderId
        ? `<div class="reveal">${avatar(playerName(view, r.insiderId), 'avatar avatar-52 gold')}<div><p class="dark-label">Le Traître était</p><p class="reveal-name">${e(playerName(view, r.insiderId))}</p></div></div>`
        : `<div class="reveal"><div><p class="dark-label">Le Traître</p><p class="reveal-name">Il n'y avait pas de Traître</p></div></div>`;
    const tallies = view.tallies ? Object.entries(view.tallies) : [];
    const max = tallies.reduce((m, [, n]) => Math.max(m, n), 0);
    const pointed = r?.pointed ?? null;
    /* Après un départage, seul le candidat désigné par le trouveur est marqué, sinon le ou les plus pointés */
    const isTop = (id, n) => (pointed !== null ? id === pointed : n === max && n > 0);
    const bars = tallies.length
        ? `<div class="mt-20"><p class="label">Les votes</p>${tallies.map(([id, n]) => `<div class="tally"><div class="tally-row"><span>${e(id === 'center' ? 'Pas de Traître' : playerName(view, id))}${pointed === id ? ' <span class="tally-tag">désigné</span>' : ''}</span><span>${n}</span></div><div class="tally-track"><div class="tally-fill${isTop(id, n) ? ' top' : ''}" style="width:${max > 0 ? Math.round((n / max) * 100) : 0}%"></div></div></div>`).join('')}</div>`
        : '';
    const dock = [
        can(view, 'startRound') ? cmdButton('startRound', 'Rejouer une manche') : '',
        can(view, 'reset') ? cmdButton('reset', 'Retour au salon', {}, 'btn btn-secondary') : ''
    ].filter(Boolean).join('') || `${note('L\'hôte relance quand vous êtes prêts.')}${disabledButton('En attente de l\'hôte')}`;
    return {
        content: `<p class="eyebrow">Fin de la manche</p>
        <h1 class="h-xl">${e(r ? outcomeTitle(r) : 'Fin de partie')}</h1>
        <div class="mt-20">${reveal}</div>
        <div class="well word-line mt-14"><p class="label">Le mot</p><span class="word-value">${e(view.word ?? '?')}</span></div>
        ${bars}`,
        dock
    };
}

const SCREENS = {
    lobby,
    roles,
    word,
    playing,
    discussion,
    vote1,
    vote2,
    tiebreak,
    ended
};

/** Barre de phase : `roles` bascule sur "Le mot" une fois la carte vue. */
function phaseBar(view) {
    if (view.phase === 'roles' && view.me.hasSeen) {
        return PHASE_BAR.rolesWord;
    }
    return PHASE_BAR[view.phase] ?? { label: view.phase, rank: '' };
}

/** Hôte hors ligne : n'importe quel autre joueur peut reprendre la main, dans toutes les phases. */
function hostAway(envelope) {
    const { view, online } = envelope;
    const host = view.players.find((p) => p.isHost);
    if (view.me.isHost || (host && online.includes(host.id))) {
        return '';
    }
    const who = host ? `${e(host.name)}, l'hôte, n'est plus connecté.` : 'La table n\'a plus d\'hôte.';
    return `<div class="well host-away"><p>${who} Sans hôte, la partie ne peut pas avancer.</p>${cmdButton('claimHost', 'Reprendre la main', {}, 'btn btn-secondary mt-14')}</div>`;
}

/**
 * @param {{ view: any, online: string[], serverTime: number, minPlayers: number, shareUrl: string|null }} envelope
 * @param {{ flipped: boolean, everFlipped: boolean, v1: boolean|null, v2: string|null, finderPicking: boolean, kickConfirm: string|null }} local
 */
export function render(envelope, local) {
    const { view } = envelope;
    const screen = (SCREENS[view.phase] ?? (() => ({ content: '', dock: '' })))(envelope, local);
    return {
        phase: screen.phase ?? phaseBar(view),
        content: hostAway(envelope) + screen.content,
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
