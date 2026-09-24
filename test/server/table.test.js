import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTable } from '../../src/server/table.js';
import { SERVER } from '../../src/engine/game.js';

/** Horloge et timers pilotés à la main. */
function fakeClock(start = 1_000_000) {
    let t = start;
    /** @type {Array<{ at: number, fn: () => void, id: number }>} */
    let timers = [];
    let nextId = 1;
    return {
        now: () => t,
        setTimer: (fn, delay) => { const id = nextId++; timers.push({ at: t + delay, fn, id }); return id; },
        clearTimer: (id) => { timers = timers.filter((x) => x.id !== id); },
        advance(ms) {
            t += ms;
            const due = timers.filter((x) => x.at <= t).sort((a, b) => a.at - b.at);
            timers = timers.filter((x) => x.at > t);
            for (const x of due) x.fn();
        },
        /** Déclenche tous les timers en attente sans avancer `t`, comme un tick en avance sur la deadline. */
        fire() {
            const due = timers.slice();
            timers = [];
            for (const x of due) x.fn();
        },
        pending: () => timers.length
    };
}

function table(settings = {}) {
    const clock = fakeClock();
    const t = createTable({
        settings: { minPlayers: 4, traitorOptional: false, timerMs: 5000, ...settings },
        words: ['Château'],
        now: clock.now,
        random: () => 0.42,
        setTimer: clock.setTimer,
        clearTimer: clock.clearTimer
    });
    const events = [];
    t.onChange((e) => events.push(e));
    return { t, clock, events };
}

function joinAll(t, names) {
    return names.map((name) => {
        const r = t.join(name);
        assert.ok(r.ok, `join ${name}: ${r.ok ? '' : r.message}`);
        return r;
    });
}

test('join crée le joueur, le premier est hôte, le token résout le joueur', () => {
    const { t, events } = table();
    const [a, b] = joinAll(t, ['Alice', 'Bob']);
    assert.notEqual(a.token, b.token);
    assert.equal(t.resolve(a.token), a.playerId);
    assert.equal(t.resolve('nope'), null);
    assert.equal(t.resolve(undefined), null);
    assert.equal(t.game.players[0].isHost, true);
    assert.equal(t.game.players[1].isHost, false);
    assert.equal(events.filter((e) => e.type === 'state').length, 2);
});

test('join refuse un nom vide ou en doublon avec le code du moteur', () => {
    const { t } = table();
    joinAll(t, ['Alice']);
    const empty = t.join('  ');
    assert.equal(empty.ok, false);
    assert.equal(empty.error, 'INVALID_ARGUMENT');
    const dup = t.join('Alice');
    assert.equal(dup.ok, false);
    assert.equal(dup.error, 'DUPLICATE_NAME');
});

test('snapshot porte la vue du joueur, la présence, l\'heure serveur et minPlayers', () => {
    const { t, clock } = table();
    const [a, b] = joinAll(t, ['Alice', 'Bob']);
    t.connect(a.playerId, 's1');
    const snap = t.snapshot(a.playerId);
    assert.equal(snap.view.me.id, a.playerId);
    assert.deepEqual(snap.online, [a.playerId]);
    assert.equal(snap.serverTime, clock.now());
    assert.equal(snap.minPlayers, 4);
    assert.equal(t.snapshot(b.playerId).view.me.id, b.playerId);
});

test('connect et disconnect ne signalent un changement qu\'au premier et au dernier socket', () => {
    const { t, events } = table();
    const [a] = joinAll(t, ['Alice']);
    events.length = 0;
    assert.equal(t.connect(a.playerId, 's1'), true);
    assert.equal(t.connect(a.playerId, 's2'), false);
    assert.equal(t.disconnect(a.playerId, 's1'), false);
    assert.equal(t.disconnect(a.playerId, 's2'), true);
    assert.equal(t.disconnect(a.playerId, 's2'), false);
    assert.equal(events.filter((e) => e.type === 'state').length, 2);
    assert.deepEqual(t.snapshot(a.playerId).online, []);
});

test('dispatch pose l\'acteur depuis le serveur et ignore un actor dans le payload', () => {
    const { t } = table();
    const [a, b] = joinAll(t, ['Alice', 'Bob', 'Carol', 'Dan']);
    const asBob = t.dispatch(b.playerId, { type: 'startRound', actor: a.playerId });
    assert.equal(asBob.ok, false);
    assert.equal(asBob.error, 'FORBIDDEN');
    const asHost = t.dispatch(a.playerId, { type: 'startRound' });
    assert.equal(asHost.ok, true);
    assert.equal(t.game.phase.name, 'roles');
});

