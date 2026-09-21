# Refonte mobile, plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter la refonte mobile du handoff Claude Design en haute fidélité, dans le client vanilla existant, avec les trois ajouts serveur (accusés "vu", bulletin propre dans la vue, URL de partage), sans Bootstrap ni Font Awesome, polices auto-hébergées.

**Architecture:** Le moteur gagne deux commandes idempotentes (`seenRole`, `seenWord`) et deux champs de vue (`hasSeen`, `me.ballot`). La coquille devient une colonne flex en quatre régions (bandeau, en-tête, barre de phase, contenu, socle fixe). `render(envelope, local)` reste pur et renvoie les quatre régions. `client.js` tient un état local d'interface (carte retournée, sélections de vote, choix du trouveur, confirmation de retrait) remis à zéro à chaque phase.

**Tech Stack:** Node 22, ESM, socket.io 4, client vanilla ESM sans bundler, CSS maison avec tokens, node:test, tsc --checkJs sur src/.

**Spec:** `docs/specs/2026-09-21-refonte-mobile-design.md` (écarts et contrat) et `docs/design/handoff-2026-09-21/README.md` (référence visuelle, sections numérotées citées ci-dessous comme "handoff §N"). Prototype : `docs/design/handoff-2026-09-21/refonte-mobile.html`.

## Global Constraints

- `src/engine/` ne change que pour ce que la Task 1 décrit. Aucune règle de jeu ne change
- Le serveur n'émet toujours que `snapshot(playerId)`. `me.ballot` est le seul bulletin exposé, jamais celui d'un autre joueur
- Tokens de couleur (handoff "Design tokens") : `--red #DE3C31`, `--ink #14100F`, `--yellow #FFC107`, `--cream #FFF7EF`, `--muted #9A8F86`, `--ink-72 rgba(20,16,15,.72)`, `--ink-60 rgba(20,16,15,.6)`, `--well rgba(0,0,0,.12)`, `--well-strong rgba(0,0,0,.18)`, `--disabled-bg rgba(0,0,0,.2)`, `--disabled-fg rgba(20,16,15,.55)`
- Règle non négociable : jamais de jaune sur le rouge. Le jaune vit sur `--ink`. Sur le rouge on écrit en `--ink` ou `--cream`
- Polices : Oswald 500/600 (titres, chiffres, capitales, CTA), IBM Plex Sans 400 à 700 (corps, noms, champs), servies par `public/css/fonts.css` déjà présent. Aucune requête réseau tierce
- Aucune cible tactile sous 44 px. CTA 60 px, lignes 60 à 64 px, boutons vote 1 76 px, champs 60 px
- Une seule action principale par écran. Un bouton inactif porte toujours son motif (libellé ou note)
- Écart 1 de la spec : pendant l'enquête, le bloc du mot s'affiche pour le Maître seul, jamais pour le Traître
- Glyphes en SVG inline (croix, coche, flèche), pas d'emoji ni d'icône externe
- Style : 4 espaces, simple quotes, point-virgule, pas de caractère "—". Textes utilisateur en français
- Commits : préfixes `feat:`, `fix:`, `test:`, `style:`, `docs:`, terminés par les deux lignes `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` et `Claude-Session: https://claude.ai/code/session_01JfvanwpTr4pB22fAnvL7Gr`
- Après chaque tâche : `npm test`, `npm run typecheck`, `npm run lint` verts. Preuve : sortie brute collée, jamais reconstruite

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `src/engine/types.js`, `game.js`, `view.js` | phases `roles`/`word` avec `seen`, commandes `seenRole`/`seenWord`, `hasSeen`, `me.ballot`, votes modifiables dans `actions` |
| `test/engine/seen.test.js` | nouvelles règles ; `transitions.test.js`, `view.test.js` ajustés |
| `src/server/table.js`, `app.js`, `app.js` (racine) | commandes client acceptées, `shareUrl` dans le snapshot, `PUBLIC_URL` |
| `views/layouts/layout.ejs`, `views/index.ejs` | coquille en quatre régions, sans CDN, viewport-fit |
| `public/css/style.css` | tokens, coquille, composants, écrans, animations |
| `public/js/client.js` | régions, état local d'interface, délégation `data-cmd` et `data-ui`, chrono, autohide |
| `public/js/render.js` | `render(envelope, local)`, `renderJoin`, un écran par phase |
| `public/js/dom.js` | libellés (rôles, phases, issues), `initial()`, `svg()` |
| `test/client/dom.test.js` | helpers purs |

---

### Task 1: Moteur, accusés "vu" et bulletin propre

**Files:**
- Modify: `src/engine/types.js`, `src/engine/game.js`, `src/engine/view.js`
- Create: `test/engine/seen.test.js`
- Modify: `test/engine/transitions.test.js`, `test/engine/view.test.js`

**Interfaces:**
- Produces: phases `{ name: 'roles', seen }` et `{ name: 'word', seen }` ; commandes `seenRole` (roles) et `seenWord` (word), tout joueur, idempotentes ; `allowedActions` garde `vote1`/`vote2` après bulletin et retire `seenRole`/`seenWord` une fois vus ; vue : `me.hasSeen`, `me.ballot`, `players[].hasSeen`

- [ ] **Step 1: Types**

Dans `src/engine/types.js`, remplacer les deux lignes de la typedef Phase
```
 * | { name: 'roles' }
 * | { name: 'word' }
```
par
```
 * | { name: 'roles', seen: Record<PlayerId, true> }
 * | { name: 'word', seen: Record<PlayerId, true> }
```
Dans la typedef Command, ajouter après la ligne `closeDiscussion` :
```
 * | { type: 'seenRole', actor: PlayerId }
 * | { type: 'seenWord', actor: PlayerId }
```
Dans la typedef View, remplacer la ligne `me:` et la ligne `players:` par
```
 *   me: { id: PlayerId, name: string, isHost: boolean, role: Role|null, hasVoted: boolean, hasSeen: boolean, ballot: boolean|CandidateId|null },
 *   players: Array<{ id: PlayerId, name: string, isHost: boolean, hasVoted: boolean, hasSeen: boolean }>,
```

- [ ] **Step 2: Tests (échouent)**

`test/engine/seen.test.js` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedActions } from '../../src/engine/game.js';
import { view } from '../../src/engine/view.js';
import { started, inVote1, inVote2, run, expectFail } from './helpers.js';

const NO_VARIANT = { settings: { traitorOptional: false } };

test('startRound ouvre roles avec seen vide, setWord ouvre word avec seen vide', () => {
    const ctx = started(4, NO_VARIANT);
    assert.deepEqual(ctx.game.phase, { name: 'roles', seen: {} });
    const inWord = run(ctx.game, ctx.deps, { type: 'setWord', actor: ctx.master, word: 'Lune' });
    assert.deepEqual(inWord.phase, { name: 'word', seen: {} });
});

test('seenRole marque le joueur, est idempotent, et disparaît de ses actions', () => {
    const ctx = started(4, NO_VARIANT);
    const a = ctx.game.players[1].id;
    assert.ok(allowedActions(ctx.game, a).includes('seenRole'));
    let game = run(ctx.game, ctx.deps, { type: 'seenRole', actor: a });
    assert.deepEqual(game.phase, { name: 'roles', seen: { [a]: true } });
    game = run(game, ctx.deps, { type: 'seenRole', actor: a });
    assert.deepEqual(game.phase, { name: 'roles', seen: { [a]: true } });
    assert.ok(!allowedActions(game, a).includes('seenRole'));
    assert.ok(allowedActions(game, ctx.game.players[2].id).includes('seenRole'));
});

test('seenWord fonctionne en word et seenRole y est refusé', () => {
    const ctx = started(4, NO_VARIANT);
    const inWord = run(ctx.game, ctx.deps, { type: 'setWord', actor: ctx.master, word: 'Lune' });
    const a = ctx.game.players[0].id;
    expectFail(inWord, ctx.deps, { type: 'seenRole', actor: a }, 'WRONG_PHASE');
    const game = run(inWord, ctx.deps, { type: 'seenWord', actor: a });
    assert.deepEqual(game.phase.seen, { [a]: true });
    expectFail(game, ctx.deps, { type: 'seenWord', actor: 'ghost' }, 'FORBIDDEN');
});

