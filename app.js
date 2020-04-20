// On mets en place les app requierments
const express = require('express');
const app = express();
var server = require('http').createServer(app), // Serveur HTTP
    io = require('socket.io').listen(server), // Socket.io pour le realtime
    ent = require('ent'); // Ent pour l'encodage
var session = require('express-session');
var bodyParser = require('body-parser');

const fs = require('fs');
const wordFamille = fs.readFileSync('words/famille.csv','utf8').split("\r\n"); 

app.use(function(req, res, next){
    if (typeof(players) == 'undefined') {
        players = [
            {name: 'Manu', role: '', vote1: null, vote2: null, nbVote2: 0, permission: 'admin'},
            {name: 'Aude', role: '', vote1: null, vote2: null, nbVote2: 0, permission: null},
            //{name: 'Stéphane', role: '', vote1: null, vote2: null, nbVote2: 0, permission: null},
            //{name: 'Hélène', role: '', vote1: null, vote2: null, nbVote2: 0, permission: null},
            //{name: 'Romain', role: '', vote1: null, vote2: null, nbVote2: 0, permission: null},
            //{name: 'Fanny', role: '', vote1: null, vote2: null, nbVote2: 0, permission: null}
        ];
    }
    
    next();
})

.use(session({ secret: 'session-insider-secret', cookie: { maxAge: null }}))

.use('/static', express.static(__dirname + '/public'))

.use(bodyParser.urlencoded({
   extended: true
}))
 
.get('/', function (req, res) {
    res.render('welcome.ejs', {players: players});
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
        {name: req.body.player, role: '', permission: null},
    );

    res.redirect('/adminPlayer');
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

function randomRoles(players)
{
    players = shuffle(players);
    players.forEach(function(player, index) {
        player.role = 'Citoyen';
        player.vote1 = null;
        player.vote2 = null;
        player.nbVote2 = 0;
    });
    players = players.sort(() => Math.random() - 0.5);
    players[0].role = 'Maître du jeu';
    players[1].role = 'Traitre';
    
    return players;
}

function shuffle(players)
{
    let newRoles = [];
    while(players.length !== 0) {
        let randomIndex = Math.floor(Math.random() * players.length);
        newRoles.push(players[randomIndex]);
        players.splice(randomIndex, 1);
    }

    return newRoles;
}

function getWord(data)
{
    return data[Math.floor(Math.random() * data.length)];
}

function everybodyHasVoted(voteNumber) {
    const hasVoted1 = (currentValue) => currentValue.vote1 !== null;
    const hasVoted2 = (currentValue) => currentValue.vote2 !== null;

    if(voteNumber == 1) {
        return players.every(hasVoted1);
    } else {
        return players.every(hasVoted2);
    }
}

function filterPlayerVote2(player) {
    return player.role !== 'Maître du jeu';
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

function getVoteResult(voteNumber) {

    if(voteNumber == 1) {
        voteResult = {'up': 0, 'down': 0};
        players.some(function(player) {
          if(player.vote1 == '1') {
            voteResult.up += 1;
          } else {
            voteResult.down += 1;
          }
        })
    } else {
        players.forEach(function(player, index) {
            addPlayerVote2(player.vote2);
        });
        voteResult = players.filter(filterPlayerVote2);
        voteResult.sort(compareVote);
    }

    return voteResult;
}
 
// On enclenche le socket d'échange
io.sockets.on('connection', function (socket) {
 
    socket.join('game');
    
    socket.on('resetGame', function (object) {
        players = randomRoles(players);
        word = getWord(wordFamille);
        io.in('game').emit('newRole', { players: players , word: word });
    })

    socket.on('revealWord', function (object) {
        socket.broadcast.emit('revealWord');
    })

    socket.on('wordFound', function (object) {
        socket.broadcast.emit('wordFound');
    })

    socket.on('displayVote1', function (object) {
        socket.broadcast.emit('displayVote1');
    })

    socket.on('displayVote2', function () {
        io.in('game').emit('displayVote2', players.filter(filterPlayerVote2));
    })

    socket.on('vote1', function (object) {
        players.map(function(player) {
            if(object.player === player.name) {
                player.vote1 = object.vote;
            }
        });

        if(everybodyHasVoted(1)) {
            voteResult = getVoteResult(1);
            io.in('game').emit('vote1Ended', voteResult);
        }
    })

    socket.on('vote2', function (object) {
        players.map(function(player) {
            if(object.player === player.name) {
                player.vote2 = object.vote;
            }
        });

        if(everybodyHasVoted(2)) {
            voteResult = getVoteResult(2);
            io.in('game').emit('vote2Ended', voteResult);
        }
    })

    socket.on('startGame', function (object) {
        io.in('game').emit('startGame', {});
    })

    socket.on('ding', function (object) {
        io.in('game').emit('ding', {});
    })
 
}) 
 
server.listen(8080);
