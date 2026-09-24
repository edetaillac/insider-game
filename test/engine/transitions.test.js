import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, candidates, SERVER, CENTER, PHASES_BY_COMMAND, ALL_PHASES } from '../../src/engine/game.js';
import { lobby, started, inVote1, inVote2, run, expectFail } from './helpers.js';

const NO_VARIANT = { settings: { traitorOptional: false } };

/** Un contexte par phase, tous à 4 joueurs sans variante. */
function contexts() {
    const byPhase = {};
    byPhase.lobby = lobby(4, NO_VARIANT);
    byPhase.roles = started(4, NO_VARIANT);
    {
        const ctx = started(4, NO_VARIANT);
        byPhase.word = { ...ctx, game: run(ctx.game, ctx.deps, { type: 'setWord', actor: ctx.master, word: 'A' }) };
    }
    {
        const ctx = byPhase.word;
        byPhase.playing = { ...ctx, game: run(ctx.game, ctx.deps, { type: 'startTimer', actor: ctx.host }) };
    }
    {
        const ctx = byPhase.playing;
        ctx.advance(1000);
        byPhase.discussion = { ...ctx, game: run(ctx.game, ctx.deps, { type: 'wordFound', actor: ctx.master, finderId: ctx.commons[0] }) };
    }
    byPhase.vote1 = inVote1(4, NO_VARIANT);
    byPhase.vote2 = inVote2(4, NO_VARIANT);
    {
        const ctx = inVote2(4, NO_VARIANT);
        const [c0, c1] = candidates(ctx.game);
        const game = run(ctx.game, ctx.deps, ...ctx.game.players.map((p, i) => ({ type: 'vote2', actor: p.id, candidate: i < 2 ? c0 : c1 })));
        byPhase.tiebreak = { ...ctx, game };
    }
    {
        const ctx = started(4, { ...NO_VARIANT, settings: { ...NO_VARIANT.settings, timerMs: 10 } });
        let game = run(ctx.game, ctx.deps, { type: 'setWord', actor: ctx.master, word: 'A' }, { type: 'startTimer', actor: ctx.host });
        ctx.advance(10);
        game = run(game, ctx.deps, { type: 'timeout', actor: SERVER });
        byPhase.ended = { ...ctx, game };
    }
    return byPhase;
}

/** Une commande plausible de chaque type pour un contexte donné. */
function sample(type, ctx) {
    const game = ctx.game;
    const master = game.roles ? Object.keys(game.roles).find((id) => game.roles[id] === 'master') : ctx.host;
    const finderId = 'finderId' in game.phase ? game.phase.finderId : 'p2';
    const cands = game.roles ? candidates(game) : [];
    switch (type) {
        case 'addPlayer': return { type, actor: SERVER, id: 'p9', name: 'Neuf' };
        case 'removePlayer': return { type, actor: SERVER, id: 'p4' };
        case 'setHost': return { type, actor: SERVER, id: 'p2' };
        case 'timeout': return { type, actor: SERVER };
        case 'startRound': return { type, actor: ctx.host };
        case 'reset': return { type, actor: ctx.host };
        case 'setWord': return { type, actor: master, word: 'Mot' };
        case 'drawWord': return { type, actor: master };
        case 'startTimer': return { type, actor: master };
        case 'wordFound': return { type, actor: master, finderId: game.players.find((p) => p.id !== master).id };
        case 'closeDiscussion': return { type, actor: master };
        case 'seenRole': return { type, actor: 'p1' };
        case 'seenWord': return { type, actor: 'p1' };
        case 'vote1': return { type, actor: 'p1', value: true };
        case 'vote2': return { type, actor: 'p1', candidate: cands[0] ?? 'p2' };
        case 'tiebreak': return { type, actor: finderId, candidate: 'tied' in game.phase ? game.phase.tied[0] : cands[0] ?? 'p2' };
        default: throw new Error(`no sample for ${type}`);
    }
}