test('la vue expose hasSeen pour soi et pour les autres, faux hors roles et word', () => {
    const ctx = started(4, NO_VARIANT);
    const [a, b] = ctx.game.players.map((p) => p.id);
    const game = run(ctx.game, ctx.deps, { type: 'seenRole', actor: a });
    const va = view(game, a);
    const vb = view(game, b);
    assert.equal(va.me.hasSeen, true);
    assert.equal(vb.me.hasSeen, false);
    assert.equal(vb.players.find((p) => p.id === a).hasSeen, true);
    assert.equal(vb.players.find((p) => p.id === b).hasSeen, false);
    const v1 = inVote1(4, NO_VARIANT);
    assert.equal(view(v1.game, a).me.hasSeen, false);
    assert.ok(view(v1.game, a).players.every((p) => p.hasSeen === false));
});

test('me.ballot expose le bulletin du joueur seul, vote1 puis vote2', () => {
    const ctx = inVote1(4, NO_VARIANT);
    const [a, b] = ctx.game.players.map((p) => p.id);
    assert.equal(view(ctx.game, a).me.ballot, null);
    let game = run(ctx.game, ctx.deps, { type: 'vote1', actor: a, value: true });
    assert.equal(view(game, a).me.ballot, true);
    assert.equal(view(game, b).me.ballot, null);
    assert.ok(view(game, b).players.every((p) => !('ballot' in p)));
    const v2 = inVote2(4, NO_VARIANT);
    const cand = v2.game.players.find((p) => v2.game.roles[p.id] !== 'master').id;
    game = run(v2.game, v2.deps, { type: 'vote2', actor: a, candidate: cand });
    assert.equal(view(game, a).me.ballot, cand);
    assert.equal(view(game, b).me.ballot, null);
});

test('vote1 et vote2 restent dans les actions après un bulletin (vote modifiable)', () => {
    const ctx = inVote1(4, NO_VARIANT);
    const a = ctx.game.players[0].id;
    const game = run(ctx.game, ctx.deps, { type: 'vote1', actor: a, value: false });
    assert.ok(allowedActions(game, a).includes('vote1'));
    const changed = run(game, ctx.deps, { type: 'vote1', actor: a, value: true });
    assert.equal(view(changed, a).me.ballot, true);
});
```

Ajustements des tests existants :

- `test/engine/transitions.test.js` : dans `sample()`, ajouter avant `default:` les cas `case 'seenRole': return { type, actor: 'p1' };` et `case 'seenWord': return { type, actor: 'p1' };`. Dans le test "la table couvre toutes les commandes", la liste triée devient `['addPlayer', 'closeDiscussion', 'drawWord', 'removePlayer', 'reset', 'seenRole', 'seenWord', 'setWord', 'startRound', 'startTimer', 'tiebreak', 'timeout', 'vote1', 'vote2', 'wordFound']`
- `test/engine/view.test.js` : dans "en roles chacun voit son rôle", les actions attendues du Maître deviennent `['drawWord', 'seenRole', 'setWord', ...(ctx.master === ctx.host ? ['reset'] : [])].sort()`. Dans "en vote1 : action vote1 pour qui n'a pas voté", remplacer `assert.ok(!va.actions.includes('vote1'), ...)` par `assert.ok(va.actions.includes('vote1'), 'le vote reste modifiable')`. Si un test compare une vue entière par `deepEqual`, ajouter `hasSeen` et `ballot` aux attentes

- [ ] **Step 3: Vérifier que les tests échouent**

Run: `node --test test/engine/seen.test.js 2>&1 | tail -15`
Expected: échecs (phase roles sans `seen`, commande `seenRole` inconnue).

- [ ] **Step 4: Implémenter**

`src/engine/game.js` :

Dans `PHASES_BY_COMMAND`, ajouter `seenRole: Object.freeze(['roles']),` et `seenWord: Object.freeze(['word']),` (la table est gelée : ajouter les entrées dans le littéral avant le `Object.freeze`).

Dans `canAct`, ajouter au `case 'vote1': case 'vote2':` les cas `case 'seenRole': case 'seenWord':` (même règle : `Boolean(player)`).

Remplacer `allowedActions` par :

```js
/**
 * Commandes qu'un joueur peut émettre maintenant. Jamais les commandes serveur.
 * Un bulletin reste modifiable jusqu'au dernier vote : vote1 et vote2 restent listés.
 * Un accusé "vu" déjà posé disparaît de la liste (la commande reste acceptée, idempotente).
 * @param {Game} game
 * @param {PlayerId} playerId
 * @returns {CommandType[]}
 */
export function allowedActions(game, playerId) {
    const phase = game.phase;
    const hasSeen = 'seen' in phase && Object.hasOwn(phase.seen, playerId);
    return /** @type {CommandType[]} */ (Object.keys(PHASES_BY_COMMAND)).filter((type) =>
        !SERVER_ONLY.has(type)
        && PHASES_BY_COMMAND[type].includes(phase.name)
        && canAct(game, type, playerId)
        && !(hasSeen && (type === 'seenRole' || type === 'seenWord')));
}
```

Dans `startRound`, `phase: { name: 'roles' }` devient `phase: { name: 'roles', seen: {} }`. Dans `setWord` et `drawWord`, `phase: { name: 'word' }` devient `phase: { name: 'word', seen: {} }`.

Ajouter les deux handlers après `closeDiscussion` :

```js
/**
 * @param {Game} game
 * @param {Extract<Command, {type: 'seenRole'}>} command
 * @returns {Result}
 */
function seenRole(game, command) {
    if (game.phase.name !== 'roles') {
        return fail('WRONG_PHASE', 'not in roles');
    }
    return next(game, { phase: { name: 'roles', seen: { ...game.phase.seen, [command.actor]: true } } });
}

/**
 * @param {Game} game
 * @param {Extract<Command, {type: 'seenWord'}>} command
 * @returns {Result}
 */
function seenWord(game, command) {
    if (game.phase.name !== 'word') {
        return fail('WRONG_PHASE', 'not in word');
    }
    return next(game, { phase: { name: 'word', seen: { ...game.phase.seen, [command.actor]: true } } });
}
```

Dans `HANDLERS`, ajouter `seenRole,` et `seenWord,`.

`src/engine/view.js` : après la ligne qui définit `ballots`, ajouter

```js
    const seen = 'seen' in phase ? phase.seen : null;
    /** @param {PlayerId} id */
    const hasSeen = (id) => Boolean(seen && Object.hasOwn(seen, id));
    /** @type {boolean|CandidateId|null} */
    const myBallot = ballots && Object.hasOwn(ballots, playerId) ? ballots[playerId] : null;
