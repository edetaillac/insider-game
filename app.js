const express = require('express');
const app = express();

var server = require('http').createServer(app), // Serveur HTTP
    io = require('socket.io').listen(server), // Socket.io pour le realtime
    ent = require('ent'), // Ent pour l'encodage
    session = require('express-session'),
    bodyParser = require('body-parser'),
    expressLayouts = require('express-ejs-layouts');

const fs = require('fs'),
      wordFamille = fs.readFileSync('words/famille.csv','utf8').split("\r\n"),
      gameMasterRole = 'Maître du jeu',
      traitorRole = 'Traître',
      defaultRole = 'Citoyen';

app.use(function(req, res, next){
    if (typeof(game) == 'undefined') {
        game = {
            players: [
                {name: 'Manu', role: '', vote1: null, vote2: null, nbVote2: 0, isGhost: false, permission: 'admin'},
                {name: 'Hélène', role: '', vote1: null, vote2: null, nbVote2: 0, isGhost: false, permission: null},
            ],
            word: '',
            online: 0,
            settings: { traitorOptional: true },
            countdown: null
        };
    }
    next();
})

.use(expressLayouts)
.use(session({ secret: 'session-insider-secret', cookie: { maxAge: null }}))
.use('/static', express.static(__dirname + '/public'))
.use(bodyParser.urlencoded({
   extended: true
}))

.set('view engine', 'ejs')
.set('layout', 'layouts/layout')

.get('/', function (req, res) {
    res.render('welcome.ejs', {players: game.players.filter(function(player) {return !isGhostPlayer(player) })});
})

.get('/adminPlayer', function (req, res) {
    res.render('adminPlayer.ejs', {players: game.players});
})

.get('/deletePlayer', function (req, res) {
    game.players.forEach(function(playerItem, index) {
        if(playerItem.name == req.query.player) {
            game.players.splice(index, 1);
        }
    });

    res.redirect('/adminPlayer');
})

.post('/addPlayer', function (req, res) {
    game.players.push(
        {name: req.body.player, role: '', isGhost: false, permission: null},
    );

    res.redirect('/adminPlayer');
})

.post('/setWord', function (req, res) {
    if(req.body.word !== '') {
        game.word = req.body.word;
    }
    res.json('ok');
})

.post('/game', function (req, res) {    
    player = {name: req.body.player, permission: null, role: ''};
    game.players.forEach(function(playerItem, index) {
        if(playerItem.name == player.name) {
            player.permission = playerItem.permission;
        }
    });

    req.session.player = player;
    res.redirect('/game');
})

.get('/game', function (req, res) {
    if(!req.session.player) {
        res.redirect('/');
    }

    res.render('board.ejs', { player: req.session.player });
})

function randomRoles(players) {
    removeGhostPlayer();

    players.forEach(function(player, index) {
        player.role = defaultRole;
        player.vote1 = null;
        player.vote2 = null;
        player.nbVote2 = 0;
    });

    players = shuffle(players);
    setRole(gameMasterRole);

    players = addGhostPlayer();
    players = shuffle(players);

    setRole(traitorRole);

    players.sort(function(a,b){return a.isGhost ? 1 : -1;});
    
    return players;
}

function setRole(role) {
    game.players.some(function(player) {
        if(player.role === defaultRole) {
            player.role = role;
            return true;
        }
    }); 
}

function shuffle(players) {
    let ctr = players.length;
    let temp;
    let index;

    while (ctr > 0) {
        index = Math.floor(Math.random() * ctr);
        ctr--;
        temp = players[ctr];
        players[ctr] = players[index];
        players[index] = temp;
    }

    return players;
}

function addGhostPlayer() {
    if(game.settings.traitorOptional) {
        game.players.push({name: 'Pas de Traître', role: defaultRole, vote1: null, vote2: null, nbVote2: 0, isGhost: true, permission: null});
    }

    return game.players;
}

function removeGhostPlayer() {
    game.players = game.players.filter(function(player) {return !isGhostPlayer(player) });
}

function getGhostPlayer() {
    ghostPlayer = game.players.filter(isGhostPlayer);

    return ghostPlayer.length > 0 ? ghostPlayer[0] : null;
}

function getWord(data) {
    return data[Math.floor(Math.random() * data.length)];
}

function everybodyHasVoted(voteNumber) {
    const hasVoted1 = (currentValue) => currentValue.isGhost || currentValue.vote1 !== null;
    const hasVoted2 = (currentValue) => currentValue.isGhost || currentValue.vote2 !== null;

    if(voteNumber == 1) {
        return game.players.every(hasVoted1);
    } else {
        return game.players.every(hasVoted2);
    }
}

