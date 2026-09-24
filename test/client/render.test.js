import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../../public/js/render.js';

const LOCAL = { flipped: false, everFlipped: false, v1: null, v2: null, finderPicking: false, kickConfirm: null };
const UI = { claimSheet: false, presenceSheet: false, muted: false };

const NAMES = { a: 'Alice', b: 'Bob', c: 'Carol', d: 'Dan', e: 'Eve', f: 'Fred' };

/**
 * Enveloppe minimale. Alice (a) est hôte par défaut.
 * @param {{ me?: string, online?: string[], phase?: string, host?: string, ids?: string[], actions?: string[], hostChange?: any, master?: string|null, result?: any, minPlayers?: number, role?: string|null, word?: string|null, finder?: string|null, candidates?: any, tallies?: any, traitorOptional?: boolean, names?: Record<string, string>, ballot?: any, hasVoted?: boolean }} [o]
 */
function envelope(o = {}) {
    const ids = o.ids ?? ['a', 'b', 'c'];
    const host = o.host ?? 'a';
    const names = { ...NAMES, ...(o.names ?? {}) };
    const players = ids.map((id) => ({ id, name: names[id], isHost: id === host, hasVoted: false, hasSeen: true }));
    const me = players.find((p) => p.id === (o.me ?? 'b'));
    const master = o.master ? { id: o.master, name: names[o.master] } : null;
    const finder = o.finder ? { id: o.finder, name: names[o.finder] } : null;
    return {
        view: {
            version: 1, phase: o.phase ?? 'lobby', me: { ...me, role: o.role ?? null, ballot: o.ballot ?? null, hasVoted: o.hasVoted ?? false }, players, word: o.word ?? null, master, finder,
            timer: null, candidates: o.candidates ?? null, tallies: o.tallies ?? null, result: o.result ?? null, hostChange: o.hostChange ?? null, actions: o.actions ?? []
        },
        online: o.online ?? ids,
        serverTime: 0,
        minPlayers: o.minPlayers ?? 2,
        traitorOptional: o.traitorOptional ?? false,
        shareUrl: 'https://insider.m85.fr'
    };
}

const out = (env, ui = UI, local = LOCAL) => render(env, local, ui);

/* Lot 2 · reprise de l'hôte */