```
et dans l'objet renvoyé : `me: { id: me.id, name: me.name, isHost: me.isHost, role: myRole, hasVoted: hasVoted(me.id), hasSeen: hasSeen(me.id), ballot: myBallot },` et `players: game.players.map((p) => ({ id: p.id, name: p.name, isHost: p.isHost, hasVoted: hasVoted(p.id), hasSeen: hasSeen(p.id) })),`.

- [ ] **Step 5: Vérifier, commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: 116 + 6 tests verts, tsc silencieux.

```bash
git add src/engine test/engine
git commit -m "feat(engine): seen acknowledgements in roles and word, own ballot in view, votes stay modifiable

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JfvanwpTr4pB22fAnvL7Gr"
```

---

### Task 2: Serveur, commandes acceptées et URL de partage

**Files:**
- Modify: `src/server/table.js`, `src/server/app.js`, `app.js`, `test/server/table.test.js`, `test/server/helpers.js`

**Interfaces:**
- Produces: `createTable({ ..., shareUrl })`, `snapshot()` renvoie `{ view, online, serverTime, minPlayers, shareUrl }` ; `createApp({ settings, words, now, shareUrl })` ; `PUBLIC_URL` dans l'entrée

- [ ] **Step 1: Tests (échouent)**

Dans `test/server/table.test.js`, ajouter :

```js
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
```

- [ ] **Step 2: Implémenter**

`src/server/table.js` : dans `CLIENT_COMMANDS`, ajouter `seenRole: Object.freeze({}),` et `seenWord: Object.freeze({}),`. Dans la signature de `createTable`, ajouter `shareUrl = null` aux options destructurées et `shareUrl?: string|null` au JSDoc. Dans le typedef `Snapshot`, ajouter `shareUrl: string|null`. Dans `snapshot()`, ajouter `shareUrl` à l'objet renvoyé.

`src/server/app.js` : `createApp({ settings = {}, words, now, shareUrl = null })`, passé à `createTable({ settings, words, now, shareUrl })`. JSDoc mis à jour.

`app.js` (racine) : `const { httpServer } = createApp({ settings, words, shareUrl: env.PUBLIC_URL ?? null });` et la ligne de log mentionne `shareUrl`.

`test/server/helpers.js` : `startServer(settings = {}, { words = [...], now, shareUrl = null } = {})` passe `shareUrl` à `createApp`.

- [ ] **Step 3: Vérifier, commit**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add src/server app.js test/server
git commit -m "feat(server): accept seen acknowledgements, expose shareUrl from PUBLIC_URL

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JfvanwpTr4pB22fAnvL7Gr"
```

---

### Task 3: Coquille, CSS et client (fondation)

**Files:**
- Modify: `views/layouts/layout.ejs`, `views/index.ejs`
- Rewrite: `public/css/style.css`, `public/js/client.js`, `public/js/dom.js`
- Rewrite: `public/js/render.js` (squelette : coquille et écrans provisoires, remplacés en Tasks 4 à 6)
- Modify: `test/client/dom.test.js`

**Interfaces:**
- Produces: `render(envelope, local) -> { phase: {label, rank}|null, content, dock, counter }` ; `renderJoin(error, name)` de même forme ; état local `{ flipped, v1, v2, finderPicking, kickConfirm }` ; délégation `data-cmd`/`data-args` (serveur) et `data-ui`/`data-arg` (local) ; classes CSS listées ci-dessous, utilisées telles quelles par les Tasks 4 à 6

- [ ] **Step 1: Coquille**

`views/layouts/layout.ejs` :

```html
<!DOCTYPE html>
<html lang="fr">
    <head>
        <meta charset="utf-8">
        <title>Insider</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
        <meta name="theme-color" content="#DE3C31">
        <link rel="stylesheet" href="/static/css/fonts.css">
        <link rel="stylesheet" href="/static/css/style.css">
        <link rel="icon" type="image/png" sizes="32x32" href="/static/image/favicon-32x32.png">
        <link rel="icon" type="image/png" sizes="96x96" href="/static/image/favicon-96x96.png">
        <link rel="icon" type="image/png" sizes="16x16" href="/static/image/favicon-16x16.png">
    </head>
    <body>
        <%- body %>
        <script src="/socket.io/socket.io.js"></script>
        <script type="module" src="/static/js/client.js"></script>
    </body>
</html>
```

`views/index.ejs` :

```html
<div id="app" class="app">
    <div id="banner" class="banner" role="status" hidden>Reconnexion...</div>
    <header class="top">
        <img class="top-eye" src="/static/image/frise.jpg" alt="" />
        <img class="top-logo" src="/static/image/title.jpg" alt="Insider" />
        <div id="counter" class="counter" aria-label="Joueurs à table" hidden></div>
    </header>
    <div id="phasebar" class="phasebar" aria-live="polite" hidden>
        <span class="phasebar-label" data-phase-label></span>
        <span class="phasebar-rank" data-phase-rank></span>
    </div>
    <main id="screen" class="content"></main>
    <div id="dock" class="dock"></div>
    <div id="toast" class="toast" role="status" hidden></div>
</div>
```

- [ ] **Step 2: dom.js**

```js
// public/js/dom.js
// Helpers purs du client, testables sous node : aucune référence au DOM ici.

export const ROLE_LABELS = Object.freeze({ master: 'Maître du jeu', insider: 'Traître', common: 'Citoyen' });

export const ROLE_HINTS = Object.freeze({
    master: 'Tu choisis le mot et tu réponds aux questions.',
    insider: 'Tu connais le mot. Fais-le trouver sans te faire repérer.',
    common: 'Trouve le mot, puis démasque le Traître.'
});

/** Libellé et rang de la barre de phase (handoff, "Barre de phase"). */
export const PHASE_BAR = Object.freeze({
    lobby: { label: 'Salon', rank: '' },
    roles: { label: 'Les rôles', rank: '1 / 6' },
    rolesWord: { label: 'Le mot', rank: '2 / 6' },
    word: { label: 'Le mot', rank: '2 / 6' },
    playing: { label: 'Enquête', rank: '3 / 6' },
    discussion: { label: 'Discussion', rank: '4 / 6' },
    vote1: { label: 'Premier vote', rank: '5 / 6' },
    vote2: { label: 'Second vote', rank: '6 / 6' },
    tiebreak: { label: 'Second vote', rank: '6 / 6' },
    ended: { label: 'Résultat', rank: '' }
});

const ERROR_MESSAGES = Object.freeze({
    WRONG_PHASE: 'Cette action n\'est plus possible.',
    FORBIDDEN: 'Tu n\'as pas le droit de faire ça.',
    INVALID_ARGUMENT: 'Demande invalide.',
    TOO_FEW_PLAYERS: 'Pas assez de joueurs.',
    TOO_MANY_PLAYERS: 'La table est pleine.',
    DUPLICATE_NAME: 'Ce prénom est déjà pris.',
    DUPLICATE_ID: 'Ce joueur existe déjà.',
    UNKNOWN_PLAYER: 'Joueur inconnu.',
    NOT_YET: 'Pas encore.'
});

/** @param {unknown} value */
export function escapeHtml(value) {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** @param {number} ms */
export function formatCountdown(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Première lettre d'un prénom, en capitale, pour les pastilles. */
export function initial(name) {
    const trimmed = String(name ?? '').trim();
    return trimmed ? trimmed[0].toLocaleUpperCase('fr') : '?';
}

/** Issue de la manche, en deux lignes maximum (handoff §12). */
export function outcomeTitle(result) {
    switch (result.outcome) {
        case 'commonsWin':
            return 'Les Citoyens gagnent';
        case 'insiderWins':
            return 'Le Traître gagne';
        case 'allWin':
            return 'Tout le monde gagne';
        case 'allLose':
        default:
            return result.reason === 'timeout' ? 'Le temps est écoulé' : 'Tout le monde perd';
    }
}

/** Phrase complète, utilisée par les messages et les tests historiques. */
export function outcomeSentence(result) {
    switch (result.outcome) {
        case 'commonsWin':
            return 'Les Citoyens gagnent !';
        case 'insiderWins':
            return 'Le Traître gagne !';
        case 'allWin':
            return 'Tout le monde gagne, il n\'y avait pas de Traître !';
        case 'allLose':
        default:
            return result.reason === 'timeout' ? 'Le temps est écoulé, tout le monde perd.' : 'Tout le monde perd.';
    }
}

/** @param {{ ok: boolean, error?: string, message?: string }} ack */
export function messageFor(ack) {
    if (ack.error && Object.hasOwn(ERROR_MESSAGES, ack.error)) {
        return ERROR_MESSAGES[ack.error];
    }
    return ack.message || 'Erreur inconnue.';
}

/** Glyphes SVG en ligne, un seul trait, 24x24. */
const ICONS = Object.freeze({
    check: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
    cross: '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
    arrow: '<path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'
});

/** @param {'check'|'cross'|'arrow'} name @param {number} [size] */
export function svg(name, size = 20) {
    return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}
```

Ajouter à `test/client/dom.test.js` :

