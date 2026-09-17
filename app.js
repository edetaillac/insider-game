import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import express from 'express';
import session from 'express-session';
import expressLayouts from 'express-ejs-layouts';
import { Server } from 'socket.io';

const PORT = Number(process.env.PORT ?? 8080);
const SESSION_SECRET = process.env.SESSION_SECRET ?? randomBytes(32).toString('hex');

const wordFamille = readFileSync(new URL('./words/famille.csv', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .map((word) => word.trim())
    .filter(Boolean);

const gameMasterRole = 'Maître du jeu';
const traitorRole = 'Traître';
const defaultRole = 'Citoyen';

function createPlayer(name, { permission = null, isGhost = false, role = '' } = {}) {
    return { name, role, vote1: null, vote2: null, nbVote2: 0, isGhost, permission };
}

// État de la partie, en mémoire, une seule partie par process (voir docs/audit)
const game = {
    players: [],
    online: 0,
    settings: { traitorOptional: true },
    word: '',
    countdown: null,
    status: '',
    resultVote1: null,
    resultVote2: null
};

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(expressLayouts)
    .use(session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: null }
    }))
    .use('/static', express.static(new URL('./public', import.meta.url).pathname))
    .use(express.urlencoded({ extended: true }))

    .set('view engine', 'ejs')
    .set('layout', 'layouts/layout')

    .get('/', (req, res) => {
        res.render('welcome.ejs', { players: game.players.filter((player) => !isGhostPlayer(player)) });
    })

    .get('/adminPlayer', (req, res) => {
        res.render('adminPlayer.ejs', { players: game.players });
    })

    .get('/deletePlayer', (req, res) => {
        game.players = game.players.filter((player) => player.name !== req.query.player);
        res.redirect('/adminPlayer');
    })

    .post('/addPlayer', (req, res) => {
        const name = (req.body.player ?? '').trim();
        if (name !== '' && !game.players.some((player) => player.name === name)) {
            game.players.push(createPlayer(name, { permission: req.body.admin === 'on' ? 'admin' : null }));
        }
        res.redirect('/adminPlayer');
    })

    .post('/setWord', (req, res) => {
        if (req.body.word && req.body.word !== '') {
            game.word = req.body.word;
        }
        res.json('ok');
    })

    .post('/game', (req, res) => {
        req.session.player = req.body.player;
        res.redirect('/game');
    })

    .get('/game', (req, res) => {
        const me = game.players.find((player) => player.name === req.session.player);
        if (!req.session.player || !me) {
            return res.redirect('/');
        }

        res.render('board.ejs', {
            player: me,
            status: game.status,
            resultVote1: game.resultVote1,
            resultVote2: game.resultVote2
        });
    });

function stopCountdown() {
    if (game.countdown !== null) {
        clearInterval(game.countdown);
        game.countdown = null;
    }
}

function resetGame() {
    stopCountdown();
    removeGhostPlayer();

    game.players.forEach((player) => {
        player.role = defaultRole;
        player.vote1 = null;
        player.vote2 = null;
        player.nbVote2 = 0;
    });

    game.word = '';
    game.resultVote1 = null;
    game.resultVote2 = null;
    game.status = '';
}

function randomRoles() {
    resetGame();

    shuffle(game.players);
    setRole(gameMasterRole);

    addGhostPlayer();
    shuffle(game.players);
    setRole(traitorRole);

    game.players.sort(comparePlayer);

    return game.players;
}

// TODO P1 : comparateur incohérent (jamais de retour positif), à corriger avec des tests
function comparePlayer(a, b) {
    if (a.isGhost) {
        return 1;
    } else if (a.name > b.name) {
        return 0;
    }

    return -1;
}

function setRole(role) {
    const candidate = game.players.find((player) => player.role === defaultRole);
    if (candidate) {
        candidate.role = role;
    }
}

function shuffle(players) {
    for (let ctr = players.length; ctr > 0;) {
        const index = Math.floor(Math.random() * ctr);
        ctr--;
        [players[ctr], players[index]] = [players[index], players[ctr]];
    }

    return players;
}

function addGhostPlayer() {
    if (game.settings.traitorOptional) {
        game.players.push(createPlayer('Pas de Traître', { isGhost: true, role: defaultRole }));
    }
}

function removeGhostPlayer() {
    game.players = game.players.filter((player) => !isGhostPlayer(player));
}

