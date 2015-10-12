var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;
// var mongoose = require('mongoose');
  
// mongoose.connect('mongodb://localhost/SpeechChat', function(err) {
//     if(err) {
//         console.log('connection error', err);
//     } else {
//         console.log('connection successful');
//     }
// });
var lobby = {};
var liveGames = {};

var SwappingGame = function (players) {
  var gameID = players[0].gameID;

  io.emit('gameStart', 'in SwappingGame function');

  io.on('connection', function(socket) {
    socket.join(gameID);
    socket.on('def', function(input){
      io.emit('in def server sending back globally');
      io.to(gameID).emit('in def server sending back in room');
    })
  });
  //subscribe to new socket (should be on client side)
  // io.on('connection', function(socket){
  //   socket.join(gameID);
  // });

  // io.to(gameID).emit('newTarget', [players[0].playerId, players[1]]);
  // io.to(gameID).emit('newTarget', [players[1].playerId, players[0]]);

  // console.log('SwappingGame is running!!!');

  //listen for target acquired to end game
  //io.on('targetAcquired')  
    //end game
};

var gameSettings = {
  SwappingGame: {func: SwappingGame, min: 2, max: 2}
};

io.on('connection', function(socket){

  socket.on('gameEnter', function(player) {
    var gameID = player.gameID;
    var newGame = player.newGame;
    if (newGame) {
      io.emit('gameStart', 'making game...');
      lobby[gameID] = {players: [], gameType: player.newGame.gameType};
    }

    lobby[gameID].players.push(player);
    var gameType = lobby[gameID].gameType;

    if (lobby[gameID].players.length === gameSettings[gameType].max) {
      io.emit('updateLobby', lobby);
      // call the gameType function passing in player array
      liveGames[gameID] = new gameSettings[gameType].func((lobby[gameID].players));
      delete lobby[gameID];
    }
  });
});

http.listen(port, function(){
  console.log('listening on *:'+port);
});