test('dispatch valide la forme du payload avant le moteur', () => {
    const { t } = table();
    const [a] = joinAll(t, ['Alice', 'Bob', 'Carol', 'Dan']);
    for (const payload of [null, 42, {}, { type: 'dance' }, { type: 'toString' }, { type: 'addPlayer', id: 'x', name: 'y' }, { type: 'timeout' }]) {
        const r = t.dispatch(a.playerId, /** @type {any} */ (payload));
        assert.equal(r.ok, false, JSON.stringify(payload));
        assert.equal(r.error, 'INVALID_ARGUMENT', JSON.stringify(payload));
    }
    t.dispatch(a.playerId, { type: 'startRound' });
    const master = t.game.players.find((p) => t.game.roles?.[p.id] === 'master');
    const badWord = t.dispatch(master.id, { type: 'setWord', word: 42 });
    assert.equal(badWord.error, 'INVALID_ARGUMENT');
    const extra = t.dispatch(master.id, { type: 'setWord', word: 'Lune', junk: true });
    assert.equal(extra.ok, true);
    assert.equal(t.game.word, 'Lune');
});

test('kick : hôte seulement, jamais lui-même, invalide le token et émet kicked puis state', () => {
    const { t, events } = table();
    const [a, b] = joinAll(t, ['Alice', 'Bob']);
    assert.equal(t.dispatch(b.playerId, { type: 'kick', id: a.playerId }).error, 'FORBIDDEN');
    assert.equal(t.dispatch(a.playerId, { type: 'kick', id: a.playerId }).error, 'FORBIDDEN');
    events.length = 0;
    const r = t.dispatch(a.playerId, { type: 'kick', id: b.playerId });
    assert.equal(r.ok, true);
    assert.deepEqual(events.map((e) => e.type), ['kicked', 'state']);
    assert.equal(events[0].playerId, b.playerId);
    assert.equal(t.resolve(b.token), null);
    assert.equal(t.game.players.length, 1);
    assert.equal(t.dispatch(a.playerId, { type: 'kick', id: 'ghost' }).error, 'UNKNOWN_PLAYER');
});

test('le chrono est armé en playing, annulé en sortie, et applique timeout à l\'échéance', () => {
    const { t, clock } = table();
    const [a] = joinAll(t, ['Alice', 'Bob', 'Carol', 'Dan']);
    t.dispatch(a.playerId, { type: 'startRound' });
    const master = t.game.players.find((p) => t.game.roles?.[p.id] === 'master');
    t.dispatch(master.id, { type: 'setWord', word: 'Lune' });
    assert.equal(clock.pending(), 0);
    t.dispatch(a.playerId, { type: 'startTimer' });
    assert.equal(clock.pending(), 1);
    clock.advance(4999);
    assert.equal(t.game.phase.name, 'playing');
    clock.advance(1);
    assert.equal(t.game.phase.name, 'ended');
    assert.equal(t.game.phase.reason, 'timeout');
    assert.equal(clock.pending(), 0);
});

test('un timer NOT_YET (tick en avance sur la deadline) est réarmé au lieu de laisser la table bloquée', () => {
    const { t, clock } = table();
    const [a] = joinAll(t, ['Alice', 'Bob', 'Carol', 'Dan']);
    t.dispatch(a.playerId, { type: 'startRound' });
    const master = t.game.players.find((p) => t.game.roles?.[p.id] === 'master');
    t.dispatch(master.id, { type: 'setWord', word: 'Lune' });
    t.dispatch(a.playerId, { type: 'startTimer' });
    clock.advance(4999);
    clock.fire();
    assert.equal(t.game.phase.name, 'playing');
    assert.equal(clock.pending(), 1);
    clock.advance(1);
    assert.equal(t.game.phase.name, 'ended');
    assert.equal(t.game.phase.reason, 'timeout');
    assert.equal(clock.pending(), 0);
});