```js
import { initial, outcomeTitle, svg, PHASE_BAR } from '../../public/js/dom.js';

test('initial prend la première lettre en capitale, ? à défaut', () => {
    assert.equal(initial('  élodie'), 'É');
    assert.equal(initial('Bob'), 'B');
    assert.equal(initial(''), '?');
    assert.equal(initial(null), '?');
});

test('outcomeTitle et PHASE_BAR', () => {
    assert.equal(outcomeTitle({ outcome: 'allLose', reason: 'timeout' }), 'Le temps est écoulé');
    assert.equal(outcomeTitle({ outcome: 'commonsWin', reason: 'vote2' }), 'Les Citoyens gagnent');
    assert.equal(PHASE_BAR.playing.rank, '3 / 6');
    assert.equal(PHASE_BAR.tiebreak.label, 'Second vote');
});

test('svg renvoie un svg inline avec aria-hidden', () => {
    const s = svg('check', 16);
    assert.ok(s.startsWith('<svg'));
    assert.ok(s.includes('aria-hidden="true"'));
    assert.ok(s.includes('width="16"'));
});
```
(Fusionner les imports avec la ligne existante `import { escapeHtml, formatCountdown, outcomeSentence, messageFor } from ...`.)

- [ ] **Step 3: style.css, réécriture complète**

