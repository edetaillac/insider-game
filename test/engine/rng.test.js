import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, shuffle, pick } from '../../src/engine/rng.js';

test('mulberry32 est déterministe pour une seed donnée', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    assert.deepEqual(seqA, seqB);
    for (const x of seqA) {
        assert.ok(x >= 0 && x < 1, `valeur hors [0,1) : ${x}`);
    }
});

test('deux seeds différentes donnent des séquences différentes', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    assert.notEqual(a(), b());
});

test('shuffle renvoie une permutation sans muter l\'entrée', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const copy = input.slice();
    const out = shuffle(input, mulberry32(7));
    assert.deepEqual(input, copy);
    assert.deepEqual(out.slice().sort(), copy);
    assert.notEqual(out, input);
});

test('shuffle produit un ordre différent de l\'entrée sur un tableau de 8 (seed 3)', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    assert.notDeepEqual(shuffle(input, mulberry32(3)), input);
});

test('pick renvoie un élément du tableau et refuse le tableau vide', () => {
    const rng = mulberry32(9);
    const arr = ['a', 'b', 'c'];
    assert.ok(arr.includes(pick(arr, rng)));
    assert.throws(() => pick([], rng), /empty/);
});
