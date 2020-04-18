// On mets en place les app requierments
const express = require('express');
const app = express();
var server = require('http').createServer(app), // Serveur HTTP
    io = require('socket.io').listen(server), // Socket.io pour le realtime
    ent = require('ent'); // Ent pour l'encodage

const fs = require('fs');
const wordFamille = fs.readFileSync('words/famille.csv','utf8').split("\r\n"); 

app.use(function(req, res, next){
    players = [
        {name: 'Aude', role: ''},
        {name: 'Stéphane', role: ''},
        //{name: 'Hélène', role: ''},
        //{name: 'Manu', role: ''},
        //{name: 'Romain', role: ''},
        //{name: 'Fanny', role: ''}
    ];
    next();
})

.use('/static', express.static(__dirname + '/public'))
 
// Rendu de todo.ejs à la route racine
.get('/', function (req, res) {
    res.render('board.ejs', {players: players});
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
        io.in('game').emit('newRole', { players: players , word: 'sdf' });
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
