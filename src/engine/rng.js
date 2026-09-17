// src/engine/rng.js
// Générateur déterministe pour les tests et le tirage des rôles. Aucune dépendance.

/**
 * @param {number} seed
 * @returns {() => number} flottant dans [0, 1)
 */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Fisher-Yates sur une copie.
 * @template T
 * @param {readonly T[]} array
 * @param {() => number} rng
 * @returns {T[]}
 */
export function shuffle(array, rng) {
    const out = array.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/**
 * @template T
 * @param {readonly T[]} array
 * @param {() => number} rng
 * @returns {T}
 */
export function pick(array, rng) {
    if (array.length === 0) {
        throw new Error('pick: empty array');
    }
    return array[Math.floor(rng() * array.length)];
}