```css
/* Insider, client mobile. Tokens et règles du handoff (docs/design/handoff-2026-09-21). */

:root {
    --red: #DE3C31;
    --ink: #14100F;
    --yellow: #FFC107;
    --cream: #FFF7EF;
    --muted: #9A8F86;
    --ink-72: rgba(20, 16, 15, 0.72);
    --ink-60: rgba(20, 16, 15, 0.6);
    --well: rgba(0, 0, 0, 0.12);
    --well-strong: rgba(0, 0, 0, 0.18);
    --disabled-bg: rgba(0, 0, 0, 0.2);
    --disabled-fg: rgba(20, 16, 15, 0.55);
    --display: 'Oswald', 'Arial Narrow', sans-serif;
    --text: 'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif;
    --dock-h: 120px;
}

* {
    box-sizing: border-box;
}

html, body {
    margin: 0;
    background: var(--red);
    color: var(--ink);
    font-family: var(--text);
    font-size: 16px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -webkit-tap-highlight-color: transparent;
}

button {
    font: inherit;
    color: inherit;
    cursor: pointer;
}

/* Coquille : colonne pleine hauteur, quatre régions */
.app {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
}

.banner {
    flex: none;
    padding: 8px;
    background: var(--ink);
    color: var(--yellow);
    text-align: center;
    font-weight: 700;
}

.top {
    flex: none;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 9px;
    padding: 16px;
}

.top-eye {
    display: block;
    height: 34px;
}

.top-logo {
    display: block;
    height: 20px;
}

.counter {
    position: absolute;
    top: 50%;
    right: 16px;
    transform: translateY(-50%);
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.14);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 14px;
}

.phasebar {
    flex: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 9px 16px;
    background: var(--ink);
}

.phasebar-label {
    font-family: var(--display);
    font-weight: 500;
    font-size: 13px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--yellow);
}

.phasebar-rank {
    font-size: 12px;
    color: var(--muted);
}

.content {
    flex: 1;
    padding: 20px 20px calc(var(--dock-h) + 8px);
    text-align: left;
}

.screen {
    animation: rise 0.25s ease both;
}

.dock {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 20px calc(26px + env(safe-area-inset-bottom, 0px));
    background: linear-gradient(to top, #DE3C31 62%, rgba(222, 60, 49, 0));
    z-index: 5;
}

.dock:empty {
    display: none;
}

.dock-note {
    margin: 0;
    text-align: center;
    font-size: 13px;
    color: var(--ink-72);
}

.toast {
    position: fixed;
    left: 50%;
    bottom: calc(var(--dock-h) + 12px);
    transform: translateX(-50%);
    max-width: calc(100vw - 40px);
    padding: 12px 18px;
    border-radius: 10px;
    background: var(--ink);
    color: var(--cream);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
    z-index: 6;
}

/* Typographie */
.h-xl, .h1, .h2, .h3 {
    margin: 0;
    font-family: var(--display);
    font-weight: 600;
    text-transform: uppercase;
    color: var(--ink);
}

.h-xl { font-size: 42px; line-height: 1; }
.h1 { font-size: 34px; line-height: 1.05; }
.h2 { font-size: 32px; line-height: 1.05; }
.h3 { font-size: 28px; line-height: 1.05; }

.eyebrow {
    margin: 0 0 6px;
    font-family: var(--display);
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-60);
}

.label {
    margin: 0 0 8px;
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-60);
}

.lead {
    margin: 8px 0 0;
    font-size: 16px;
    line-height: 1.5;
    color: var(--ink-72);
    max-width: 30ch;
}

.p {
    margin: 8px 0 0;
    font-size: 15px;
    line-height: 1.55;
    color: var(--ink-72);
}

.p.narrow { max-width: 32ch; }
.center { text-align: center; }
.center .lead, .center .p { margin-left: auto; margin-right: auto; }
.stack > * + * { margin-top: 18px; }
.stack-sm > * + * { margin-top: 8px; }
.mt-14 { margin-top: 14px; }
.mt-20 { margin-top: 20px; }

/* Encadrés */
.well {
    padding: 14px 16px;
    border-radius: 14px;
    background: var(--well);
    font-size: 13px;
    line-height: 1.5;
}

.well-lg {
    padding: 16px 18px;
    border-radius: 16px;
    font-size: 15px;
}

.well p { margin: 0; }
.well strong { font-weight: 700; }

.share-url {
    display: block;
    margin-top: 6px;
    font-weight: 700;
    font-size: 15px;
    word-break: break-all;
    color: var(--ink);
}

/* Pastilles et avatars */
.avatar {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    font-family: var(--display);
    font-weight: 600;
    font-size: 15px;
    background: var(--well-strong);
    color: rgba(20, 16, 15, 0.45);
}

.avatar.on { background: var(--ink); color: var(--yellow); }
.avatar.ink { background: var(--ink); color: var(--yellow); }
.avatar.gold { background: var(--yellow); color: var(--ink); }
.avatar-40 { width: 40px; height: 40px; font-size: 17px; }
.avatar-44 { width: 44px; height: 44px; font-size: 18px; }
.avatar-52 { width: 52px; height: 52px; font-size: 22px; }

.avatars {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
}

.progress .label { margin-bottom: 0; }

.pill {
    display: inline-flex;
    padding: 7px 12px;
    border-radius: 999px;
    background: var(--ink);
    color: var(--yellow);
    font-family: var(--display);
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
}

.chip-host {
    flex: none;
    padding: 3px 7px;
    border: 1.5px solid rgba(20, 16, 15, 0.5);
    border-radius: 6px;
    font-family: var(--display);
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
}

/* Lignes de liste */
.rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
}

.row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 60px;
    padding: 0 12px 0 10px;
    border-radius: 14px;
    background: var(--well);
}

.row-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.row-name {
    font-weight: 600;
    font-size: 18px;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.row-status {
    font-weight: 600;
    font-size: 12px;
    color: rgba(20, 16, 15, 0.65);
}

.row-status.off { color: rgba(20, 16, 15, 0.5); }

.icon-btn {
    flex: none;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: rgba(20, 16, 15, 0.5);
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.confirm-inline {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
}

.confirm-inline .mini {
    min-height: 44px;
    padding: 0 12px;
    border-radius: 10px;
    border: 0;
    font-weight: 700;
    font-size: 13px;
}

.mini-yes { background: var(--ink); color: var(--cream); }
.mini-no { background: transparent; color: var(--ink); text-decoration: underline; }

/* Boutons */
.btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    min-height: 60px;
    padding: 0 20px;
    border: 0;
    border-radius: 16px;
    font-family: var(--display);
    font-weight: 600;
    font-size: 19px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-decoration: none;
}

.btn-primary {
    background: var(--ink);
    color: var(--cream);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2);
}

.btn-accent {
    background: var(--yellow);
    color: var(--ink);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2);
}

.btn-registered {
    background: var(--ink);
    color: var(--yellow);
}

.btn-disabled,
.btn[aria-disabled="true"] {
    background: var(--disabled-bg);
    color: var(--disabled-fg);
    box-shadow: none;
    pointer-events: none;
}

.btn-secondary {
    min-height: 50px;
    background: transparent;
    color: rgba(20, 16, 15, 0.8);
    box-shadow: none;
}

.btn-outline {
    min-height: 56px;
    border: 2px solid var(--ink);
    border-radius: 14px;
    background: transparent;
    color: var(--ink);
    font-family: var(--text);
    font-weight: 600;
    font-size: 17px;
    letter-spacing: 0;
    text-transform: none;
}

/* Champs */
.field-label {
    display: block;
    margin: 18px 0 8px;
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-60);
}

.field {
    display: block;
    width: 100%;
    min-height: 60px;
    padding: 0 18px;
    border: 0;
    border-radius: 14px;
    background: var(--cream);
    color: var(--ink);
    font-family: var(--text);
    font-weight: 600;
    font-size: 20px;
}

.field::placeholder {
    color: rgba(20, 16, 15, 0.4);
    font-weight: 500;
}

.field:focus-visible {
    outline: 3px solid var(--ink);
    outline-offset: 2px;
}

.field-error {
    min-height: 22px;
    margin: 8px 0 0;
    font-weight: 600;
    font-size: 13px;
}

.or {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 18px 0;
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(20, 16, 15, 0.7);
}

.or::before, .or::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(20, 16, 15, 0.22);
}

/* Cartes à retourner */
.card {
    position: relative;
    display: block;
    width: 100%;
    height: 250px;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 22px;
    background: transparent;
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.32);
    perspective: 1000px;
}

.card-face {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 24px;
    border-radius: 22px;
    overflow: hidden;
    backface-visibility: hidden;
    transition: transform 0.55s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.card-front { background: var(--ink); }
.card-back { background: var(--yellow); transform: rotateY(180deg); }
.card[data-flipped] .card-front { transform: rotateY(180deg); }
.card[data-flipped] .card-back { transform: rotateY(0deg); }

.card-eye {
    width: 56px;
    height: 56px;
    border: 3px solid var(--yellow);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.card-eye::after {
    content: '';
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--yellow);
}

.card-title {
    font-family: var(--display);
    font-weight: 600;
    font-size: 24px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--cream);
}

.card-hint { font-size: 14px; color: var(--muted); }

.card-over {
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(20, 16, 15, 0.6);
}

.card-secret {
    min-height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-family: var(--display);
    font-weight: 600;
    text-transform: uppercase;
    line-height: 1;
    color: var(--ink);
}

.card-secret.role { font-size: 42px; }
.card-secret.word { font-size: 46px; }
.card-secret.neutral { font-size: 22px; }

.card-text {
    max-width: 32ch;
    text-align: center;
    font-size: 14px;
    line-height: 1.45;
    color: rgba(20, 16, 15, 0.75);
}

.timebar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 5px;
    background: var(--ink);
    transform-origin: left;
    transform: scaleX(1);
}

.card[data-flipped] .timebar { animation: shrink 5s linear both; }

/* Rappel du rôle (attente) */
.role-recall {
    max-width: 300px;
    text-align: left;
}

.role-recall .name {
    margin: 2px 0 6px;
    font-family: var(--display);
    font-weight: 600;
    font-size: 26px;
    text-transform: uppercase;
    line-height: 1;
}

/* Chrono */
.timer {
    margin: 0;
    text-align: center;
    font-family: var(--display);
    font-weight: 600;
    font-size: 88px;
    line-height: 0.9;
    letter-spacing: -0.01em;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
}

.timer.urgent { animation: pulse 1s ease-in-out infinite; }
.timer-sm { font-size: 52px; line-height: 1; text-align: left; }

.timer-track {
    height: 6px;
    margin: 14px 0 0;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.16);
    overflow: hidden;
}

.timer-fill {
    height: 100%;
    width: 100%;
    border-radius: 3px;
    background: var(--ink);
    transform-origin: left;
}

/* Blocs sombres */
.dark {
    padding: 16px 18px;
    border-radius: 16px;
    background: var(--ink);
    color: var(--cream);
}

.dark-label {
    margin: 0;
    font-family: var(--display);
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
}

.dark-word {
    margin: 4px 0 6px;
    font-family: var(--display);
    font-weight: 600;
    font-size: 34px;
    line-height: 1;
    text-transform: uppercase;
    color: var(--yellow);
}

.dark-note { margin: 0; font-size: 13px; color: var(--muted); }
.dark .gold { color: var(--yellow); font-weight: 600; }

.found-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px;
    border-radius: 16px;
    background: var(--ink);
    color: var(--cream);
}

.found-banner .title {
    margin: 0;
    font-family: var(--display);
    font-weight: 600;
    font-size: 22px;
    line-height: 1;
    text-transform: uppercase;
}

.found-banner .sub { margin: 4px 0 0; font-size: 13px; color: var(--muted); }

/* Attente animée */
.dots {
    display: flex;
    justify-content: center;
    gap: 6px;
    margin-bottom: 14px;
}

.dots i {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: var(--ink);
    animation: breathe 1.4s ease-in-out infinite;
}

.dots i:nth-child(2) { animation-delay: 0.2s; }
.dots i:nth-child(3) { animation-delay: 0.4s; }

/* Choix du trouveur */
.pick {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 64px;
    padding: 0 14px;
    border: 0;
    border-radius: 14px;
    background: var(--ink);
    color: var(--cream);
    font-weight: 600;
    font-size: 19px;
    text-align: left;
}

.pick .icon { margin-left: auto; color: var(--muted); }

/* Vote 1 */
.vote1 {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 18px;
}

.opt {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    min-height: 76px;
    padding: 0 20px;
    border: 0;
    border-radius: 16px;
    font-family: var(--display);
    font-weight: 600;
    font-size: 26px;
    text-transform: uppercase;
}

.opt-yes { background: var(--yellow); color: var(--ink); }
.opt-no { background: rgba(0, 0, 0, 0.14); color: var(--ink); }
.opt.selected { background: var(--ink); color: var(--yellow); }
.opt .icon { visibility: hidden; }
.opt.selected .icon { visibility: visible; }

/* Vote 2 et égalité */
.cand {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 64px;
    padding: 0 14px;
    border: 2px solid transparent;
    border-radius: 14px;
    background: var(--well);
    color: var(--ink);
    font-weight: 600;
    font-size: 19px;
    text-align: left;
}

.cand .avatar { background: var(--well-strong); color: rgba(20, 16, 15, 0.6); }
.cand .score { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--ink-72); }
.cand .icon { margin-left: auto; visibility: hidden; }
.cand .score + .icon { margin-left: 8px; }
.cand.selected { background: var(--ink); color: var(--cream); border-color: var(--ink); }
.cand.selected .avatar { background: var(--yellow); color: var(--ink); }
.cand.selected .score { color: var(--muted); }
.cand.selected .icon { visibility: visible; }

.cand-center {
    justify-content: center;
    min-height: 60px;
    margin-top: 14px;
    border: 2px dashed rgba(20, 16, 15, 0.35);
    background: transparent;
    color: rgba(20, 16, 15, 0.75);
    font-size: 17px;
}

.cand-center.selected { border-style: solid; }

/* Résultat */
.reveal {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px;
    border-radius: 18px;
    background: var(--ink);
    color: var(--cream);
}

.reveal-name {
    margin: 2px 0 0;
    font-family: var(--display);
    font-weight: 600;
    font-size: 28px;
    line-height: 1;
    text-transform: uppercase;
}

.word-line {
    display: flex;
    align-items: baseline;
    gap: 10px;
}

.word-line .label { margin: 0; }

.word-value {
    font-family: var(--display);
    font-weight: 600;
    font-size: 26px;
    text-transform: uppercase;
}

.tally { margin-top: 10px; }
.tally + .tally { margin-top: 12px; }

.tally-row {
    display: flex;
    justify-content: space-between;
    font-weight: 600;
    font-size: 16px;
    font-variant-numeric: tabular-nums;
}

.tally-track {
    height: 10px;
    margin-top: 6px;
    border-radius: 5px;
    background: rgba(0, 0, 0, 0.14);
    overflow: hidden;
}

.tally-fill {
    height: 100%;
    border-radius: 5px;
    background: rgba(20, 16, 15, 0.4);
}

.tally-fill.top { background: var(--ink); }

/* Animations */
@keyframes shrink {
    from { transform: scaleX(1); }
    to { transform: scaleX(0); }
}

@keyframes breathe {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
}

@keyframes rise {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: none; }
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.55; }
}

@media (hover: hover) {
    .icon-btn:hover { background: rgba(0, 0, 0, 0.12); }
    .pick:hover { background: #2A2320; }
    .btn-primary:hover { background: #2A2320; }
}

@media (prefers-reduced-motion: reduce) {
    .screen { animation: none; }
    .dots i { animation: none; }
    .timer.urgent { animation: none; }
    .card-face { transition: none; }
}
```

