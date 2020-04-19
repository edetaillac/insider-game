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
            {name: 'Manu', role: '', permission: 'admin'},
            {name: 'Aude', role: '', permission: null},
            {name: 'Stéphane', role: '', permission: null},
            {name: 'Hélène', role: '', permission: null},
            //{name: 'Romain', role: '', permission: null},
            //{name: 'Fanny', role: '', permission: null}
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

    socket.on('startGame', function (object) {
        io.in('game').emit('startGame', {});
    })

    socket.on('ding', function (object) {
        io.in('game').emit('ding', {});
    })
 
}) 
 
server.listen(8080);