test('la table couvre toutes les commandes et toutes les phases', () => {
    assert.deepEqual(ALL_PHASES, ['lobby', 'roles', 'word', 'playing', 'discussion', 'vote1', 'vote2', 'tiebreak', 'ended']);
    assert.deepEqual(Object.keys(PHASES_BY_COMMAND).sort(), [
        'addPlayer', 'closeDiscussion', 'drawWord', 'removePlayer', 'reset', 'seenRole', 'seenWord', 'setHost', 'setWord',
        'startRound', 'startTimer', 'tiebreak', 'timeout', 'vote1', 'vote2', 'wordFound'
    ]);
});

test('chaque commande hors phase est refusée WRONG_PHASE et l\'état est intact', () => {
    const byPhase = contexts();
    for (const phase of ALL_PHASES) {
        const ctx = byPhase[phase];
        assert.equal(ctx.game.phase.name, phase, `contexte ${phase}`);
        for (const type of Object.keys(PHASES_BY_COMMAND)) {
            if (PHASES_BY_COMMAND[type].includes(phase)) {
                continue;
            }
            const before = structuredClone(ctx.game);
            const r = apply(ctx.game, sample(type, ctx), ctx.deps);
            assert.equal(r.ok, false, `${type} en ${phase} devait échouer`);
            assert.equal(r.error, 'WRONG_PHASE', `${type} en ${phase} : ${r.error}`);
            assert.deepEqual(ctx.game, before, `${type} en ${phase} a muté l'état`);
        }
    }
});

test('chaque commande dans sa phase par le mauvais acteur est refusée FORBIDDEN', () => {
    const byPhase = contexts();
    const wrongActor = { server: 'p1', player: SERVER };
    for (const type of Object.keys(PHASES_BY_COMMAND)) {
        const phase = PHASES_BY_COMMAND[type][0];
        const ctx = byPhase[phase];
        const cmd = sample(type, ctx);
        const actor = cmd.actor === SERVER ? wrongActor.server : wrongActor.player;
        expectFail(ctx.game, ctx.deps, { ...cmd, actor }, 'FORBIDDEN');
    }
});

test('reset depuis chaque phase ramène en lobby avec les mêmes joueurs et sans secret', () => {
    const byPhase = contexts();
    for (const phase of ALL_PHASES) {
        const ctx = byPhase[phase];
        const back = run(ctx.game, ctx.deps, { type: 'reset', actor: ctx.host });
        assert.equal(back.phase.name, 'lobby', `reset depuis ${phase}`);
        assert.deepEqual(back.players, ctx.game.players);
        assert.equal(back.roles, null);
        assert.equal(back.centerCard, null);
        assert.equal(back.word, null);
        assert.equal(back.version, ctx.game.version + 1);
    }
});

test('version augmente de 1 par transition acceptée, jamais sur refus', () => {
    const ctx = lobby(4, NO_VARIANT);
    const v = ctx.game.version;
    const r1 = apply(ctx.game, { type: 'startRound', actor: 'p2' }, ctx.deps);
    assert.equal(r1.ok, false);
    assert.equal(ctx.game.version, v);
    const g1 = run(ctx.game, ctx.deps, { type: 'startRound', actor: 'p1' });
    assert.equal(g1.version, v + 1);
});

test('une transition acceptée ne mute pas l\'état d\'entrée, y compris en profondeur', () => {
    const ctx = inVote2(4, NO_VARIANT);
    const before = structuredClone(ctx.game);
    const r = apply(ctx.game, { type: 'vote2', actor: 'p1', candidate: candidates(ctx.game)[0] }, ctx.deps);
    assert.ok(r.ok);
    assert.deepEqual(ctx.game, before);
    assert.notEqual(r.game.phase, ctx.game.phase);
});

test('center n\'est jamais un joueur', () => {
    const ctx = inVote2(5);
    assert.ok(!ctx.game.players.some((p) => p.id === CENTER));
    assert.ok(candidates(ctx.game).includes(CENTER));
});
