import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../../public/js/render.js';

const LOCAL = { flipped: false, everFlipped: false, v1: null, v2: null, finderPicking: false, kickConfirm: null };
const UI = { claimSheet: false, presenceSheet: false, muted: false };

const NAMES = { a: 'Alice', b: 'Bob', c: 'Carol', d: 'Dan', e: 'Eve', f: 'Fred' };

/**
 * Enveloppe minimale. Alice (a) est hôte par défaut.
 * @param {{ me?: string, online?: string[], phase?: string, host?: string, ids?: string[], actions?: string[], hostChange?: any, master?: string|null, result?: any, minPlayers?: number }} [o]
 */
function envelope(o = {}) {
    const ids = o.ids ?? ['a', 'b', 'c'];
    const host = o.host ?? 'a';
    const players = ids.map((id) => ({ id, name: NAMES[id], isHost: id === host, hasVoted: false, hasSeen: true }));
    const me = players.find((p) => p.id === (o.me ?? 'b'));
    const master = o.master ? { id: o.master, name: NAMES[o.master] } : null;
    return {
        view: {
            version: 1, phase: o.phase ?? 'lobby', me: { ...me, role: null, ballot: null }, players, word: null, master, finder: null,
            timer: null, candidates: null, tallies: null, result: o.result ?? null, hostChange: o.hostChange ?? null, actions: o.actions ?? []
        },
        online: o.online ?? ids,
        serverTime: 0,
        minPlayers: o.minPlayers ?? 2,
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

test('2d autres joueurs : info sur le nouvel hôte, bouton d\'attente nominatif', () => {
    const r = out(envelope({ me: 'c', host: 'b', online: ['b', 'c'], hostChange: { from: 'a', to: 'b', at: 1 } }));
    assert.match(r.content, /class="msg-info"/);
    assert.match(r.content, /Bob a repris la main\.<\/strong> Alice s&#39;est déconnecté, il reste à table\./);
    assert.match(r.dock, /En attente de Bob/);
    assert.match(r.dock, /Bob lance la partie quand tout le monde est là/);
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

test('résultat : le bouton d\'attente nomme l\'hôte', () => {
    const result = { outcome: 'commonsWin', reason: 'vote2', insiderId: 'c', centerCard: null, tallies: null, pointed: 'c' };
    const r = out(envelope({ phase: 'ended', result }));
    assert.match(r.dock, /En attente de Alice/);
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
