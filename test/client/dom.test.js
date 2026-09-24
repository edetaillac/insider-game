import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, formatCountdown, outcomeSentence, messageFor, initial, outcomeTitle, svg, PHASE_BAR, initials, outcomeStory, roleHint } from '../../public/js/dom.js';

test('escapeHtml neutralise les cinq caractères', () => {
    assert.equal(escapeHtml('<b a="1">&\'</b>'), '&lt;b a=&quot;1&quot;&gt;&amp;&#39;&lt;/b&gt;');
    assert.equal(escapeHtml(42), '42');
    assert.equal(escapeHtml(null), '');
});

test('formatCountdown arrondit à la seconde supérieure et ne descend pas sous zéro', () => {
    assert.equal(formatCountdown(300_000), '5:00');
    assert.equal(formatCountdown(29_500), '0:30');
    assert.equal(formatCountdown(1), '0:01');
    assert.equal(formatCountdown(0), '0:00');
    assert.equal(formatCountdown(-5000), '0:00');
    assert.equal(formatCountdown(61_000), '1:01');
});

test('outcomeSentence couvre les quatre issues et le timeout', () => {
    assert.equal(outcomeSentence({ outcome: 'commonsWin', reason: 'vote2' }), 'Les Citoyens gagnent !');
    assert.equal(outcomeSentence({ outcome: 'insiderWins', reason: 'vote1' }), 'Le Traître gagne !');
    assert.equal(outcomeSentence({ outcome: 'allLose', reason: 'timeout' }), 'Le temps est écoulé, tout le monde perd.');
    assert.equal(outcomeSentence({ outcome: 'allLose', reason: 'vote2' }), 'Tout le monde perd.');
    assert.equal(outcomeSentence({ outcome: 'allWin', reason: 'vote2' }), 'Tout le monde gagne, il n\'y avait pas de Traître !');
});

test('messageFor traduit les codes d\'erreur', () => {
    assert.equal(messageFor({ ok: false, error: 'WRONG_PHASE', message: 'x' }), 'Cette action n\'est plus possible.');
    assert.equal(messageFor({ ok: false, error: 'FORBIDDEN', message: 'x' }), 'Tu n\'as pas le droit de faire ça.');
    assert.equal(messageFor({ ok: false, error: 'TOO_FEW_PLAYERS', message: 'x' }), 'Pas assez de joueurs.');
    assert.equal(messageFor({ ok: false, error: 'DUPLICATE_NAME', message: 'x' }), 'Ce prénom est déjà pris.');
    assert.equal(messageFor({ ok: false, error: 'SOMETHING', message: 'détail' }), 'détail');
});

test('initial prend la première lettre en capitale, ? à défaut', () => {
    assert.equal(initial('  élodie'), 'É');
    assert.equal(initial('Bob'), 'B');
    assert.equal(initial(''), '?');
    assert.equal(initial(null), '?');
});

test('outcomeTitle et PHASE_BAR', () => {
    assert.equal(outcomeTitle({ outcome: 'allLose', reason: 'timeout' }), 'Le temps est écoulé');
    assert.equal(outcomeTitle({ outcome: 'commonsWin', reason: 'vote2' }), 'Les Citoyens gagnent');
    assert.equal(PHASE_BAR.playing.rank, '3/6');
    assert.equal(PHASE_BAR.tiebreak.label, 'Second vote');
});

test('svg renvoie un svg inline avec aria-hidden', () => {
    const s = svg('check', 16);
    assert.ok(s.startsWith('<svg'));
    assert.ok(s.includes('aria-hidden="true"'));
    assert.ok(s.includes('width="16"'));
});

test('point 8 : initiales distinctes, première consonne puis deuxième lettre', () => {
    const map = initials([{ id: 'a', name: 'Manu' }, { id: 'b', name: 'Marie' }, { id: 'c', name: 'Léa' }]);
    assert.equal(map.get('a'), 'Mn');
    assert.equal(map.get('b'), 'Mr');
    assert.equal(map.get('c'), 'L');
    const tight = initials([{ id: 'a', name: 'Marc' }, { id: 'b', name: 'Mario' }]);
    assert.equal(tight.get('a'), 'Ma');
    assert.ok([...tight.values()].every((v) => v.length <= 2));
    assert.equal(initials([{ id: 'x', name: '  éva' }]).get('x'), 'É');
});

const P = [{ id: 'm', name: 'Léa' }, { id: 't', name: 'Test' }, { id: 'u', name: 'Manu' }, { id: 'k', name: 'Karim' }, { id: 'z', name: 'Zoé' }];
const endView = (result) => ({ players: P, result: { insiderId: null, centerCard: null, tallies: null, pointed: null, roles: { m: 'master', t: 'insider', u: 'common', k: 'common', z: 'common' }, ...result } });

test('point 4 : phrase du vote 1, trouveur Traître ou Citoyen', () => {
    assert.equal(outcomeStory(endView({ reason: 'vote1', finderId: 't', tallies: { t: 4 }, pointed: 't' }), 't'),
        'Au vote 1, 4 joueurs sur 5 ont accusé Test. C\'était bien le Traître.');
    assert.equal(outcomeStory(endView({ reason: 'vote1', tallies: { u: 3 }, pointed: 'u' }), 'u'),
        'Au vote 1, 3 joueurs sur 5 ont accusé Manu, qui était Citoyen.');
});

test('point 4 : phrases du vote 2, du centre et du départage', () => {
    assert.equal(outcomeStory(endView({ reason: 'vote2', pointed: 't' }), 'u'), 'Au vote 2, Test a été le plus pointé. C\'était bien le Traître.');
    assert.equal(outcomeStory(endView({ reason: 'vote2', pointed: 'k' }), 'u'), 'Au vote 2, Karim a été le plus pointé, mais c\'était un Citoyen.');
    assert.equal(outcomeStory(endView({ reason: 'vote2', pointed: 'center', centerCard: 'insider' }), 'u'), 'La majorité a vu juste : il n\'y avait pas de Traître.');
    assert.equal(outcomeStory(endView({ reason: 'vote2', pointed: 'center', centerCard: 'common' }), 'u'), 'La majorité a pointé « Personne », mais il y avait un Traître.');
    assert.equal(outcomeStory(endView({ reason: 'vote2', pointed: 'k', centerCard: 'insider' }), 'u'), 'Il n\'y avait pas de Traître, et un Citoyen a été accusé.');
    assert.equal(outcomeStory(endView({ reason: 'tiebreak', pointed: 't' }), 'u'), 'Égalité au vote 2, Manu a départagé. Test a été désigné. C\'était bien le Traître.');
    assert.equal(outcomeStory(endView({ reason: 'timeout' }), null), 'Personne n\'a trouvé le mot avant la fin du chrono.');
});

test('point 5 : indices du rôle selon la variante, Traître inchangé', () => {
    assert.equal(roleHint('common', true), 'Trouve le mot, puis démasque le Traître, s\'il y en a un.');
    assert.equal(roleHint('master', true), 'Tu choisis le mot et tu réponds aux questions. Il peut n\'y avoir aucun Traître.');
    assert.equal(roleHint('insider', true), roleHint('insider', false));
    assert.equal(roleHint('common', false), 'Trouve le mot, puis démasque le Traître.');
});