function getWord(data) {
    return data[Math.floor(Math.random() * data.length)];
}

function everybodyHasVoted(voteNumber) {
    const key = voteNumber === 1 ? 'vote1' : 'vote2';
    return game.players.every((player) => player.isGhost || player[key] !== null);
}

function resetVote(voteNumber) {
    const key = voteNumber === 1 ? 'vote1' : 'vote2';
    game.players.forEach((player) => {
        player[key] = null;
    });
}

function isNotGameMaster(player) {
    return player.role !== gameMasterRole;
}

function isGhostPlayer(player) {
    return player.isGhost;
}

function humanPlayersCount() {
    return game.players.filter((player) => !isGhostPlayer(player)).length;
}

function addPlayerVote2(playerVote) {
    game.players.forEach((player) => {
        if (playerVote === player.name) {
            player.nbVote2 += 1;
        }
    });
}

function compareVote(a, b) {
    return b.nbVote2 - a.nbVote2;
}

function processVote1Result() {
    const voteResult = { up: 0, down: 0 };
    game.players.forEach((player) => {
        if (player.vote1 == '1') {
            voteResult.up += 1;
        } else if (!isGhostPlayer(player)) {
            voteResult.down += 1;
        }
    });

    game.resultVote1 = voteResult;
}

function processVote2Result() {
    game.players.forEach((player) => {
        addPlayerVote2(player.vote2);
    });
    const votePlayers = game.players.filter(isNotGameMaster).sort(compareVote);
    const [first, second] = votePlayers;
    const hasWon = Boolean(first) && first.role === traitorRole && (second?.nbVote2 ?? -1) < first.nbVote2;
    const ghostPlayer = game.players.find(isGhostPlayer) ?? null;

    game.resultVote2 = {
        hasWon,
        voteDetail: votePlayers,
        hasTraitor: !ghostPlayer || ghostPlayer.role !== traitorRole
    };
}

function emitPlayerStatus() {
    io.in('game').emit('playerStatusUpdate', {
        online: game.online,
        offline: Math.max(0, humanPlayersCount() - game.online)
    });
}

io.on('connection', (socket) => {
    socket.join('game');

    socket.on('newPlayer', (name) => {
        game.online += 1;
        console.log(`New player connected: ${name} (online: ${game.online})`);
        emitPlayerStatus();
    });

    socket.on('disconnect', () => {
        game.online = Math.max(0, game.online - 1);
        emitPlayerStatus();
    });

    socket.on('resetGame', () => {
        randomRoles();
        game.word = getWord(wordFamille);
        io.in('game').emit('newRole', { players: game.players });
        game.status = 'role';
    });

    socket.on('revealWord', () => {
        io.in('game').emit('revealWord', { players: game.players, word: game.word });
        game.status = 'word';
    });

    socket.on('wordFound', () => {
        stopCountdown();
        io.in('game').emit('wordFound');
        game.status = 'vote1';
    });

    socket.on('displayVote1', () => {
        resetVote(1);
        io.in('game').emit('displayVote1');
        game.status = 'vote1';
    });

    socket.on('displayVote2', () => {
        resetVote(2);
        io.in('game').emit('displayVote2', game.players.filter(isNotGameMaster));
        game.status = 'vote2';
    });

    socket.on('vote1', ({ player: name, vote }) => {
        const player = game.players.find((item) => item.name === name);
        if (player) {
            player.vote1 = vote;
        }

        if (everybodyHasVoted(1)) {
            processVote1Result();
            io.in('game').emit('vote1Ended', game.resultVote1);
            game.status = 'vote2';
        }
    });

    socket.on('vote2', ({ player: name, vote }) => {
        const player = game.players.find((item) => item.name === name);
        if (player) {
            player.vote2 = vote;
        }

        if (everybodyHasVoted(2)) {
            processVote2Result();
            io.in('game').emit('vote2Ended', game.resultVote2);
            game.status = 'end';
        }
    });

    socket.on('startGame', () => {
        let counter = 300;
        stopCountdown();
        game.countdown = setInterval(() => {
            counter--;
            if (counter === 0) {
                stopCountdown();
            }
            io.in('game').emit('countdownUpdate', counter);
        }, 1000);

        io.in('game').emit('startGame', {});
        game.status = 'in_progress';
    });
});

httpServer.listen(PORT, () => {
    console.log(`Insider game listening on port ${PORT}`);
});