function resetVote(voteNumber) {
    game.players.map(function(player) {
        if(voteNumber === 1) {
            player.vote1 = null;
        } else {
            player.vote2 = null;
        }
    });
}

function isNotGameMaster(player) {
    return player.role !== gameMasterRole;
}

function isGhostPlayer(player) {
    return player.isGhost;
}

function addPlayerVote2(playerVote) {

    game.players.map(function(player) {
        if(playerVote === player.name) {
            player.nbVote2 += 1
        }
    });
}

function compareVote(a, b) {
  if (a.nbVote2 < b.nbVote2) return 1;
  if (b.nbVote2 < a.nbVote2) return -1;

  return 0;
}

function getVote1Result() {
    voteResult = {'up': 0, 'down': 0};
    game.players.some(function(player) {
      if(player.vote1 == '1') {
        voteResult.up += 1;
      } else if(!isGhostPlayer(player)) {
        voteResult.down += 1;
      }
    })

    return voteResult;
}

function getVote2Result() {
    game.players.forEach(function(player, index) {
        addPlayerVote2(player.vote2);
    });
    votePlayers = game.players.filter(isNotGameMaster);
    votePlayers.sort(compareVote);
    hasWon = votePlayers[0].role === traitorRole && votePlayers[1].nbVote2 < votePlayers[0].nbVote2;
    ghostPlayers = game.players.filter(isGhostPlayer);
    ghostPlayer = ghostPlayers.length > 0 ? ghostPlayers[0]: null;

    return { hasWon: hasWon, voteDetail: votePlayers, hasTraitor: (!ghostPlayer || ghostPlayer.role !== traitorRole) };
}
 
// On enclenche le socket d'échange
io.sockets.on('connection', function (socket) {
 
    socket.join('game');

    socket.on('newPlayer', function(data1) {
        game.online = game.online + 1;
        humanPlayers = game.players.filter(function(player) {return !isGhostPlayer(player) });
        offline = humanPlayers.length - game.online;
        console.log('Online players : ' + game.online);
        console.log('New player connected : ' + data1);
        io.in('game').emit('playerStatusUpdate', { online: game.online, offline: offline });
      });

    socket.on('disconnect', function () {
      console.log('Player disconnected');
      game.online = game.online > 0 ? game.online - 1 : 0;
      humanPlayers = game.players.filter(function(player) {return !isGhostPlayer(player) });
      offline = humanPlayers.length - online;
      io.in('game').emit('playerStatusUpdate', { online: game.online, offline: offline });
    });
    
    socket.on('resetGame', function (object) {
        if (game.countdown !== null) {
            clearInterval(game.countdown);
        }
        game.players = randomRoles(game.players);
        game.word = getWord(wordFamille);
        io.in('game').emit('newRole', { players: game.players });
    })

    socket.on('revealWord', function (object) {
        io.in('game').emit('revealWord', { players: game.players , word: game.word });
    })

    socket.on('wordFound', function (object) {
        if (game.countdown !== null) {
            clearInterval(game.countdown);
        }
        io.in('game').emit('wordFound');
    })

    socket.on('displayVote1', function (object) {
        resetVote(1);
        io.in('game').emit('displayVote1');
    })

    socket.on('displayVote2', function () {
        resetVote(2);
        io.in('game').emit('displayVote2', game.players.filter(isNotGameMaster));
    })

    socket.on('vote1', function (object) {
        game.players.map(function(player) {
            if(object.player === player.name) {
                player.vote1 = object.vote;
            }
        });

        if(everybodyHasVoted(1)) {
            io.in('game').emit('vote1Ended', getVote1Result());
        }
    })

    socket.on('vote2', function (object) {
        game.players.map(function(player) {
            if(object.player === player.name) {
                player.vote2 = object.vote;
            }
        });

        if(everybodyHasVoted(2)) {
            io.in('game').emit('vote2Ended', getVote2Result());
        }
    })

    socket.on('startGame', function (object) {
        let counter = 300;
        if (game.countdown !== null) {
            clearInterval(game.countdown);
        }  
        game.countdown = setInterval(function(){
            counter--
            if (counter === 0) {
              clearInterval(this);
            }
            io.in('game').emit('countdownUpdate', counter);
        }, 1000);

        io.in('game').emit('startGame', {});
    })
 
}) 
 
server.listen(8080);
