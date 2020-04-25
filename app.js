// On mets en place les app requierments
const express = require('express');
const app = express();
var server = require('http').createServer(app), // Serveur HTTP
    io = require('socket.io').listen(server), // Socket.io pour le realtime
    ent = require('ent'); // Ent pour l'encodage
var session = require('express-session');
var bodyParser = require('body-parser');
var expressLayouts = require('express-ejs-layouts');

const fs = require('fs');
const wordFamille = fs.readFileSync('words/famille.csv','utf8').split("\r\n"); 
const gameMasterRole = 'Maître du jeu';
const traitorRole = 'Traître';
const defaultRole = 'Citoyen';

app.use(function(req, res, next){
    if (typeof(players) == 'undefined') {
        players = [
            {name: 'Manu', role: '', vote1: null, vote2: null, nbVote2: 0, isGhost: false, permission: 'admin'},
            {name: 'Hélène', role: '', vote1: null, vote2: null, nbVote2: 0, isGhost: false, permission: null},
        ];
    }

    if (typeof(word) == 'undefined') {
        word = '';
    }

    if (typeof(online) == 'undefined') {
        online = 0;
    }

    if (typeof(settings) == 'undefined') {
        settings = { traitorOptional: true };
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
    res.render('welcome.ejs', {players: players.filter(function(player) {return !isGhostPlayer(player) })});
})

.get('/adminPlayer', function (req, res) {
    res.render('adminPlayer.ejs', {players: players});
})

.get('/deletePlayer', function (req, res) {
    players.forEach(function(playerItem, index) {
        if(playerItem.name == req.query.player) {
            players.splice(index, 1);
        }
    });

    res.redirect('/adminPlayer');
})

.post('/addPlayer', function (req, res) {
    players.push(
        {name: req.body.player, role: '', isGhost: false, permission: null},
    );

    res.redirect('/adminPlayer');
})

.post('/setWord', function (req, res) {
    if(req.body.word !== '') {
        word = req.body.word;
    }
    res.json('ok');
})

.post('/game', function (req, res) {    
    player = {name: req.body.player, permission: null, role: ''};
    players.forEach(function(playerItem, index) {
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
    players.some(function(player) {
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
    if(settings.traitorOptional) {
        players.push({name: 'Pas de Traître', role: defaultRole, vote1: null, vote2: null, nbVote2: 0, isGhost: true, permission: null});
    }

    return players;
}

function removeGhostPlayer() {
    players = players.filter(function(player) {return !isGhostPlayer(player) });
}

function getGhostPlayer() {
    ghostPlayer = players.filter(isGhostPlayer);

    return ghostPlayer.length > 0 ? ghostPlayer[0] : null;
}

function getWord(data) {
    return data[Math.floor(Math.random() * data.length)];
}

function everybodyHasVoted(voteNumber) {
    const hasVoted1 = (currentValue) => currentValue.isGhost || currentValue.vote1 !== null;
    const hasVoted2 = (currentValue) => currentValue.isGhost || currentValue.vote2 !== null;

    if(voteNumber == 1) {
        return players.every(hasVoted1);
    } else {
        return players.every(hasVoted2);
    }
}

function resetVote(voteNumber) {
    players.map(function(player) {
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

    players.map(function(player) {
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
    players.some(function(player) {
      if(player.vote1 == '1') {
        voteResult.up += 1;
      } else if(!isGhostPlayer(player)) {
        voteResult.down += 1;
      }
    })

    return voteResult;
}

function getVote2Result() {
    players.forEach(function(player, index) {
        addPlayerVote2(player.vote2);
    });
    votePlayers = players.filter(isNotGameMaster);
    votePlayers.sort(compareVote);
    hasWon = votePlayers[0].role === traitorRole && votePlayers[1].nbVote2 < votePlayers[0].nbVote2;
    ghostPlayers = players.filter(isGhostPlayer);
    ghostPlayer = ghostPlayers.length > 0 ? ghostPlayers[0]: null;

    return { hasWon: hasWon, voteDetail: votePlayers, hasTraitor: (!ghostPlayer || ghostPlayer.role !== traitorRole) };
}
 
// On enclenche le socket d'échange
io.sockets.on('connection', function (socket) {
 
    socket.join('game');
    var gameCountdown = null;

    socket.on('newPlayer', function(data1) {
        online = online + 1;
        humanPlayers = players.filter(function(player) {return !isGhostPlayer(player) });
        offline = humanPlayers.length - online;
        console.log('Online players : ' + online);
        console.log('New player connected : ' + data1);
        io.in('game').emit('playerStatusUpdate', { online: online, offline: offline });
      });

    socket.on('disconnect', function () {
      console.log('Player disconnected');
      online = online > 0 ? online - 1 : 0;
      humanPlayers = players.filter(function(player) {return !isGhostPlayer(player) });
      offline = humanPlayers.length - online;
      io.in('game').emit('playerStatusUpdate', { online: online, offline: offline });
    });
    
    socket.on('resetGame', function (object) {
        players = randomRoles(players);
        word = getWord(wordFamille);
        io.in('game').emit('newRole', { players: players });
    })

    socket.on('revealWord', function (object) {
        io.in('game').emit('revealWord', { players: players , word: word });
    })

    socket.on('wordFound', function (object) {
        io.in('game').emit('wordFound');
    })

    socket.on('displayVote1', function (object) {
        resetVote(1);
        io.in('game').emit('displayVote1');
    })

    socket.on('displayVote2', function () {
        resetVote(2);
        io.in('game').emit('displayVote2', players.filter(isNotGameMaster));
    })

    socket.on('vote1', function (object) {
        players.map(function(player) {
            if(object.player === player.name) {
                player.vote1 = object.vote;
            }
        });

        if(everybodyHasVoted(1)) {
            io.in('game').emit('vote1Ended', getVote1Result());
        }
    })

    socket.on('vote2', function (object) {
        players.map(function(player) {
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
        if (gameCountdown !== null) {
            clearInterval(gameCountdown);
        }  
        gameCountdown = setInterval(function(){
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
