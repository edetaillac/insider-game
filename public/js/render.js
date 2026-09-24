// public/js/render.js
// Un écran par phase, dérivé de la vue serveur et d'un état local d'interface.
// render() est pure : (envelope, local, ui) -> { phase, bar, content, dock, sheet }.

import { escapeHtml as e, PHASE_BAR, svg, ROLE_LABELS, outcomeTitle, outcomeStory, initials, roleHint } from './dom.js';

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

/** Pastille d'initiales. `label` est déjà calculé par `ini()` : à deux caractères, la police baisse d'un cran. */
export function avatar(label, cls = 'avatar') {
    return `<span class="${cls}${[...label].length > 1 ? ' duo' : ''}" aria-hidden="true">${e(label)}</span>`;
}

/** Initiales distinctes d'un joueur à cette table (handoff repasse, point 8). */
export function ini(view, id) {
    return initials(view.players).get(id) ?? '?';
}

/**
 * Bas d'écran d'attente (point 7) : une phrase qui nomme la personne attendue, jamais un bouton mort.
 * On garde un bouton grisé seulement quand ce joueur pourra agir.
 */
export function waitDock(text) {
    return `<div class="dock-wait" role="status"><span class="wait-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${e(text)}</span></div>`;
}

/** Progression collective (handoff "Composant : progression collective"). */
export function progress(view, done, label) {
    const items = view.players.map((p) => `<span class="prog-item${done(p) ? ' on' : ''}">${avatar(ini(view, p.id), `avatar${done(p) ? ' on' : ''}`)}<span class="prog-name">${e(p.name)}</span></span>`).join('');
    const count = view.players.filter(done).length;
    return `<div class="well progress"><p class="label">${e(label(count, view.players.length))}</p><div class="avatars">${items}</div></div>`;
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

/* Messages (handoff 2026-09-24, lot 1). L'action vit dans le socle, jamais dans le message. */

/** Alerte : un problème bloque la table. `announce` pose role="alert" à son apparition seulement. */
export function msgAlert({ eyebrow, title = '', body, awayInitial, compact = false, announce = false }) {
    const heading = !compact && title ? `<p class="msg-title">${e(title)}</p>` : '';
    return `<div class="msg-alert${compact ? ' compact' : ''}"${announce ? ' role="alert"' : ''}><span class="avatar-away${[...awayInitial].length > 1 ? ' duo' : ''}" aria-hidden="true">${e(awayInitial)}</span><div class="msg-text"><p class="msg-eyebrow">${e(eyebrow)}</p>${heading}<p class="msg-body">${e(body)}</p></div></div>`;
}

/** Confirmation : ce qui vient de changer pour moi. */
export function msgOk({ title, body }) {
    return `<div class="msg-ok" role="status"><span class="msg-icon">${svg('check', 22)}</span><div class="msg-text"><p class="msg-title">${e(title)}</p><p class="msg-body">${e(body)}</p></div></div>`;
}

/** Info : ce qui a changé à la table pour les autres. `html` est déjà échappé. */
export function msgInfo({ html, avatarInitial }) {
    return `<div class="msg-info" role="status">${avatar(avatarInitial, 'avatar ink')}<p>${html}</p></div>`;
}

function hostOf(view) {
    return view.players.find((p) => p.isHost) ?? null;
}

function hostName(view) {
    return hostOf(view)?.name ?? 'l\'hôte';
}

function isOnline(envelope, id) {
    return id === envelope.view.me.id || envelope.online.includes(id);
}

/** Phases où le Maître fait avancer la manche sans l'hôte, et ce qu'il peut faire. */
const MASTER_NEXT = Object.freeze({
    roles: 'Le Maître choisit le mot, la manche continue.',
    word: 'Le Maître peut lancer le chrono.',
    playing: 'Le Maître peut déclarer le mot trouvé.',
    discussion: 'Le Maître peut passer au vote.'
});

function masterCarries(envelope) {
    const { view } = envelope;
    return Object.hasOwn(MASTER_NEXT, view.phase) && view.master !== null && envelope.online.includes(view.master.id);
}

/** Corps de l'alerte compacte : ce que l'absence de l'hôte bloque dans cette phase. */
function awayBody(envelope, name) {
    const phase = envelope.view.phase;
    if (phase === 'ended') {
        return `${name} s'est déconnecté. Sans hôte, pas de nouvelle manche.`;
    }
    if (masterCarries(envelope)) {
        return `${name} s'est déconnecté. ${MASTER_NEXT[phase]}`;
    }
    if (phase === 'vote1' || phase === 'vote2' || phase === 'tiebreak') {
        return `${name} s'est déconnecté. La manche continue, mais sans hôte pas de nouvelle manche.`;
    }
    return `${name} s'est déconnecté. Sans hôte, la partie ne peut pas avancer.`;
}

/** Message en tête de contenu : reprise possible (2a, 2f), puis changement d'hôte récent (2c, 2d, 2e). */
function topMessage(envelope, local) {
    const { view } = envelope;
    if (can(view, 'claimHost')) {
        const host = hostOf(view);
        const name = host?.name ?? '?';
        const awayInitial = host ? ini(view, host.id) : '?';
        const announce = !local.announced;
        return view.phase === 'lobby'
            ? msgAlert({ eyebrow: 'L\'hôte est parti', title: `${name} s'est déconnecté`, body: 'Sans hôte, personne ne peut lancer la partie. N\'importe quel joueur peut prendre le relais.', awayInitial, announce })
            : msgAlert({ eyebrow: 'L\'hôte est parti', body: awayBody(envelope, name), awayInitial, compact: true, announce });
    }
    const change = view.hostChange;
    if (!change) {
        return '';
    }
    const to = playerName(view, change.to);
    if (change.to === view.me.id) {
        const body = view.phase === 'lobby' || view.phase === 'ended' ? 'La table attend ton signal pour lancer.' : 'La partie avance à ton signal.';
        return msgOk({ title: 'Tu es l\'hôte', body });
    }
    if (change.from === view.me.id) {
        return msgInfo({ avatarInitial: ini(view, change.to), html: `<strong>${e(`${to} est hôte depuis ton départ.`)}</strong> ${e('Tu restes à table comme joueur.')}` });
    }
    const from = change.from ? ` ${e(`${playerName(view, change.from)} s'est déconnecté, il reste à table.`)}` : '';
    return msgInfo({ avatarInitial: ini(view, change.to), html: `<strong>${e(`${to} a repris la main.`)}</strong>${from}` });
}

/** Note de l'hôte au salon : le son de la partie sort de son téléphone (lot 5). */
function soundNote(ui) {
    const text = ui.muted ? 'Tu es hôte : le son est coupé sur ton téléphone.' : 'Tu es hôte : le son de la partie sort de ton téléphone.';
    return `<p class="dock-note note-sound">${svg(ui.muted ? 'speaker-off' : 'speaker', 16)}${e(text)}</p>`;
}

/** Socle de reprise (2a, 2f) : l'action exceptionnelle, en jaune. */
function claimDock(view) {
    return `${note(`Tu deviendras hôte à la place de ${hostName(view)}.`)}${uiButton('claim-ask', 'Reprendre la main', '', 'btn btn-accent')}`;
}

/** Ordre des lignes : moi, l'hôte, les autres par arrivée ; les absents en fin de liste. */
function orderedPlayers(envelope) {
    const { view } = envelope;
    const rank = (p) => (p.id === view.me.id ? 0 : (p.isHost ? 1 : 2));
    return view.players
        .map((p, i) => ({ p, i }))
        .sort((x, y) => (isOnline(envelope, x.p.id) ? 0 : 1) - (isOnline(envelope, y.p.id) ? 0 : 1) || rank(x.p) - rank(y.p) || x.i - y.i)
        .map(({ p }) => p);
}

function hostChip(envelope, p) {
    return p.isHost ? `<span class="chip-host${isOnline(envelope, p.id) ? '' : ' vacant'}">Hôte</span>` : '';
}

/* Écrans. Chaque fonction renvoie { content, dock, waiting? } ; `waiting` marque un bas d'écran d'attente. */

/* §2 Salon (handoff 2026-09-24, lot 4) */
function lobby(envelope, local, ui) {
    const { view, minPlayers } = envelope;
    const isHost = view.me.isHost;
    const rows = orderedPlayers(envelope).map((p) => {
        const isMe = p.id === view.me.id;
        const off = !isOnline(envelope, p.id);
        let trailing = '';
        if (isHost && !p.isHost) {
            trailing = local.kickConfirm === p.id
                ? `<span class="confirm-inline">Retirer ? ${cmdButton('kick', 'Oui', { id: p.id }, 'mini mini-yes')}${uiButton('kick-cancel', 'Non', '', 'mini mini-no')}</span>`
                : `<button type="button" class="icon-btn" data-ui="kick-ask" data-arg="${e(p.id)}" aria-label="Retirer ${e(p.name)}">${svg('cross')}</button>`;
        }
        return `<li class="row">${avatar(ini(view, p.id), `avatar ${off ? 'off' : 'ink'}`)}<div class="row-main"><span class="row-name">${e(p.name)}</span></div>${off ? '<span class="row-status off">Hors ligne</span>' : ''}${isMe ? '<span class="pill-me">Toi</span>' : ''}${hostChip(envelope, p)}${trailing}</li>`;
    }).join('');
    const url = envelope.shareUrl ?? (typeof location !== 'undefined' ? location.origin : '');
    const shown = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const n = view.players.length;
    const enough = n >= minPlayers;
    const name = hostName(view);
    let dock;
    if (can(view, 'startRound')) {
        dock = enough
            ? `${soundNote(ui)}${cmdButton('startRound', 'Lancer la partie')}`
            : `${note(`Il faut au moins ${minPlayers} joueurs.`)}${disabledButton('Lancer la partie')}`;
    } else if (can(view, 'claimHost')) {
        dock = claimDock(view);
    } else {
        dock = waitDock(`${name} lance la partie quand tout le monde est là`);
    }
    return {
        content: `<h1 class="h2">${n} ${n > 1 ? 'joueurs' : 'joueur'} à table</h1>
        <p class="p sub">${enough ? `Assez pour lancer, ${minPlayers} minimum.` : `Encore ${minPlayers - n} pour lancer, ${minPlayers} minimum.`}</p>
        ${envelope.traitorOptional ? `<p class="p sub">${e('Variante : il peut n\'y avoir aucun Traître.')}</p>` : ''}
        <ul class="rows mt-14">${rows}</ul>
        <div class="well share mt-14"><div class="share-text"><p class="share-label">Pour rejoindre, jusqu'au lancement</p><span class="share-url">${e(shown)}</span></div><button type="button" class="btn-copy" data-ui="copy-url" data-arg="${e(url)}">Copier</button></div>`,
        dock
    };
}

/* §3 puis §4 ou §5 : rôles */
function roles(envelope, local) {
    const { view } = envelope;
    const hint = roleHint(view.me.role, Boolean(envelope.traitorOptional));
    if (!view.me.hasSeen) {
        return {
            content: `<p class="p intro">Personne d'autre ne voit ta carte.</p>
            ${card(local, 'Ton rôle', { over: 'Tu es', secret: ROLE_LABELS[view.me.role], secretCls: 'role', text: hint })}
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
    /* 5c : le Maître est présenté. On voit sa carte une fois, le rôle n'est plus rappelé ensuite. */
    const masterName = view.master?.name ?? 'Le Maître';
    return {
        content: `<div class="center wait-master">${view.master ? avatar(ini(view, view.master.id), 'avatar avatar-64 ink') : ''}
        <h1 class="h2 mt-16">${e(masterName)} choisit le mot</h1>
        <p class="lead narrow mt-8">${e(`${masterName} est le Maître du jeu. Pose ton téléphone, écran vers la table.`)}</p></div>`,
        dock: waitDock('Le mot arrive dans un instant'),
        waiting: true
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
        dock = waitDock(`${view.master?.name ?? 'Le Maître'} lance le chrono quand tout le monde a regardé`);
    }
    const waiting = view.me.hasSeen && !can(view, 'startTimer');
    return {
        content: `<p class="p intro">Tout le monde retourne la même carte, en même temps. Rien ne trahit qui lit vraiment.</p>
        ${card(local, 'Le mot', back)}
        <div class="mt-20">${progress(view, (p) => p.hasSeen, (n, total) => `${n} sur ${total} ont regardé`)}</div>`,
        dock,
        waiting
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
        .map((p) => `<button type="button" class="pick" data-cmd="wordFound" data-args='${e(JSON.stringify({ finderId: p.id }))}'>${avatar(ini(view, p.id), 'avatar avatar-40 gold')}<span>${e(p.name)}</span>${svg('arrow')}</button>`)
        .join('');
    return {
        content: `${timerBlock(view, { small: true })}<h1 class="h2 mt-14">Qui a trouvé ?</h1><p class="p">Le chrono continue pendant ton choix.</p><div class="rows mt-14">${rows}</div>`,
        dock: uiButton('cancel-finder', 'Retour au chrono', '', 'btn btn-secondary')
    };
}

/* §7 L'enquête : Citoyens et Traître ont le même écran, sans le mot (ADR D6 révisé). Seul le Maître déclare (ADR D8). */
function playing(envelope, local) {
    const { view } = envelope;
    if (local.finderPicking && can(view, 'wordFound')) {
        return finderScreen(view);
    }
    const isMaster = view.me.role === 'master';
    const masterName = view.master?.name ?? 'Le Maître';
    // Le rôle du Maître est public : lui seul garde le mot à l'écran
    const wordBlock = isMaster
        ? `<div class="mt-20"><div class="dark"><p class="dark-label">Le mot à faire deviner</p><p class="dark-word">${e(view.word ?? '')}</p><p class="dark-note">Visible seulement par toi.</p></div></div>`
        : '';
    let dock;
    if (!can(view, 'wordFound')) {
        dock = waitDock(`${masterName} déclarera le mot trouvé`);
    } else if (isMaster) {
        dock = uiButton('pick-finder', 'Le mot a été trouvé');
    } else {
        dock = `${note(`${masterName} est hors ligne, tu peux déclarer à sa place.`)}${uiButton('pick-finder', 'Le mot a été trouvé')}`;
    }
    return {
        content: `<div class="timer-block center" data-urgent-block>${timerBlock(view)}<p class="eyebrow below">Temps restant</p></div>
        <div class="timer-track"><div class="timer-fill"></div></div>
        ${wordBlock}
        <div class="${isMaster ? 'mt-14' : 'mt-20'}">${RULE_WELL}</div>`,
        dock,
        waiting: !can(view, 'wordFound')
    };
}

/* §9 Discussion */
function discussion(envelope) {
    const { view } = envelope;
    const finder = view.finder?.name ?? '?';
    const isMaster = view.me.role === 'master';
    const wordSub = isMaster && view.word !== null ? `Le mot était <span class="gold">${e(view.word)}</span>` : 'Le mot a été trouvé';
    const masterName = view.master?.name ?? 'Le Maître';
    let dock;
    if (!can(view, 'closeDiscussion')) {
        dock = waitDock(`${masterName} passe au vote quand vous êtes prêts`);
    } else if (isMaster) {
        dock = cmdButton('closeDiscussion', 'Passer au vote');
    } else {
        dock = `${note(`${masterName} est hors ligne, tu peux passer au vote à sa place.`)}${cmdButton('closeDiscussion', 'Passer au vote')}`;
    }
    return {
        content: `<div class="found-banner">${avatar(view.finder ? ini(view, view.finder.id) : '?', 'avatar avatar-44 gold')}<div><p class="title">${e(finder)} a trouvé</p><p class="sub">${wordSub}</p></div></div>
        <div class="well well-lg mt-14"><p class="label">Discussion, temps indicatif</p>${timerBlock(view, { small: true, urgentAble: false })}<p class="p mt-10">Reprenez le fil des questions. Qui savait déjà ? Qui a orienté ? Le Maître passe au vote quand vous êtes prêts.</p></div>`,
        dock,
        waiting: !can(view, 'closeDiscussion')
    };
}

/* §10 Premier vote : le tap sélectionne, « Voter » envoie (point 6) */
function vote1(envelope, local) {
    const { view } = envelope;
    const finder = view.finder?.name ?? '?';
    const selected = local.v1 !== null ? local.v1 : (typeof view.me.ballot === 'boolean' ? view.me.ballot : null);
    const opt = (value, label, cls) => uiButton('select-v1', label, String(value), `opt ${cls}${selected === value ? ' selected' : ''}`, `<span>${e(label)}</span>${svg('check', 20)}`);
    let dock;
    if (selected === null) {
        dock = waitDock('Choisis une réponse');
    } else if (view.me.hasVoted && selected === view.me.ballot) {
        dock = registeredButton();
    } else {
        dock = uiButton('confirm-v1', 'Voter');
    }
    return {
        content: `<h1 class="h2">${e(`${finder}, Traître ?`)}</h1>
        <p class="p narrow">Majorité stricte. Si elle est atteinte, la manche s'arrête immédiatement.</p>
        <div class="vote1">${opt(true, 'Oui, Traître', 'opt-yes')}${opt(false, 'Non', 'opt-no')}</div>
        <div class="mt-20">${progress(view, (p) => p.hasVoted, (n, total) => `${n} sur ${total} ont voté`)}</div>
        <p class="p small">${e('Ton vote reste modifiable jusqu\'au dernier votant.')}</p>`,
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
        : `${avatar(ini(view, c.id), 'avatar avatar-40')}<span>${e(c.name)}</span>${score !== null ? `<span class="score">${score}</span>` : ''}${svg('check', 20)}`;
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
        dock = waitDock('Choisis un joueur');
    } else if (confirmed) {
        dock = registeredButton();
    } else {
        dock = uiButton('confirm-vote', 'Voter');
    }
    return {
        content: `<h1 class="h2">Qui est le Traître ?</h1>
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
    let dock;
    if (!decides) {
        dock = waitDock(`${finder} départage entre les ex aequo`);
    } else {
        dock = chosen === null ? waitDock('Choisis un joueur') : uiButton('confirm-vote', 'Départager');
    }
    return {
        content: `<h1 class="h2">Égalité</h1>
        <p class="p">${decides ? 'À toi de départager : le plus pointé révèle son rôle.' : `${e(finder)} départage entre les ex aequo.`}</p>
        <div class="rows mt-14">${rows}</div>`,
        dock,
        waiting: !decides
    };
}

/* §12 Résultat : ce qui a décidé la manche, le Traître et le mot, tous les rôles (point 4) */
function ended(envelope) {
    const { view } = envelope;
    const r = view.result;
    const who = r?.insiderId
        ? `<div class="reveal-who">${avatar(ini(view, r.insiderId), 'avatar avatar-52 gold')}<div><p class="dark-label">Le Traître était</p><p class="reveal-name">${e(playerName(view, r.insiderId))}</p></div></div>`
        : '<div class="reveal-who"><div><p class="dark-label">Le Traître</p><p class="reveal-name">Il n\'y avait pas de Traître</p></div></div>';
    const reveal = `<div class="reveal">${who}<div class="reveal-word"><p class="dark-label">Le mot</p><p class="reveal-word-value">${e(view.word ?? '?')}</p></div></div>`;
    const tallies = view.tallies && (r?.reason === 'vote2' || r?.reason === 'tiebreak') ? Object.entries(view.tallies) : [];
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
    ].filter(Boolean).join('');
    return {
        content: `<h1 class="h-xl">${e(r ? outcomeTitle(r) : 'Fin de partie')}</h1>
        ${r ? `<p class="p story">${e(outcomeStory(view, view.finder?.id ?? null))}</p>` : ''}
        <div class="mt-16">${reveal}</div>
        ${r ? rolesList(view, r) : ''}
        ${bars}`,
        dock: dock || waitDock(`${hostName(view)} relance quand vous êtes prêts`),
        waiting: dock === ''
    };
}

/** Tous les rôles, les Citoyens sans histoire regroupés sur une ligne, la carte du centre en variante. */
function rolesList(view, r) {
    const roles = r.roles ?? {};
    const finderId = view.finder?.id ?? null;
    const line = (left, right) => `<div class="roles-row"><span class="roles-name">${left}</span><span class="roles-role">${right}</span></div>`;
    const rows = [];
    const masterId = view.players.find((p) => roles[p.id] === 'master')?.id;
    if (masterId) {
        rows.push(line(e(playerName(view, masterId)), 'Maître du jeu'));
    }
    const insiderId = view.players.find((p) => roles[p.id] === 'insider')?.id;
    if (insiderId) {
        rows.push(line(e(playerName(view, insiderId)), `<strong>${insiderId === finderId ? 'Traître · a trouvé' : 'Traître'}</strong>`));
    }
    if (finderId && roles[finderId] === 'common') {
        rows.push(line(e(playerName(view, finderId)), 'Citoyen · a trouvé'));
    }
    const commons = view.players.filter((p) => roles[p.id] === 'common' && p.id !== finderId);
    if (commons.length) {
        rows.push(line(e(commons.map((p) => p.name).join(', ')), commons.length > 1 ? 'Citoyens' : 'Citoyen'));
    }
    if (r.centerCard) {
        rows.push(line('<em>Carte du centre</em>', e(ROLE_LABELS[r.centerCard])));
    }
    return `<p class="label roles-title">Les rôles</p><div class="roles-list">${rows.join('')}</div>`;
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

/** Présence (lot 3) : pastilles au salon, texte seul en jeu. Un tap ouvre la feuille « À table ». */
function presence(envelope) {
    const { view } = envelope;
    const total = view.players.length;
    const on = view.players.filter((p) => isOnline(envelope, p.id)).length;
    let dots = '';
    if (view.phase === 'lobby') {
        const ordered = [...view.players].sort((a, b) => (isOnline(envelope, a.id) ? 0 : 1) - (isOnline(envelope, b.id) ? 0 : 1));
        const shown = ordered.length > 5 ? ordered.slice(0, 4) : ordered;
        const more = ordered.length > 5 ? `<span class="presence-more">+${ordered.length - 4}</span>` : '';
        dots = `<span class="presence-dots" aria-hidden="true">${shown.map((p) => avatar(ini(view, p.id), `presence-dot${isOnline(envelope, p.id) ? '' : ' off'}`)).join('')}${more}</span>`;
    }
    return `<button type="button" class="presence" data-ui="presence" aria-label="${on} ${on > 1 ? 'joueurs' : 'joueur'} en ligne sur ${total}, voir la table">${dots}<span class="presence-text">${e(presenceText(envelope))}</span></button>`;
}

function presenceText(envelope) {
    const total = envelope.view.players.length;
    const on = envelope.view.players.filter((p) => isOnline(envelope, p.id)).length;
    return on === total ? `${total} en ligne` : `${on} sur ${total} en ligne`;
}

/** Pastille Son (lot 5), chez l'hôte seulement : le son de la partie sort de son téléphone. */
function soundToggle(view, ui) {
    if (!view.me.isHost) {
        return '';
    }
    const on = !ui.muted;
    return `<button type="button" class="sound-toggle${on ? '' : ' off'}" data-ui="mute" role="switch" aria-checked="${on}" aria-label="Son de la partie">${svg(on ? 'speaker' : 'speaker-off', 14)}${on ? 'Son' : 'Son coupé'}</button>`;
}

/** Feuille montante générique (2b, 3b) : voile, poignée, contenu. */
function sheet(label, inner) {
    return `<div class="scrim" data-ui="sheet-close"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${e(label)}"><span class="sheet-handle" aria-hidden="true"></span>${inner}</div>`;
}

/* 2b Confirmation avant reprise */
function claimSheet(view) {
    return sheet('Reprendre la main', `<p class="sheet-eyebrow">Reprendre la main</p>
        <h2 class="sheet-title">${e('Tu deviens l\'hôte')}</h2>
        <ul class="sheet-list"><li>Tu lances la partie et les manches suivantes.</li><li>Tu peux retirer un joueur de la table.</li><li>${e(`${hostName(view)} reste à table et redevient simple joueur à son retour.`)}</li></ul>
        ${cmdButton('claimHost', 'Oui, je prends la main')}${uiButton('claim-cancel', 'Annuler', '', 'btn btn-secondary')}`);
}

/* 3b À table : rôles publics seulement (Maître, hôte, moi) */
function presenceSheet(envelope) {
    const { view } = envelope;
    const rows = orderedPlayers(envelope).map((p) => {
        const off = !isOnline(envelope, p.id);
        const tags = [
            view.master?.id === p.id ? '<span class="sheet-role">Maître du jeu</span>' : '',
            hostChip(envelope, p),
            p.id === view.me.id ? '<span class="pill-me">Toi</span>' : ''
        ].join('');
        return `<li class="sheet-row">${avatar(ini(view, p.id), `avatar ${off ? 'off' : 'ink'}`)}<div class="row-main"><span class="sheet-name">${e(p.name)}</span>${off ? '<span class="sheet-off">Hors ligne</span>' : ''}</div>${tags}</li>`;
    }).join('');
    return sheet('À table', `<div class="sheet-head"><h2 class="sheet-title">À table</h2><span class="sheet-count">${e(presenceText(envelope))}</span></div>
        <ul class="sheet-rows">${rows}</ul>
        ${uiButton('sheet-close', 'Fermer', '', 'btn btn-secondary')}`);
}

/**
 * @param {{ view: any, online: string[], serverTime: number, minPlayers: number, shareUrl: string|null }} envelope
 * @param {{ flipped: boolean, everFlipped: boolean, v1: boolean|null, v2: string|null, finderPicking: boolean, kickConfirm: string|null, announced?: boolean }} local
 * @param {{ claimSheet: boolean, presenceSheet: boolean, muted: boolean }} [ui] état d'interface qui survit aux phases
 */
export function render(envelope, local, ui = { claimSheet: false, presenceSheet: false, muted: false }) {
    const { view } = envelope;
    const screen = (SCREENS[view.phase] ?? (() => ({ content: '', dock: '' })))(envelope, local, ui);
    const message = topMessage(envelope, local);
    let dock = screen.dock ?? '';
    // Hors salon, la reprise remplace un socle d'attente, jamais l'action propre du joueur ni celle du Maître
    if (view.phase !== 'lobby' && can(view, 'claimHost') && screen.waiting && !masterCarries(envelope)) {
        dock = claimDock(view);
    }
    let overlay = '';
    if (ui.claimSheet && can(view, 'claimHost')) {
        overlay = claimSheet(view);
    } else if (ui.presenceSheet) {
        overlay = presenceSheet(envelope);
    }
    return {
        phase: screen.phase ?? phaseBar(view),
        bar: `${soundToggle(view, ui)}${presence(envelope)}`,
        content: `${message ? `<div class="msg-slot">${message}</div>` : ''}${screen.content}`,
        dock,
        sheet: overlay
    };
}

/** Écran d'accueil (handoff §1). */
export function renderJoin(error = '', name = '') {
    return {
        phase: null,
        content: `<h1 class="h2 join-title">Qui es-tu ?</h1>
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