test('une sortie de playing par wordFound annule le chrono', () => {
    const { t, clock } = table();
    const [a] = joinAll(t, ['Alice', 'Bob', 'Carol', 'Dan']);
    t.dispatch(a.playerId, { type: 'startRound' });
    const master = t.game.players.find((p) => t.game.roles?.[p.id] === 'master');
    const common = t.game.players.find((p) => t.game.roles?.[p.id] === 'common');
    t.dispatch(master.id, { type: 'setWord', word: 'Lune' });
    t.dispatch(a.playerId, { type: 'startTimer' });
    clock.advance(1000);
    assert.equal(t.dispatch(master.id, { type: 'wordFound', finderId: common.id }).ok, true);
    assert.equal(clock.pending(), 0);
    clock.advance(10_000);
    assert.equal(t.game.phase.name, 'discussion');
});

test('une commande reçue après la deadline déclenche timeout d\'abord et est refusée', () => {
    const { t, clock } = table();
    const [a] = joinAll(t, ['Alice', 'Bob', 'Carol', 'Dan']);
    t.dispatch(a.playerId, { type: 'startRound' });
    const master = t.game.players.find((p) => t.game.roles?.[p.id] === 'master');
    const common = t.game.players.find((p) => t.game.roles?.[p.id] === 'common');
    t.dispatch(master.id, { type: 'setWord', word: 'Lune' });
    t.dispatch(a.playerId, { type: 'startTimer' });
    // On avance l'horloge sans déclencher le timer (comme si le tick était en retard)
    clock.clearTimer(1);
    clock.advance(5000);
    // Le timer a été retiré plus haut, la phase doit encore être playing.
    assert.equal(t.game.phase.name, 'playing');
    const r = t.dispatch(master.id, { type: 'wordFound', finderId: common.id });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'WRONG_PHASE');
    assert.equal(t.game.phase.name, 'ended');
    assert.equal(t.game.phase.reason, 'timeout');
});

test('close annule le chrono en attente', () => {
    const { t, clock } = table();
    const [a] = joinAll(t, ['Alice', 'Bob', 'Carol', 'Dan']);
    t.dispatch(a.playerId, { type: 'startRound' });
    const master = t.game.players.find((p) => t.game.roles?.[p.id] === 'master');
    t.dispatch(master.id, { type: 'setWord', word: 'Lune' });
    t.dispatch(a.playerId, { type: 'startTimer' });
    t.close();
    assert.equal(clock.pending(), 0);
});

test('les commandes serveur restent accessibles à l\'acteur server', () => {
    const { t } = table();
    joinAll(t, ['Alice']);
    const r = t.dispatch(SERVER, { type: 'addPlayer', id: 'x1', name: 'Xavier', isHost: false });
    assert.equal(r.ok, true);
    assert.equal(t.game.players.length, 2);
});

test('snapshot porte shareUrl, null par défaut', () => {
    const { t } = table();
    const [a] = joinAll(t, ['Alice']);
    assert.equal(t.snapshot(a.playerId).shareUrl, null);
    const clock = fakeClock();
    const withUrl = createTable({ settings: { minPlayers: 2 }, words: ['x'], now: clock.now, random: () => 0.1, setTimer: clock.setTimer, clearTimer: clock.clearTimer, shareUrl: 'http://192.168.1.10:8080' });
    const r = withUrl.join('Zoé');
    assert.ok(r.ok);
    assert.equal(withUrl.snapshot(r.playerId).shareUrl, 'http://192.168.1.10:8080');
});

test('seenRole et seenWord passent la validation client', () => {
    const { t } = table();
    const [a] = joinAll(t, ['Alice', 'Bob', 'Carol', 'Dan']);
    t.dispatch(a.playerId, { type: 'startRound' });
    assert.equal(t.dispatch(a.playerId, { type: 'seenRole', junk: 1 }).ok, true);
    assert.deepEqual(t.game.phase.seen, { [a.playerId]: true });
    assert.equal(t.dispatch(a.playerId, { type: 'seenWord' }).error, 'WRONG_PHASE');
});

test('claimHost : refusé tant que l\'hôte est en ligne, accordé dès qu\'il est hors ligne', () => {
    const { t, events } = table();
    const [a, b, c] = joinAll(t, ['Alice', 'Bob', 'Carol']);
    t.connect(a.playerId, 'sa');
    t.connect(b.playerId, 'sb');
    assert.equal(t.dispatch(b.playerId, { type: 'claimHost' }).error, 'FORBIDDEN');
    t.disconnect(a.playerId, 'sa');
    events.length = 0;
    const r = t.dispatch(b.playerId, { type: 'claimHost' });
    assert.equal(r.ok, true);
    assert.deepEqual(events.map((e) => e.type), ['state']);
    assert.equal(t.game.players.find((p) => p.isHost)?.id, b.playerId);
    assert.equal(t.dispatch(c.playerId, { type: 'claimHost' }).error, 'FORBIDDEN', 'Bob est en ligne, Carol ne peut pas reprendre');
});

