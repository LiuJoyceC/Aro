var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;

var lobby = {};
var liveGames = {};
var playersByGame = {};

io.on('connection', function(socket){
  io.emit('updateLobby', lobby);

  socket.on('targetAcquiredBy', function(playerInfo){
    var winner = playerInfo.playerName;
    var gameID = playerInfo.gameID;
    var player0 = playersByGame[gameID][0].playerName;
    var player1 = playersByGame[gameID][1].playerName;

    if (winner === player0 || winner === player1) {
      io.to(gameID).emit('gameEnd', winner);
      delete liveGames[gameID];
      delete playersByGame[gameID];
      io.emit('console.log', liveGames);
    }
  });

  socket.on('playerQuit', function(playerInfo){
    var quitter = playerInfo.playerName;
    var gameID = playerInfo.gameID;
    var player0 = playersByGame[gameID][0].playerName;
    var player1 = playersByGame[gameID][1].playerName;

    if (quitter === player0 || quitter === player1) {
      if (quitter === player0) {
        io.to(gameID).emit('gameEnd', player1);
      } else {
        io.to(gameID).emit('gameEnd', player0);
      }
      delete liveGames[gameID];
      delete playersByGame[gameID];
      io.emit('console.log', liveGames);
    }
  });

  var SwappingGame = function (players) {
    var gameID = players[0].gameID;
    var targets = {};
    targets[players[0].playerName] = players[1];
    targets[players[1].playerName] = players[0];
    io.to(gameID).emit('newTarget', targets);
  };

  var gameSettings = {
    SwappingGame: {func: SwappingGame, min: 2, max: 2}
  };

  socket.on('gameEnter', function(player) {
    var gameID = player.gameID;
    socket.join(gameID);
    var newGame = player.newGame;
    if (newGame) {
      lobby[gameID] = {players: [], gameType: player.newGame.gameType, isPrivate: player.newGame.isPrivate};
    }

    lobby[gameID].players.push(player);
    var gameType = lobby[gameID].gameType;

    if (lobby[gameID].players.length === gameSettings[gameType].max) {
      io.emit('gameStart', gameID);
      // call the gameType function passing in player array
      liveGames[gameID] = new gameSettings[gameType].func((lobby[gameID].players));
      playersByGame[gameID] = lobby[gameID].players;
      delete lobby[gameID];
    }
    io.emit('updateLobby', lobby);
  });
});

http.listen(port, function(){
  console.log('listening on *:'+port);
});
