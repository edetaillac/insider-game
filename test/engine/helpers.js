import assert from 'node:assert/strict';
import { createGame, apply, SERVER } from '../../src/engine/game.js';
import { mulberry32 } from '../../src/engine/rng.js';

/**
 * Dépendances déterministes : rng seedé, horloge pilotée à la main.
 */
export function makeDeps({ seed = 1, start = 1_000_000, words = ['Château', 'Abeille', 'Piano'] } = {}) {
    let t = start;
    return {
        deps: { rng: mulberry32(seed), now: () => t, words },
        advance: (ms) => { t += ms; },
        at: () => t
    };
}

/** Applique des commandes qui doivent toutes réussir, renvoie l'état final. */
export function run(game, deps, ...commands) {
    let current = game;
    for (const command of commands) {
        const r = apply(current, command, deps);
        assert.ok(r.ok, `${command.type} devait réussir, reçu ${r.ok ? '' : `${r.error}: ${r.message}`}`);
        current = r.game;
    }
    return current;
}

/** Applique une commande qui doit échouer avec le code attendu. */
export function expectFail(game, deps, command, error) {
    const r = apply(game, command, deps);
    assert.equal(r.ok, false, `${command.type} devait échouer avec ${error}`);
    assert.equal(r.error, error, `${command.type} : code ${r.error} au lieu de ${error} (${r.message})`);
    return r;
}

/** Un lobby de n joueurs p1..pn, p1 est l'hôte. */
export function lobby(n, { settings = {}, ...depsOpts } = {}) {
    const { deps, advance, at } = makeDeps(depsOpts);
    let game = createGame(settings);
    for (let i = 1; i <= n; i++) {
        game = run(game, deps, { type: 'addPlayer', actor: SERVER, id: `p${i}`, name: `Joueur ${i}`, isHost: i === 1 });
    }
    return { game, deps, advance, at, host: 'p1' };
}

export function roleOf(game, role) {
    return Object.keys(game.roles ?? {}).find((id) => game.roles[id] === role);
}

export function withRole(game, role) {
    return Object.keys(game.roles ?? {}).filter((id) => game.roles[id] === role);
}

/** Manche lancée, en phase roles. `insider` peut être undefined si la carte du centre est le Traître. */
export function started(n, opts) {
    const ctx = lobby(n, opts);
    const game = run(ctx.game, ctx.deps, { type: 'startRound', actor: ctx.host });
    return { ...ctx, game, master: roleOf(game, 'master'), insider: roleOf(game, 'insider'), commons: withRole(game, 'common') };
}

/**
 * Amène en phase vote1 après 60 s de jeu. finder : 'common' (défaut) ou 'insider'.
 * Pour garantir qu'un insider est en jeu, passer settings: { traitorOptional: false }.
 */
export function inVote1(n, { finder = 'common', ...opts } = {}) {
    const ctx = started(n, opts);
    const finderId = finder === 'insider' && ctx.insider ? ctx.insider : ctx.commons[0];
    let game = run(ctx.game, ctx.deps,
        { type: 'setWord', actor: ctx.master, word: 'Château' },
        { type: 'startTimer', actor: ctx.host });
    ctx.advance(60_000);
    game = run(game, ctx.deps,
        { type: 'wordFound', actor: ctx.master, finderId },
        { type: 'closeDiscussion', actor: ctx.master });
    return { ...ctx, game, finderId };
}

/** Amène en phase vote2 : tout le monde vote non au vote 1. */
export function inVote2(n, opts) {
    const ctx = inVote1(n, opts);
    const game = run(ctx.game, ctx.deps, ...ctx.game.players.map((p) => ({ type: 'vote1', actor: p.id, value: false })));
    return { ...ctx, game };
}