test('claimHost : l\'hôte ne se réclame pas lui-même, l\'ancien hôte revient en joueur', () => {
    const { t } = table();
    const [a, b] = joinAll(t, ['Alice', 'Bob']);
    t.connect(b.playerId, 'sb');
    assert.equal(t.dispatch(b.playerId, { type: 'claimHost' }).ok, true);
    assert.equal(t.dispatch(b.playerId, { type: 'claimHost' }).error, 'FORBIDDEN');
    t.connect(a.playerId, 'sa');
    assert.equal(t.game.players.find((p) => p.id === a.playerId)?.isHost, false);
    assert.equal(t.dispatch(a.playerId, { type: 'claimHost' }).error, 'FORBIDDEN');
});

test('claimHost débloque une manche en cours : le nouvel hôte lance le chrono', () => {
    const { t } = table();
    const [a, b] = joinAll(t, ['Alice', 'Bob', 'Carol', 'Dan']);
    t.dispatch(a.playerId, { type: 'startRound' });
    const master = t.game.players.find((p) => t.game.roles?.[p.id] === 'master');
    t.dispatch(master.id, { type: 'setWord', word: 'Lune' });
    const claimer = [a, b].find((x) => x.playerId !== master.id && x.playerId !== a.playerId) ?? b;
    t.connect(claimer.playerId, 's');
    assert.equal(t.dispatch(claimer.playerId, { type: 'claimHost' }).ok, true);
    assert.equal(t.dispatch(claimer.playerId, { type: 'startTimer' }).ok, true);
    assert.equal(t.game.phase.name, 'playing');
});

test('snapshot : claimHost figure dans les actions seulement quand la reprise est possible', () => {
    const { t } = table();
    const [a, b] = joinAll(t, ['Alice', 'Bob']);
    t.connect(a.playerId, 'sa');
    t.connect(b.playerId, 'sb');
    assert.ok(!t.snapshot(b.playerId).view.actions.includes('claimHost'), 'hôte en ligne');
    t.disconnect(a.playerId, 'sa');
    assert.ok(t.snapshot(b.playerId).view.actions.includes('claimHost'), 'hôte hors ligne');
    t.dispatch(b.playerId, { type: 'claimHost' });
    assert.ok(!t.snapshot(b.playerId).view.actions.includes('claimHost'), 'je suis hôte');
    t.connect(a.playerId, 'sa2');
    assert.ok(!t.snapshot(a.playerId).view.actions.includes('claimHost'), 'l\'ancien hôte revenu ne reprend pas');
    assert.deepEqual(t.snapshot(a.playerId).view.hostChange?.to, b.playerId);
});

test('D8 : la table tient masterAway à jour selon la présence du Maître', () => {
    const { t } = table();
    const players = joinAll(t, ['Alice', 'Bob', 'Carol', 'Dan']);
    players.forEach((p, i) => t.connect(p.playerId, `s${i}`));
    t.dispatch(players[0].playerId, { type: 'startRound' });
    const masterIndex = players.findIndex((p) => t.game.roles?.[p.playerId] === 'master');
    const master = players[masterIndex];
    assert.equal(t.game.masterAway, false);
    t.disconnect(master.playerId, `s${masterIndex}`);
    assert.equal(t.game.masterAway, true);
    t.connect(master.playerId, 'back');
    assert.equal(t.game.masterAway, false);
});

test('D8 : un Maître déjà hors ligne au lancement est marqué absent', () => {
    const { t } = table();
    const players = joinAll(t, ['Alice', 'Bob', 'Carol', 'Dan']);
    t.connect(players[0].playerId, 's0');
    t.dispatch(players[0].playerId, { type: 'startRound' });
    const master = t.game.players.find((p) => t.game.roles?.[p.id] === 'master');
    assert.equal(t.game.masterAway, master.id !== players[0].playerId);
});

test('point 5 : le snapshot annonce la variante sans Traître', () => {
    const { t } = table({ traitorOptional: true });
    const [a] = joinAll(t, ['Alice']);
    assert.equal(t.snapshot(a.playerId).traitorOptional, true);
    const other = table({ traitorOptional: false });
    const [b] = joinAll(other.t, ['Bob']);
    assert.equal(other.t.snapshot(b.playerId).traitorOptional, false);
});