- [ ] **Step 4: client.js, réécriture complète**

```js
// public/js/client.js
// Point d'entrée du navigateur : connexion, état courant, état local d'interface, rendu en quatre régions.

import { render, renderJoin } from './render.js';
import { unlock, playFor } from './audio.js';
import { messageFor, formatCountdown } from './dom.js';

const TOKEN_KEY = 'insider.token';
// Durée d'affichage d'une carte qui se recache seule, alignée sur l'animation CSS `shrink 5s`
const AUTOHIDE_MS = 5000;

const app = document.getElementById('app');
const screen = document.getElementById('screen');
const dock = document.getElementById('dock');
const banner = document.getElementById('banner');
const toast = document.getElementById('toast');
const counter = document.getElementById('counter');
const phasebar = document.getElementById('phasebar');
const phaseLabel = phasebar.querySelector('[data-phase-label]');
const phaseRank = phasebar.querySelector('[data-phase-rank]');

/** @type {{ view: any, online: string[], serverTime: number, minPlayers: number, shareUrl: string|null } | null} */
let current = null;
let offset = 0;
/** @type {ReturnType<typeof setInterval> | null} */
let ticker = null;
let toastTimer = null;
let autohideTimer = null;
let joinError = '';

/** État local d'interface, remis à zéro à chaque changement de phase. */
function freshLocal(view) {
    return {
        phase: view ? view.phase : null,
        flipped: false,
        v1: view && view.phase === 'vote1' && typeof view.me.ballot === 'boolean' ? view.me.ballot : null,
        v2: view && (view.phase === 'vote2' || view.phase === 'tiebreak') && typeof view.me.ballot === 'string' ? view.me.ballot : null,
        finderPicking: false,
        kickConfirm: null
    };
}

let local = freshLocal(null);

function readToken() {
    try {
        return localStorage.getItem(TOKEN_KEY) ?? undefined;
    } catch {
        return undefined;
    }
}

function saveToken(token) {
    try {
        localStorage.setItem(TOKEN_KEY, token);
    } catch {
        // stockage refusé : la partie tient tant que l'onglet reste ouvert
    }
}

function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
}

function stopTicker() {
    if (ticker !== null) {
        clearInterval(ticker);
        ticker = null;
    }
}

/** Écrit le chrono et la barre de progression depuis la deadline, sans re-rendre. */
function patchTimer() {
    const el = screen.querySelector('[data-timer]');
    if (!el || !current || !current.view.timer) {
        return;
    }
    const { startedAt, deadline } = current.view.timer;
    const now = Date.now() + offset;
    const remaining = deadline - now;
    el.textContent = formatCountdown(remaining);
    if (el.hasAttribute('data-urgent-able')) {
        el.classList.toggle('urgent', remaining < 30_000);
    }
    const fill = screen.querySelector('.timer-fill');
    if (fill) {
        const fraction = Math.max(0, Math.min(1, remaining / (deadline - startedAt)));
        fill.style.transform = `scaleX(${fraction})`;
    }
}

function startTicker() {
    if (ticker === null) {
        ticker = setInterval(patchTimer, 250);
    }
    patchTimer();
}

/** Applique les quatre régions d'un rendu. */
function paint(parts) {
    screen.innerHTML = `<div class="screen">${parts.content}</div>`;
    dock.innerHTML = parts.dock;
    if (parts.phase) {
        phaseLabel.textContent = parts.phase.label;
        phaseRank.textContent = parts.phase.rank;
        phasebar.hidden = false;
    } else {
        phasebar.hidden = true;
    }
    if (parts.counter) {
        counter.textContent = parts.counter;
        counter.hidden = false;
    } else {
        counter.hidden = true;
    }
    app.style.setProperty('--dock-h', `${dock.offsetHeight}px`);
}

function repaint() {
    if (current) {
        paint(render(current, local));
        if (current.view.timer) {
            startTicker();
        } else {
            stopTicker();
        }
    }
}

function showJoin(error) {
    current = null;
    local = freshLocal(null);
    stopTicker();
    joinError = error ?? '';
    const typedName = screen.querySelector('input[name="name"]')?.value ?? '';
    paint(renderJoin(joinError, typedName));
    screen.querySelector('input[name="name"]')?.focus();
}

const socket = io({ auth: (cb) => cb({ token: readToken() }) });

socket.on('needJoin', () => {
    if (screen.querySelector('form[data-form="join"]')) {
        return;
    }
    showJoin();
});

socket.on('joinFailed', ({ error, message }) => {
    const text = error === 'WRONG_PHASE'
        ? 'Partie en cours, attends la fin de la manche.'
        : messageFor({ ok: false, error, message });
    showJoin(text);
});

socket.on('joined', ({ token }) => saveToken(token));

socket.on('state', (envelope) => {
    offset = envelope.serverTime - Date.now();
    const previous = current;
    current = envelope;
    if (previous === null || previous.view.phase !== envelope.view.phase) {
        clearTimeout(autohideTimer);
        local = freshLocal(envelope.view);
    }
    const versionChanged = previous === null || previous.view.version !== envelope.view.version;
    const typing = document.activeElement && document.activeElement.tagName === 'INPUT' && screen.contains(document.activeElement);
    if (versionChanged || !typing) {
        repaint();
    }
    if (versionChanged) {
        playFor(previous?.view.phase, envelope.view.phase, envelope.view.result?.reason);
    }
    banner.hidden = true;
});

socket.on('disconnect', () => { banner.hidden = false; });
socket.on('connect', () => { banner.hidden = true; });

function send(command) {
    socket.emit('command', command, (ack) => {
        if (!ack || !ack.ok) {
            showToast(messageFor(ack ?? { ok: false }));
        }
    });
}

/** Actions locales d'interface (data-ui). Chacune met à jour `local` puis re-rend. */
const UI = {
    flip() {
        local.flipped = !local.flipped;
        clearTimeout(autohideTimer);
        if (local.flipped) {
            if (current && current.view.phase === 'word') {
                send({ type: 'seenWord' });
            }
            autohideTimer = setTimeout(() => {
                local.flipped = false;
                repaint();
            }, AUTOHIDE_MS);
        }
    },
    'pick-finder'() { local.finderPicking = true; },
    'cancel-finder'() { local.finderPicking = false; },
    'select-v1'(arg) {
        local.v1 = arg === 'true';
        send({ type: 'vote1', value: local.v1 });
    },
    'select-v2'(arg) { local.v2 = arg; },
    'confirm-vote'() {
        if (local.v2 === null || !current) {
            return;
        }
        send({ type: current.view.phase === 'tiebreak' ? 'tiebreak' : 'vote2', candidate: local.v2 });
    },
    'kick-ask'(arg) { local.kickConfirm = arg; },
    'kick-cancel'() { local.kickConfirm = null; }
};

function onAction(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const ui = target.closest('[data-ui]');
    if (ui) {
        unlock();
        const action = ui.getAttribute('data-ui');
        if (Object.hasOwn(UI, action)) {
            UI[action](ui.getAttribute('data-arg'));
            repaint();
        }
        return;
    }
    const cmd = target.closest('[data-cmd]');
    if (cmd) {
        unlock();
        let args = {};
        try {
            args = JSON.parse(cmd.getAttribute('data-args') || '{}');
        } catch {
            args = {};
        }
        send({ type: cmd.getAttribute('data-cmd'), ...args });
    }
}

screen.addEventListener('click', onAction);
dock.addEventListener('click', onAction);

function onSubmit(event) {
    const form = /** @type {HTMLFormElement} */ (event.target).closest('form[data-form]');
    if (!form) {
        return;
    }
    event.preventDefault();
    unlock();
    const data = new FormData(form);
    if (form.dataset.form === 'join') {
        socket.emit('join', { name: String(data.get('name') ?? '') });
    } else if (form.dataset.form === 'setWord') {
        send({ type: 'setWord', word: String(data.get('word') ?? '') });
    }
}

screen.addEventListener('submit', onSubmit);

/* Le CTA du socle peut soumettre un formulaire du contenu : il porte data-submit="<form id>". */
dock.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target).closest('[data-submit]');
    if (target) {
        const form = /** @type {HTMLFormElement|null} */ (document.getElementById(target.getAttribute('data-submit')));
        form?.requestSubmit();
    }
});

/* Champ du mot : le CTA "Valider le mot" s'active quand le champ n'est plus vide. */
screen.addEventListener('input', (event) => {
    const input = /** @type {HTMLInputElement} */ (event.target);
    if (input.name === 'word') {
        const cta = dock.querySelector('[data-submit="word-form"]');
        if (cta) {
            const empty = input.value.trim() === '';
            cta.classList.toggle('btn-disabled', empty);
            cta.setAttribute('aria-disabled', String(empty));
        }
    }
});
```