test('2a salon, hôte hors ligne : alerte, CTA jaune de reprise, plus de bouton d\'attente, badge Hôte vacant', () => {
    const r = out(envelope({ online: ['b', 'c'], actions: ['claimHost'] }));
    assert.match(r.content, /class="msg-alert"/);
    assert.match(r.content, /L&#39;hôte est parti/);
    assert.match(r.content, /Alice s&#39;est déconnecté/);
    assert.match(r.content, /chip-host vacant/);
    assert.match(r.dock, /btn btn-accent" data-ui="claim-ask"/);
    assert.match(r.dock, /Tu deviendras hôte à la place de Alice/);
    assert.doesNotMatch(r.dock, /En attente/);
    assert.doesNotMatch(r.content, /data-cmd|data-ui="claim/, 'jamais de bouton dans un message');
});

test('2b feuille de confirmation : ouverte par claim-ask, valide par claimHost', () => {
    const r = out(envelope({ online: ['b', 'c'], actions: ['claimHost'] }), { ...UI, claimSheet: true });
    assert.match(r.sheet, /role="dialog"/);
    assert.match(r.sheet, /Tu deviens l&#39;hôte/);
    assert.match(r.sheet, /Alice reste à table et redevient simple joueur à son retour/);
    assert.match(r.sheet, /data-cmd="claimHost"/);
    assert.match(r.sheet, /data-ui="claim-cancel"/);
});

test('2b la feuille ne s\'affiche pas si la reprise n\'est plus possible', () => {
    const r = out(envelope({ online: ['a', 'b', 'c'] }), { ...UI, claimSheet: true });
    assert.equal(r.sheet, '');
});

test('2c nouvel hôte : confirmation jaune, moi en premier, ancien hôte hors ligne en fin de liste', () => {
    const r = out(envelope({ me: 'b', host: 'b', online: ['b', 'c'], hostChange: { from: 'a', to: 'b', at: 1 }, actions: ['startRound', 'reset'] }));
    assert.match(r.content, /class="msg-ok"/);
    assert.match(r.content, /Tu es l&#39;hôte/);
    const order = [...r.content.matchAll(/class="row-name">([^<]+)</g)].map((m) => m[1]);
    assert.deepEqual(order, ['Bob', 'Carol', 'Alice']);
    assert.match(r.dock, /data-cmd="startRound"/);
});

test('2d autres joueurs : info sur le nouvel hôte, attente qui le nomme', () => {
    const r = out(envelope({ me: 'c', host: 'b', online: ['b', 'c'], hostChange: { from: 'a', to: 'b', at: 1 } }));
    assert.match(r.content, /class="msg-info"/);
    assert.match(r.content, /Bob a repris la main\.<\/strong> Alice s&#39;est déconnecté, il reste à table\./);
    assert.match(r.dock, /dock-wait[\s\S]*Bob lance la partie quand tout le monde est là/);
});

test('2e retour de l\'ancien hôte : info dédiée, aucune reprise proposée', () => {
    const r = out(envelope({ me: 'a', host: 'b', online: ['a', 'b', 'c'], hostChange: { from: 'a', to: 'b', at: 1 } }));
    assert.match(r.content, /Bob est hôte depuis ton départ\.<\/strong> Tu restes à table comme joueur\./);
    assert.doesNotMatch(r.dock, /claim/);
});

test('2f résultat, hôte hors ligne : alerte compacte, reprise dans le socle', () => {
    const result = { outcome: 'commonsWin', reason: 'vote2', insiderId: 'c', centerCard: null, tallies: null, pointed: 'c' };
    const r = out(envelope({ phase: 'ended', online: ['b', 'c'], actions: ['claimHost'], result }));
    assert.match(r.content, /class="msg-alert compact"/);
    assert.match(r.content, /Alice s&#39;est déconnecté\. Sans hôte, pas de nouvelle manche\./);
    assert.match(r.dock, /data-ui="claim-ask"/);
});

test('2f le Maître présent garde l\'action : pas de reprise dans le socle au mot', () => {
    const r = out(envelope({ phase: 'word', online: ['b', 'c'], actions: ['claimHost'], master: 'c' }));
    assert.match(r.content, /Le Maître peut lancer le chrono\./);
    assert.doesNotMatch(r.dock, /claim-ask/);
});

test('2f l\'action propre du joueur reste prioritaire sur la reprise (vote)', () => {
    const r = out(envelope({ phase: 'vote1', online: ['b', 'c'], actions: ['claimHost', 'vote1'] }));
    assert.match(r.content, /msg-alert compact/);
    assert.doesNotMatch(r.dock, /claim-ask/);
});

test('hôte en ligne : ni alerte ni reprise', () => {
    const r = out(envelope({ online: ['a', 'b', 'c'] }));
    assert.doesNotMatch(r.content + r.dock, /msg-alert|claim/);
});

test('résultat : l\'attente nomme l\'hôte', () => {
    const result = { outcome: 'commonsWin', reason: 'vote2', insiderId: 'c', centerCard: null, tallies: null, pointed: 'c' };
    const r = out(envelope({ phase: 'ended', result }));
    assert.match(r.dock, /Alice relance quand vous êtes prêts/);
});

/* Lot 3 · coquille et présence */

test('plus de compteur ; présence dans la barre de phase', () => {
    const all = out(envelope({ online: ['a', 'b', 'c'] }));
    assert.equal(all.counter, undefined);
    assert.match(all.bar, /3 en ligne/);
    const some = out(envelope({ online: ['b', 'c'] }));
    assert.match(some.bar, /2 sur 3 en ligne/);
    assert.match(some.bar, /data-ui="presence"/);
    assert.match(some.bar, /aria-label="2 joueurs en ligne sur 3, voir la table"/);
});

test('présence : pastilles au salon, texte seul en jeu, 4 pastilles et +N au-delà de 5', () => {
    assert.match(out(envelope()).bar, /class="presence-dot[" ]/);
    assert.doesNotMatch(out(envelope({ phase: 'vote1' })).bar, /presence-dot/);
    const crowd = out(envelope({ ids: ['a', 'b', 'c', 'd', 'e', 'f'] })).bar;
    assert.equal([...crowd.matchAll(/class="presence-dot[" ]/g)].length, 4);
    assert.match(crowd, /\+2/);
});

test('rang de phase accolé, sans espaces autour du /', () => {
    assert.equal(out(envelope({ phase: 'vote1' })).phase.rank, '5/6');
});

test('feuille À table : rôles publics seulement', () => {
    const r = out(envelope({ phase: 'vote1', master: 'c', online: ['b', 'c'] }), { ...UI, presenceSheet: true });
    assert.match(r.sheet, /À table/);
    assert.match(r.sheet, /2 sur 3 en ligne/);
    assert.match(r.sheet, /Maître du jeu/);
    assert.match(r.sheet, /Hors ligne/);
    assert.doesNotMatch(r.sheet, /Traître|Citoyen/);
});

/* Lot 4 · salon */

test('salon : titre au pluriel et au singulier, sous-titre selon le minimum', () => {
    const many = out(envelope({ minPlayers: 4 }));
    assert.match(many.content, /3 joueurs à table/);
    assert.match(many.content, /Encore 1 pour lancer, 4 minimum\./);
    assert.doesNotMatch(many.content, />Salon</);
    const one = out(envelope({ ids: ['a'], me: 'a', minPlayers: 2 }));
    assert.match(one.content, /1 joueur à table/);
    const enough = out(envelope({ minPlayers: 2 }));
    assert.match(enough.content, /Assez pour lancer, 2 minimum\./);
});

test('salon : plus de "En ligne", pastille Toi, adresse sans https et bouton Copier', () => {
    const r = out(envelope({ online: ['b', 'c'] }));
    assert.doesNotMatch(r.content, /En ligne/);
    assert.match(r.content, /class="pill-me">Toi</);
    assert.match(r.content, />insider\.m85\.fr</);
    assert.match(r.content, /data-ui="copy-url" data-arg="https:\/\/insider\.m85\.fr"/);
});

/* Lot 5 · son */

test('pastille Son chez l\'hôte seulement, état coupé', () => {
    const host = out(envelope({ me: 'a' }));
    assert.match(host.bar, /role="switch" aria-checked="true" aria-label="Son de la partie"/);
    assert.doesNotMatch(out(envelope({ me: 'b' })).bar, /role="switch"/);
    const muted = out(envelope({ me: 'a' }), { ...UI, muted: true });
    assert.match(muted.bar, /aria-checked="false"/);
    assert.match(muted.bar, /Son coupé/);
});

test('salon, hôte : la note annonce le son avec une icône, et suit la coupure', () => {
    const on = out(envelope({ me: 'a', actions: ['startRound', 'reset'] }));
    assert.match(on.dock, /class="dock-note note-sound"><svg[^>]*data-icon="speaker"/);
    assert.match(on.dock, /Tu es hôte : le son de la partie sort de ton téléphone\./);
    const muted = out(envelope({ me: 'a', actions: ['startRound', 'reset'] }), { ...UI, muted: true });
    assert.match(muted.dock, /data-icon="speaker-off"/);
    assert.match(muted.dock, /Tu es hôte : le son est coupé sur ton téléphone\./);
});

test('pastille Son : icône haut-parleur, barrée quand le son est coupé', () => {
    assert.match(out(envelope({ me: 'a' })).bar, /sound-toggle"[^>]*>.*data-icon="speaker"/);
    assert.match(out(envelope({ me: 'a' }), { ...UI, muted: true }).bar, /data-icon="speaker-off"/);
});

/* Repasse UX et gameplay (handoff 2026-09-24-repasse) */

const withoutSecret = (html) => html.replace(/<span class="secret-reveal">[\s\S]*?<\/span><\/span><\/button>/g, '<span class="secret-reveal"></span></span></button>');

test('point 1 : à l\'enquête, Citoyen et Traître ont le même écran au repos', () => {
    const base = { phase: 'playing', master: 'a', ids: ['a', 'b', 'c', 'd'] };
    const traitor = out(envelope({ ...base, me: 'b', role: 'insider', word: 'Château' }));
    const citizen = out(envelope({ ...base, me: 'c', role: 'common' }));
    assert.equal(withoutSecret(traitor.content), withoutSecret(citizen.content));
    assert.equal(traitor.dock, citizen.dock);
    assert.match(traitor.content, /class="secret"[^>]*data-hold/);
    assert.match(traitor.content, /aria-label="Le mot, maintenir pour voir"/);
    assert.match(citizen.content, /Tu ne connais pas le mot/);
    assert.doesNotMatch(traitor.content + citizen.content, /Visible seulement|Personne ne doit le deviner/);
});

test('point 1 : le Maître garde le mot ouvert, sans « Maintiens »', () => {
    const r = out(envelope({ phase: 'playing', master: 'b', me: 'b', role: 'master', word: 'Château', actions: ['wordFound'] }));
    assert.match(r.content, /Le mot à faire deviner/);
    assert.doesNotMatch(r.content, /Maintiens|data-hold/);
});

test('point 2 : attente du mot sans rôle en clair, bloc à maintenir, bas d\'écran d\'attente', () => {
    const r = out(envelope({ phase: 'roles', master: 'a', me: 'b', role: 'insider' }));
    assert.match(r.content, /Alice choisit le mot/);
    assert.match(r.content, /Alice est le Maître du jeu\. Pose ton téléphone, écran vers la table\./);
    assert.doesNotMatch(withoutSecret(r.content), /Traître/);
    assert.match(r.content, /class="secret secret-light"/);
    assert.match(r.dock, /class="dock-wait" role="status"/);
    assert.match(r.dock, /Le mot arrive dans un instant/);
    assert.doesNotMatch(r.dock, /<button|dock-note/);
});

test('point 3 : seul le Maître déclare ; l\'hôte le fait à sa place s\'il est absent', () => {
    const player = out(envelope({ phase: 'playing', master: 'c', me: 'b', role: 'common' }));
    assert.match(player.dock, /Carol déclarera le mot trouvé/);
    const master = out(envelope({ phase: 'playing', master: 'c', me: 'c', role: 'master', word: 'X', actions: ['wordFound'] }));
    assert.match(master.dock, /class="btn btn-primary" data-ui="pick-finder"/);
    const standIn = out(envelope({ phase: 'playing', master: 'c', me: 'a', role: 'common', online: ['a', 'b'], actions: ['wordFound'] }));
    assert.match(standIn.dock, /Carol est hors ligne, tu peux déclarer à sa place\./);
    assert.match(standIn.dock, /data-ui="pick-finder"/);
    const disc = out(envelope({ phase: 'discussion', master: 'c', me: 'b', role: 'common', finder: 'b' }));
    assert.match(disc.dock, /Carol passe au vote quand vous êtes prêts/);
});

test('point 4 : le résultat raconte la manche, rôles regroupés, carte du centre', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const result = { outcome: 'commonsWin', reason: 'vote1', insiderId: 'b', centerCard: 'common', tallies: { b: 4 }, pointed: 'b', roles: { a: 'master', b: 'insider', c: 'common', d: 'common', e: 'common' } };
    const r = out(envelope({ phase: 'ended', ids, me: 'c', finder: 'b', result, tallies: { b: 4 }, word: 'Château', traitorOptional: true }));
    assert.doesNotMatch(r.content, /Fin de la manche|word-line/);
    assert.match(r.content, /Au vote 1, 4 joueurs sur 5 ont accusé Bob\. C&#39;était bien le Traître\./);
    assert.match(r.content, /class="reveal"[\s\S]*Le Traître était[\s\S]*Le mot[\s\S]*Château/);
    assert.match(r.content, /Les rôles/);
    assert.match(r.content, /Alice<\/span><span[^>]*>Maître du jeu/);
    assert.match(r.content, /Traître · a trouvé/);
    assert.match(r.content, /Carol, Dan, Eve<\/span><span[^>]*>Citoyens/);
    assert.match(r.content, /Carte du centre/);
    assert.doesNotMatch(r.content, /Les votes/, 'pas de barres au vote 1');
    const v2 = out(envelope({ phase: 'ended', ids, me: 'c', finder: 'c', result: { ...result, reason: 'vote2', tallies: { b: 3, c: 1, d: 1, e: 0 } }, tallies: { b: 3, c: 1, d: 1, e: 0 } }));
    assert.match(v2.content, /Les votes/);
    assert.match(v2.content, /Citoyen · a trouvé/);
});

test('point 5 : la variante est annoncée au salon', () => {
    assert.match(out(envelope({ traitorOptional: true })).content, /Variante : il peut n&#39;y avoir aucun Traître\./);
    assert.doesNotMatch(out(envelope({ traitorOptional: false })).content, /Variante/);
});

test('point 5 : la carte du Citoyen et du Maître dit qu\'il peut n\'y avoir aucun Traître', () => {
    const r = render(envelope({ phase: 'roles', me: 'b', role: 'common', master: 'a', traitorOptional: true }), { ...LOCAL }, UI);
    assert.match(r.content, /s&#39;il y en a un/);
});

test('point 6 : vote 1, le tap sélectionne sans envoyer, puis Voter', () => {
    const none = out(envelope({ phase: 'vote1', finder: 'c', actions: ['vote1'] }));
    assert.match(none.content, /Carol, Traître \?/);
    assert.match(none.content, /Oui, Traître/);
    assert.match(none.content, /data-ui="select-v1"/);
    assert.match(none.dock, /dock-wait[\s\S]*Choisis une réponse/);
    const picked = render(envelope({ phase: 'vote1', finder: 'c', actions: ['vote1'] }), { ...LOCAL, v1: true }, UI);
    assert.match(picked.dock, /data-ui="confirm-v1">Voter</);
    const sent = render(envelope({ phase: 'vote1', finder: 'c', actions: ['vote1'], ballot: true, hasVoted: true }), { ...LOCAL, v1: true }, UI);
    assert.match(sent.dock, /Vote enregistré/);
    const changed = render(envelope({ phase: 'vote1', finder: 'c', actions: ['vote1'], ballot: true, hasVoted: true }), { ...LOCAL, v1: false }, UI);
    assert.match(changed.dock, />Voter</);
    assert.match(none.content, /Ton vote reste modifiable jusqu&#39;au dernier votant\./);
});

test('point 6 : vote 2, Voter remplace Confirmer mon vote', () => {
    const candidates = [{ id: 'b', name: 'Bob' }, { id: 'c', name: 'Carol' }];
    const none = out(envelope({ phase: 'vote2', finder: 'c', candidates, actions: ['vote2'] }));
    assert.match(none.dock, /dock-wait[\s\S]*Choisis un joueur/);
    const picked = render(envelope({ phase: 'vote2', finder: 'c', candidates, actions: ['vote2'] }), { ...LOCAL, v2: 'b' }, UI);
    assert.match(picked.dock, />Voter</);
    assert.doesNotMatch(picked.dock, /Confirmer mon vote/);
});

test('point 7 : attente au départage, au salon et au résultat, plus de bouton mort', () => {
    const tb = out(envelope({ phase: 'tiebreak', finder: 'c', candidates: [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }], tallies: { a: 1, b: 1 } }));
    assert.match(tb.dock, /Carol départage entre les ex aequo/);
    const lobby = out(envelope());
    assert.match(lobby.dock, /class="dock-wait"[\s\S]*Alice lance la partie quand tout le monde est là/);
    assert.doesNotMatch(lobby.dock, /aria-disabled|dock-note/);
    const result = { outcome: 'commonsWin', reason: 'vote2', insiderId: 'c', centerCard: null, tallies: null, pointed: 'c', roles: { a: 'master', b: 'common', c: 'insider' } };
    assert.match(out(envelope({ phase: 'ended', result })).dock, /Alice relance quand vous êtes prêts/);
});

test('point 8 : initiales distinctes et prénom sous les pastilles de progression', () => {
    const r = out(envelope({ phase: 'word', ids: ['a', 'b', 'c'], names: { a: 'Manu', b: 'Marie', c: 'Léa' }, master: 'c', me: 'b', role: 'common' }));
    assert.match(r.content, />Mn</);
    assert.match(r.content, />Mr</);
    assert.match(r.content, /class="prog-name">Marie</);
});

test('points 9 et 10 : pas de surtitre en double, un seul titre .h2 hors résultat', () => {
    const v1 = out(envelope({ phase: 'vote1', finder: 'c', actions: ['vote1'] }));
    assert.doesNotMatch(v1.content, /Vote 1 sur 2|class="h1"|class="h3"/);
    assert.match(v1.content, /<h1 class="h2">/);
});

test('point 13 : plus de style inline dans render.js, sauf la largeur des barres', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../../public/js/render.js', import.meta.url), 'utf8');
    const inline = src.split('\n').filter((l) => l.includes('style="'));
    assert.equal(inline.length, 1);
    assert.match(inline[0], /tally-fill/);
});
