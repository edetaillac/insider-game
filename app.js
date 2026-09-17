// app.js
// Entrée du serveur : lit l'environnement, charge la liste de mots, démarre le transport.

import { readFileSync } from 'node:fs';
import { createApp } from './src/server/app.js';

const env = process.env;
const PORT = Number(env.PORT ?? 8080);
const wordsFile = new URL(env.WORDS_FILE ?? './words/famille.csv', import.meta.url);

const words = readFileSync(wordsFile, 'utf8')
    .split(/\r?\n/)
    .map((word) => word.trim())
    .filter(Boolean);

const settings = {
    minPlayers: Number(env.MIN_PLAYERS ?? 4),
    traitorOptional: env.TRAITOR_OPTIONAL !== 'false',
    timerMs: Number(env.TIMER_MS ?? 300_000)
};

const { httpServer } = createApp({ settings, words });

httpServer.listen(PORT, () => {
    console.log(`Insider game listening on port ${PORT} (minPlayers ${settings.minPlayers}, timer ${settings.timerMs} ms, traitorOptional ${settings.traitorOptional})`);
});