- [ ] **Step 5: render.js, squelette et coquille**

```js
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
```

Note : `SCREENS` est exporté pour que les Tasks 4 à 6 puissent l'enrichir depuis le même fichier (elles remplacent les entrées `fallback` par les vraies fonctions, dans ce fichier).

- [ ] **Step 6: audio.js**

Aucun changement de logique. Vérifier seulement que `playFor` est bien appelé avec `(previousPhase, phase, reason)` par client.js (oui).

- [ ] **Step 7: Vérifier**

Run: `npm test && npm run typecheck && npm run lint`
Run (fumée) : `MIN_PLAYERS=2 PORT=8097 node app.js & PID=$!; sleep 1; curl -s http://localhost:8097/ | grep -c 'id="phasebar"'; curl -s http://localhost:8097/ | grep -c 'bootstrap\|font-awesome'; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8097/static/css/fonts.css; kill $PID`
Expected: `1`, `0`, `200`. Ouvrir ensuite deux navigateurs en largeur 390 px et vérifier : accueil conforme au §1, puis les écrans provisoires "en cours de refonte" avec leurs boutons génériques permettent de dérouler une manche (join, startRound, setWord, startTimer, wordFound n'est pas possible sans argument : utiliser drawWord puis reset pour revenir). L'objectif de cette tâche est la coquille, pas les écrans.

- [ ] **Step 8: Commit**

```bash
git add views public/css/style.css public/js/client.js public/js/dom.js public/js/render.js test/client/dom.test.js
git commit -m "feat(client): new shell with phase bar and fixed dock, design tokens, local UI state, no CDN

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JfvanwpTr4pB22fAnvL7Gr"
```

---

### Task 4: Écrans salon, rôles, mot (handoff §2 à §6)

**Files:**
- Modify: `public/js/render.js` (remplacer `lobby`, `roles`, `word` dans `SCREENS`)

**Interfaces:**
- Consumes: briques de la Task 3, `ROLE_LABELS`/`ROLE_HINTS` de dom.js, `view.me.hasSeen`, `players[].hasSeen`, `envelope.shareUrl`, `local.kickConfirm`, `local.flipped`

- [ ] **Step 1: Écrire les trois écrans**

Ajouter l'import `ROLE_LABELS, ROLE_HINTS` depuis `./dom.js`, puis les fonctions suivantes, et remplacer `lobby: fallback, roles: fallback, word: fallback` par `lobby, roles, word` dans `SCREENS`.

```js
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
```

- [ ] **Step 2: Vérifier sous node puis dans le navigateur**

Run :
```bash
node --input-type=module -e "
import { render } from './public/js/render.js';
const players=[{id:'a',name:'Alice',isHost:true,hasVoted:false,hasSeen:true},{id:'b',name:'Bob',isHost:false,hasVoted:false,hasSeen:false}];
const base={version:1,players,master:{id:'a',name:'Alice'},finder:null,timer:null,candidates:null,tallies:null,result:null};
const env=(view,extra={})=>({view:{...base,...view},online:['a','b'],serverTime:0,minPlayers:2,shareUrl:null,...extra});
const L={flipped:false,v1:null,v2:null,finderPicking:false,kickConfirm:null};
const lob=render(env({phase:'lobby',me:{id:'a',name:'Alice',isHost:true,role:null,hasVoted:false,hasSeen:false,ballot:null},word:null,actions:['startRound','reset']}),L);
console.log('lobby', /Lancer la partie/.test(lob.dock), /Retirer Bob/.test(lob.content), /2 joueurs/.test(lob.content), lob.phase.label);
const rc=render(env({phase:'roles',me:{id:'b',name:'Bob',isHost:false,role:'common',hasVoted:false,hasSeen:false,ballot:null},word:null,actions:['seenRole']}),L);
console.log('roles card', /Citoyen/.test(rc.content), /seenRole/.test(rc.dock), /1 sur 2 ont vu/.test(rc.content), rc.phase.rank);
const rm=render(env({phase:'roles',me:{id:'a',name:'Alice',isHost:true,role:'master',hasVoted:false,hasSeen:true,ballot:null},word:null,actions:['setWord','drawWord','reset']}),L);
console.log('roles master', /Choisis le mot/.test(rm.content), /word-form/.test(rm.dock), rm.phase.label);
const w=render(env({phase:'word',me:{id:'b',name:'Bob',isHost:false,role:'common',hasVoted:false,hasSeen:false,ballot:null},word:null,actions:[]}),{...L,flipped:true});
console.log('word citizen', /Tu ne connais pas le mot/.test(w.content), /data-flipped/.test(w.content), !/Drap/.test(w.content));
"
```
Expected : `lobby true true true Salon`, `roles card true true true 1 / 6`, `roles master true true Le mot`, `word citizen true true true`.

Puis `npm test && npm run typecheck && npm run lint`, et une vérification navigateur à 390 px : salon (croix puis confirmation inline), carte de rôle avec barre de temps qui se vide, écran du Maître, attente des autres avec points animés et rappel du rôle, rituel du mot avec progression.

- [ ] **Step 3: Commit**

```bash
git add public/js/render.js
git commit -m "feat(client): lobby, role card and word ritual screens from the design handoff

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JfvanwpTr4pB22fAnvL7Gr"
```

---

### Task 5: Écrans enquête, trouveur, discussion (handoff §7 à §9)

**Files:**
- Modify: `public/js/render.js` (remplacer `playing`, `discussion`)

**Interfaces:**
- Consumes: `local.finderPicking`, `view.timer`, `view.word` (Maître seul affiché), `view.finder`

- [ ] **Step 1: Écrire les écrans**

```js
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
        content: `<h1 class="h2">Qui a trouvé ?</h1><p class="p">Le chrono continue pendant ton choix.</p><div class="rows mt-14">${rows}</div>`,
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
    const wordBlock = isMaster && view.word !== null
        ? `<div class="dark"><p class="dark-label">Le mot à faire deviner</p><p class="dark-word">${e(view.word)}</p><p class="dark-note">Visible seulement par toi.</p></div>`
        : '';
    const dock = can(view, 'wordFound')
        ? uiButton('pick-finder', 'Le mot a été trouvé', '', isMaster ? 'btn btn-accent' : 'btn btn-primary')
        : `${note('Seul le Maître peut déclarer le mot trouvé.')}${disabledButton('Le mot a été trouvé')}`;
    return {
        content: `<div class="center">${timerBlock(view)}<p class="eyebrow" style="margin-top:8px">Temps restant</p></div>
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
```

Remplacer `playing: fallback, discussion: fallback` par `playing, discussion` dans `SCREENS`.

Note : le mot n'est affiché qu'au Maître (spec, écart 1), y compris dans le bandeau de discussion. Le bouton du trouveur reste jaune (accent) pour le Maître et noir pour l'hôte non Maître.

- [ ] **Step 2: Vérifier**

Test node, sur le modèle de la Task 4 : `playing` Maître contient `dark-word` et `data-cmd="wordFound"` seulement après `finderPicking: true` ; `playing` Traître (`role: 'insider'`, `word: 'Drap'`) ne contient PAS `Drap` ; `discussion` non-Maître contient `disabledButton` et pas le mot. Puis `npm test && npm run typecheck && npm run lint` et vérification navigateur : chrono 88 px, barre de progression qui se vide, bloc noir du Maître, écran "Qui a trouvé", bandeau de discussion.

- [ ] **Step 3: Commit**

```bash
git add public/js/render.js
git commit -m "feat(client): investigation, finder pick and discussion screens

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JfvanwpTr4pB22fAnvL7Gr"
```

---

### Task 6: Votes, égalité, résultat (handoff §10 à §12)

**Files:**
- Modify: `public/js/render.js` (remplacer `vote1`, `vote2`, `tiebreak`, `ended`)

**Interfaces:**
- Consumes: `local.v1`, `local.v2`, `view.me.ballot`, `view.me.hasVoted`, `view.candidates`, `view.tallies`, `view.result`, `outcomeTitle` de dom.js

- [ ] **Step 1: Écrire les écrans**

Ajouter `outcomeTitle` à l'import depuis `./dom.js`.

```js
/* §10 Premier vote */
function vote1(envelope, local) {
    const { view } = envelope;
    const finder = view.finder?.name ?? '?';
    const selected = local.v1 !== null ? local.v1 : (typeof view.me.ballot === 'boolean' ? view.me.ballot : null);
    const opt = (value, label, cls) => uiButton('select-v1', label, String(value), `opt ${cls}${selected === value ? ' selected' : ''}`, `<span>${e(label)}</span>${svg('check', 22)}`);
    const dock = view.me.hasVoted
        ? `<button type="button" class="btn btn-registered" aria-disabled="true">Vote enregistré</button>`
        : disabledButton('Choisis une réponse');
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

/* Ligne de candidat partagée par vote2 et tiebreak */
function candidateRow(view, c, selected, score) {
    const isCenter = c.id === 'center';
    const label = isCenter ? 'Personne, il n\'y a pas de Traître' : c.name;
    const cls = `cand${isCenter ? ' cand-center' : ''}${selected ? ' selected' : ''}`;
    const inner = isCenter
        ? `<span>${e(label)}</span>${svg('check', 20)}`
        : `${avatar(c.name)}<span>${e(c.name)}</span>${score !== null ? `<span class="score">${score}</span>` : ''}${svg('check', 20)}`;
    return uiButton('select-v2', label, c.id, cls, inner);
}

/* §11 Second vote */
function vote2(envelope, local) {
    const { view } = envelope;
    const chosen = local.v2 ?? (typeof view.me.ballot === 'string' ? view.me.ballot : null);
    const rows = (view.candidates ?? []).map((c) => candidateRow(view, c, chosen === c.id, null)).join('');
    const confirmed = view.me.hasVoted && chosen === view.me.ballot;
    let dock;
    if (chosen === null) {
        dock = disabledButton('Choisis un joueur');
    } else if (confirmed) {
        dock = `<button type="button" class="btn btn-registered" aria-disabled="true">Vote enregistré</button>`;
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
    const rows = (view.candidates ?? []).map((c) => candidateRow(view, c, decides && chosen === c.id, view.tallies?.[c.id] ?? 0)).join('');
    const dock = decides
        ? (chosen === null ? disabledButton('Choisis un joueur') : uiButton('confirm-vote', 'Départager'))
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
    const bars = tallies.length
        ? `<div class="mt-20"><p class="label">Les votes</p>${tallies.map(([id, n]) => `<div class="tally"><div class="tally-row"><span>${e(id === 'center' ? 'Pas de Traître' : playerName(view, id))}</span><span>${n}</span></div><div class="tally-track"><div class="tally-fill${n === max && n > 0 ? ' top' : ''}" style="width:${max > 0 ? Math.round((n / max) * 100) : 0}%"></div></div></div>`).join('')}</div>`
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
```

Remplacer les quatre entrées `fallback` restantes dans `SCREENS` par `vote1, vote2, tiebreak, ended`, puis supprimer la fonction `fallback` si elle n'est plus référencée (garder le repli dans `render()` sous la forme `SCREENS[view.phase] ?? (() => ({ content: '', dock: '' }))`).

- [ ] **Step 2: Vérifier**

Test node : `vote1` avec `me.ballot: true` marque `opt-yes selected` et le socle "Vote enregistré" ; `vote2` avec `local.v2` non confirmé affiche "Confirmer mon vote", puis avec `me.ballot === local.v2` et `hasVoted` affiche "Vote enregistré" ; `tiebreak` non décideur affiche la note nommant le trouveur et les scores ; `ended` produit une barre `top` sur le maximum. Puis suite complète et vérification navigateur d'une manche entière à deux joueurs (vote 1, vote 2 avec sélection puis confirmation, écran de fin en trois temps).

- [ ] **Step 3: Commit**

```bash
git add public/js/render.js
git commit -m "feat(client): two-step votes with visible selection, tiebreak and three-part result screen

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JfvanwpTr4pB22fAnvL7Gr"
```

---

### Task 7: Nettoyage, critères de fin, documentation

**Files:**
- Modify: `README.md`, `docs/suites-2026-09-17.md`, `docs/adr/0001-regles-du-jeu.md` (D6 : niveau 2 réalisé), `docs/checklist-mobile.md`

- [ ] **Step 1: Vérifications**

```bash
git grep -n -i "bootstrapcdn\|font-awesome\|fontawesome\|jquery\|fonts.googleapis" -- ':!docs' ; echo "(attendu : rien)"
grep -c "fas fa-\|btn-warning\|btn-dark\|btn-outline-dark" public/js/render.js ; echo "(attendu : 0)"
npm test 2>&1 | tail -8 && npm run typecheck && npm run lint
```

- [ ] **Step 2: Documentation**

- README : section Jouer, étape 2 : "Chacun découvre son rôle en retournant sa carte, une barre de temps se vide en cinq secondes, puis confirme qu'il l'a vue" ; étape 3 : ajouter "l'hôte voit combien de joueurs ont regardé" ; section Développement : "Le design est celui du handoff `docs/design/handoff-2026-09-21/`, la spec des écarts est `docs/specs/2026-09-21-refonte-mobile-design.md`" ; variables d'environnement : ajouter `PUBLIC_URL` : adresse affichée au salon pour rejoindre (défaut : l'adresse ouverte par le navigateur)
- ADR 0001, D6 : ajouter en fin de paragraphe "Niveau 2 réalisé le 21/09 : accusés `seenRole` et `seenWord` dans le moteur, progression collective affichée. Le chrono reste lançable par l'hôte sans attendre tout le monde."
- `docs/suites-2026-09-17.md` : section "Fait depuis" : "Refonte mobile complète (handoff Claude Design), Bootstrap et Font Awesome retirés, polices auto-hébergées, votes en deux gestes, résultat en trois temps (21/09)" ; retirer les items couverts (labels du centre encore en dur : toujours vrai pour l'écran de fin, le laisser)
- `docs/checklist-mobile.md` : ajouter deux lignes : "La barre de temps de la carte se vide bien en 5 s et la carte se recache au même moment" et "Le socle d'action reste visible au-dessus de la barre home (safe area)"

- [ ] **Step 3: Commit**

```bash
git add README.md docs
git commit -m "docs: redesign status, PUBLIC_URL, D6 level 2, mobile checklist additions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JfvanwpTr4pB22fAnvL7Gr"
```
