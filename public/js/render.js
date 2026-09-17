// public/js/render.js
// Un écran par phase, dérivé de la vue. Le serveur ne décide jamais quelle div afficher.
// Les boutons portent data-cmd et data-args, les cartes data-flip, les formulaires data-form.

import { escapeHtml as e, formatCountdown, ROLE_LABELS, outcomeSentence } from './dom.js';

/** @param {string} type @param {string} label @param {object} [args] @param {string} [cls] */
function button(type, label, args = {}, cls = 'btn btn-warning') {
    return `<button type="button" class="${cls}" data-cmd="${e(type)}" data-args='${e(JSON.stringify(args))}'>${e(label)}</button>`;
}

/** Bouton avec une icône Font Awesome devant le libellé. */
function iconButton(type, icon, label, args = {}, cls = 'btn btn-warning btn-lg') {
    return `<button type="button" class="${cls}" data-cmd="${e(type)}" data-args='${e(JSON.stringify(args))}'><i class="fas ${e(icon)}" aria-hidden="true"></i> ${e(label)}</button>`;
}

function can(view, type) {
    return view.actions.includes(type);
}

function playerName(view, id) {
    return view.players.find((p) => p.id === id)?.name ?? '?';
}

function card(title, secret, kind) {
    return `<button type="button" class="card-flip ${kind}" data-flip aria-pressed="false">
        <span class="card-face card-front">${e(title)}<small>Touche pour révéler</small></span>
        <span class="card-face card-back"><strong>${e(secret)}</strong><small>Touche pour cacher</small></span>
    </button>`;
}

function roleCard(view) {
    return view.me.role ? card('Ton rôle', ROLE_LABELS[view.me.role], 'role') : '';
}

function wordCard(view) {
    return view.word !== null ? card('Le mot', view.word, 'word') : '';
}

function masterLine(view) {
    if (!view.master) {
        return '';
    }
    const who = view.master.id === view.me.id ? 'Tu es' : `${e(view.master.name)} est`;
    return `<p class="master-line">${who} le <strong>Maître du jeu</strong></p>`;
}

function presenceDot(envelope, id) {
    const online = envelope.online.includes(id);
    return `<i class="fas fa-circle ${online ? 'online' : 'offline'}" data-online="${e(id)}"></i>`;
}

function playersList(envelope, { kick = false } = {}) {
    const { view } = envelope;
    const items = view.players.map((p) => {
        const you = p.id === view.me.id ? ' (toi)' : '';
        const hostTag = p.isHost ? ' <span class="badge badge-dark">hôte</span>' : '';
        const kickBtn = kick && !p.isHost && p.id !== view.me.id
            ? ` <button type="button" class="remove" data-cmd="kick" data-args='${e(JSON.stringify({ id: p.id }))}' aria-label="Retirer ${e(p.name)}"><i class="fas fa-times" aria-hidden="true"></i></button>`
            : '';
        return `<li>${presenceDot(envelope, p.id)} ${e(p.name)}${you}${hostTag}${kickBtn}</li>`;
    });
    return `<ul class="players">${items.join('')}</ul>`;
}

function timerBlock(view, label) {
    if (!view.timer) {
        return '';
    }
    return `<div class="countdown${label ? ' indicative' : ''}"><span id="timer" data-timer="${e(view.timer.deadline)}">--:--</span>${label ? `<small>${e(label)}</small>` : ''}</div>`;
}

function voteProgress(view) {
    const voted = view.players.filter((p) => p.hasVoted).length;
    return `<p class="progress-line">${view.me.hasVoted ? 'Ton vote est pris. ' : ''}${voted} sur ${view.players.length} ont voté</p>`;
}

function waiting(text) {
    return `<p class="waiting">${e(text)}</p>`;
}

function lobby(envelope) {
    const { view } = envelope;
    const enough = view.players.length >= envelope.minPlayers;
    let action = '';
    if (can(view, 'startRound')) {
        action = enough
            ? button('startRound', 'Lancer la partie', {}, 'btn btn-dark cta')
            : `<button type="button" class="btn btn-dark cta" disabled>Lancer la partie</button><small>Il faut au moins ${envelope.minPlayers} joueurs</small>`;
    } else {
        action = waiting('En attente de l\'hôte...');
    }
    return `<h2>Salon</h2>${playersList(envelope, { kick: view.me.isHost })}<div class="actions">${action}</div>`;
}

function roles(envelope) {
    const { view } = envelope;
    let master = '';
    if (can(view, 'setWord')) {
        master = `<form data-form="setWord" autocomplete="off" class="word-form">
            <input type="text" name="word" class="form-control" placeholder="Mot à faire deviner" maxlength="40" />
            <button type="submit" class="btn btn-warning">Valider</button>
        </form>
        <p>ou ${button('drawWord', 'Tirer un mot au hasard', {}, 'btn btn-outline-dark')}</p>`;
    } else {
        master = waiting('Le Maître du jeu choisit le mot...');
    }
    return `${masterLine(view)}${roleCard(view)}${master}`;
}

function word(envelope) {
    const { view } = envelope;
    const secret = view.word !== null ? wordCard(view) : waiting('Le Maître du jeu et le Traître découvrent le mot...');
    const action = can(view, 'startTimer') ? button('startTimer', 'Lancer le chrono', {}, 'btn btn-dark cta') : '';
    return `${masterLine(view)}${roleCard(view)}${secret}<div class="actions">${action}</div>`;
}

