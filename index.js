var app = require('express')();
var http = require('http').Server(app);
var io = exports.io = require('socket.io')(http);
var port = process.env.PORT || 3000;
var gameMenu = require('./games/gameMenu').gameMenu;
var GameLib = require('./games/gameDevelopmentLibrary').GameLib;

var lobby = {};
var liveGames = exports.liveGames = {};
var sockets = exports.sockets = {};
var gamesInfo = {};
for (var game in gameMenu) {
  gamesInfo[game] = gameMenu[game].gameInfo;
}

io.on('connection', function(socket){
  console.log('user connected');
  io.emit('updateLobby', lobby);
  socket.emit('gamesInfo', gamesInfo);

  var gamePlayerInfo = {};

  var quitGame = function(playerInfo){
    console.log('a player quit!');
    var quitter = playerInfo.playerName;
    var gameID = playerInfo.gameID;

    if (lobby[gameID]) {
      console.log('old lobby game: ', lobby[gameID]);
      var players = lobby[gameID].players;
      var playerNames = players.map(function(player) {
        return player.playerName;
      });
      var playerInd = playerNames.indexOf(quitter);
      if (playerInd !== -1) {
        players.splice(playerInd, 1);
        if (players.length === 0) {
          delete lobby[gameID];
          delete sockets[gameID];
        }
        console.log('new lobby game: ', lobby[gameID]);
        io.emit('updateLobby', lobby);
      }
    }
    socket.leave(gameID);
  };

  socket.on('playerQuit', quitGame);

  socket.on('gameEnter', function(player) {
    console.log('gameEnter received');
    var gameID = player.gameID;
    var newGame = player.newGame;
    if (newGame) {
      lobby[gameID] = {players: [], gameType: player.newGame.gameType, isPrivate: player.newGame.isPrivate};
      sockets[gameID] = {};
    }
    if (lobby[gameID]) {
      socket.join(gameID);
      // emit indicator that player successfully joined?
      var playerName = player.playerName;
      gamePlayerInfo = {gameID: gameID, playerName: playerName};

      var players = lobby[gameID].players;
      sockets[gameID][playerName] = socket;
      players.push(player);
      var gameType = lobby[gameID].gameType;
      // var numJoined = players.length;

      if (players.length === gameMenu[gameType].maxPlayers) {
        io.to(gameID).emit('gameStart', gameID);
        launchGame(gameType, gameID, players);
      }
    } else {
      // emit some kind of indicator that game is no longer available
    }
    console.log('lobby', JSON.stringify(lobby));
    io.emit('updateLobby', lobby);

  });

  socket.on('disconnect', function() {
    console.log('player disconnected');
    quitGame(gamePlayerInfo);
    socket.removeAllListeners('playerQuit');
    socket.removeAllListeners('gameEnter');
    socket.removeAllListeners('targetAcquiredBy'); // not needed
    socket.removeAllListeners('acquiredTarget');
    socket.removeAllListeners('disconnect');
  });
});

var launchGame = function(gameType, gameID, players) {
  var liveGame = liveGames[gameID] = {};
  var joinedPlayer;
  for (var j = 0; j < players.length; j++) {
    joinedPlayer = players[j];
    liveGame[joinedPlayer.playerName] = {
      target: false, // starts out with no target, must assign in game
      isTargetOf: [],
      home: joinedPlayer.location
    };
  }
  delete lobby[gameID];
  gameMenu[gameType].play(new GameLib(gameID));
}

http.listen(port, function(){
  console.log('listening on *:'+port);
});
