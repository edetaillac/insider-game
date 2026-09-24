import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../../public/js/render.js';

const LOCAL = { flipped: false, everFlipped: false, v1: null, v2: null, finderPicking: false, kickConfirm: null };

/** Enveloppe de lobby minimale : Alice hôte, Bob et Carol joueurs. */
function envelope(meId, online) {
    const players = [
        { id: 'a', name: 'Alice', isHost: true, hasVoted: false, hasSeen: false },
        { id: 'b', name: 'Bob', isHost: false, hasVoted: false, hasSeen: false },
        { id: 'c', name: 'Carol', isHost: false, hasVoted: false, hasSeen: false }
    ];
    const me = players.find((p) => p.id === meId);
    return {
        view: { version: 1, phase: 'lobby', me: { ...me, role: null, ballot: null }, players, word: null, master: null, finder: null, timer: null, candidates: null, tallies: null, result: null, actions: [] },
        online,
        serverTime: 0,
        minPlayers: 2,
        shareUrl: null
    };
}

test('hôte hors ligne : un joueur voit "Reprendre la main" et le nom de l\'hôte absent', () => {
    const { content } = render(envelope('b', ['b', 'c']), LOCAL);
    assert.match(content, /data-cmd="claimHost"/);
    assert.match(content, /Alice/);
});

test('hôte en ligne : pas de reprise de main proposée', () => {
    const { content, dock } = render(envelope('b', ['a', 'b', 'c']), LOCAL);
    assert.doesNotMatch(content + dock, /claimHost/);
});

test('l\'hôte lui-même ne se voit jamais proposer la reprise', () => {
    const { content, dock } = render(envelope('a', ['b', 'c']), LOCAL);
    assert.doesNotMatch(content + dock, /claimHost/);
});
