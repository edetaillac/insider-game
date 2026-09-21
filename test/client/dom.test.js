import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, formatCountdown, outcomeSentence, messageFor, initial, outcomeTitle, svg, PHASE_BAR } from '../../public/js/dom.js';

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
    assert.equal(PHASE_BAR.playing.rank, '3 / 6');
    assert.equal(PHASE_BAR.tiebreak.label, 'Second vote');
});

test('svg renvoie un svg inline avec aria-hidden', () => {
    const s = svg('check', 16);
    assert.ok(s.startsWith('<svg'));
    assert.ok(s.includes('aria-hidden="true"'));
    assert.ok(s.includes('width="16"'));
});