function playing(envelope) {
    const { view } = envelope;
    let found = '';
    if (can(view, 'wordFound')) {
        const options = view.players
            .filter((p) => p.id !== view.master?.id)
            .map((p) => button('wordFound', p.name, { finderId: p.id }, 'btn btn-outline-dark btn-block'))
            .join('');
        found = `<details class="found"><summary class="btn btn-warning cta">Mot trouvé par...</summary><div class="choices">${options}</div></details>`;
    }
    return `${timerBlock(view)}${masterLine(view)}${wordCard(view)}${found}`;
}

function discussion(envelope) {
    const { view } = envelope;
    const action = can(view, 'closeDiscussion') ? button('closeDiscussion', 'Passer au vote', {}, 'btn btn-dark cta') : waiting('Discutez... le Maître du jeu passera au vote');
    return `<h2>${e(view.finder?.name ?? '?')} a trouvé le mot</h2>${timerBlock(view, 'temps indicatif')}${wordCard(view)}<div class="actions">${action}</div>`;
}

function vote1(envelope) {
    const { view } = envelope;
    const finder = e(view.finder?.name ?? '?');
    const buttons = can(view, 'vote1')
        ? `<div class="vote-buttons">${iconButton('vote1', 'fa-thumbs-up', 'Oui', { value: true })}${iconButton('vote1', 'fa-thumbs-down', 'Non', { value: false })}</div>`
        : '';
    return `<h2>${finder} a trouvé le mot.<br/>Est-ce le Traître ?</h2>${buttons}${voteProgress(view)}`;
}

function vote2(envelope) {
    const { view } = envelope;
    let buttons = '';
    if (can(view, 'vote2') && view.candidates) {
        const players = view.candidates.filter((c) => c.id !== 'center');
        const center = view.candidates.find((c) => c.id === 'center');
        buttons = `<div class="choices">${players.map((c) => button('vote2', c.name, { candidate: c.id }, 'btn btn-outline-dark btn-block')).join('')}</div>`
            + (center ? `<div class="center-choice">${button('vote2', center.name, { candidate: center.id }, 'btn btn-outline-secondary btn-block')}</div>` : '');
    }
    return `<h2>Qui est le Traître ?</h2>${buttons}${voteProgress(view)}`;
}

function tiebreak(envelope) {
    const { view } = envelope;
    const names = (view.candidates ?? []).map((c) => `${e(c.name)} (${view.tallies?.[c.id] ?? 0})`).join(' et ');
    const action = can(view, 'tiebreak')
        ? `<p>À toi de départager</p><div class="choices">${(view.candidates ?? []).map((c) => button('tiebreak', c.name, { candidate: c.id }, 'btn btn-outline-dark btn-block')).join('')}</div>`
        : waiting(`${view.finder?.name ?? 'Le trouveur'} départage...`);
    return `<h2>Égalité entre ${names}</h2>${action}`;
}

function ended(envelope) {
    const { view } = envelope;
    const r = view.result;
    const insider = r?.insiderId ? `${e(playerName(view, r.insiderId))} était le Traître` : 'Il n\'y avait pas de Traître';
    const tallies = view.tallies
        ? `<ul class="tallies">${Object.entries(view.tallies).map(([id, n]) => `<li>${e(id === 'center' ? 'Pas de Traître' : playerName(view, id))} : ${n}</li>`).join('')}</ul>`
        : '';
    const actions = [
        can(view, 'startRound') ? button('startRound', 'Rejouer', {}, 'btn btn-dark cta') : '',
        can(view, 'reset') ? button('reset', 'Retour au salon', {}, 'btn btn-outline-dark') : ''
    ].filter(Boolean).join(' ');
    return `<h2>${e(r ? outcomeSentence(r) : 'Fin de partie')}</h2><p>${insider}. Le mot était <strong>${e(view.word ?? '?')}</strong>.</p>${tallies}<div class="actions">${actions || waiting('En attente de l\'hôte...')}</div>`;
}

const SCREENS = { lobby, roles, word, playing, discussion, vote1, vote2, tiebreak, ended };

/** @param {string} [error] @param {string} [name] */
export function renderJoin(error, name = '') {
    return `<h2>Qui es-tu ?</h2>
    <form data-form="join" autocomplete="off" class="join-form">
        <input type="text" name="name" class="form-control" placeholder="Ton prénom" maxlength="20" required autofocus value="${e(name)}" />
        <button type="submit" class="btn btn-dark cta">Rejoindre</button>
        ${error ? `<p class="error">${e(error)}</p>` : ''}
    </form>`;
}

/** @param {{ view: any, online: string[], serverTime: number, minPlayers: number }} envelope */
export function render(envelope) {
    const { view } = envelope;
    const screen = SCREENS[view.phase] ?? (() => waiting('...'));
    return `<header class="me">C'est parti <strong>${e(view.me.name)}</strong>${view.me.isHost ? ' <span class="badge badge-dark">hôte</span>' : ''}</header>${screen(envelope)}`;
}

/** Met à jour les pastilles de présence sans re-rendre l'écran. */
export function patchPresence(root, envelope) {
    for (const dot of root.querySelectorAll('[data-online]')) {
        const online = envelope.online.includes(dot.getAttribute('data-online'));
        dot.classList.toggle('online', online);
        dot.classList.toggle('offline', !online);
    }
}

/** Met à jour le chrono. `offset` = serverTime - Date.now() au dernier state. */
export function patchTimer(root, offset) {
    const el = root.querySelector('[data-timer]');
    if (!el) {
        return;
    }
    const remaining = Number(el.getAttribute('data-timer')) - (Date.now() + offset);
    el.textContent = formatCountdown(remaining);
    el.classList.toggle('urgent', remaining < 30_000);
}
