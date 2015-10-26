var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;

var lobby = {};
var liveGames = {};
var playersByGame = {};
var sockets = {};

io.on('connection', function(socket){
  console.log('user connected');
  io.emit('updateLobby', lobby);

  var gamePlayerInfo = false;

  var quitGame = function(playerInfo){
    console.log('a player quit!');
    var quitter = playerInfo.playerName;
    var gameID = playerInfo.gameID;

    if (playersByGame[gameID]) {
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
        delete sockets[gameID];
        //io.emit('console.log', liveGames);
      }
    } else if (lobby[gameID]) {
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
  };

  socket.on('playerQuit', quitGame);

  socket.on('gameEnter', function(player) {
    console.log('gameEnter received');
    var gameID = player.gameID;
    if (lobby[gameID]) {
      socket.join(gameID);
      // emit indicator that player successfully joined?
      var playerName = player.playerName;
      gamePlayerInfo = {gameID: gameID, playerName: playerName};
      var newGame = player.newGame;
      if (newGame) {
        lobby[gameID] = {players: [], gameType: player.newGame.gameType, isPrivate: player.newGame.isPrivate};
        sockets[gameID] = {};
      }

      var players = lobby[gameID].players;
      sockets[gameID][playerName] = socket;
      players.push(player);
      var gameType = lobby[gameID].gameType;
      var numJoined = players.length;

      if (numJoined === gameSettings[gameType].max) {
        io.emit('gameStart', gameID);
        // call the gameType function passing in player array
        var liveGame = liveGames[gameID] = {};
        var joinedPlayer;
        for (var j = 0; j < numJoined; j++) {
          joinedPlayer = players[j];
          liveGame[joinedPlayer.playerName] = {
            socket: sockets[gameID][joinedPlayer.playerName],
            target: false, // starts out with no target, must assign in game
            isTargetOf: [],
            home: joinedPlayer.location
          };
        }
        playersByGame[gameID] = players;
        gameSettings[gameType].func(players, sockets[gameID]);
        delete lobby[gameID];
      }
    } else {
      // emit some kind of indicator that game is no longer available
    }
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

var SwappingGame = function (players, playerSockets) {
  var gameID = players[0].gameID;
  var targets = {};

  var allPlayers = Object.keys(liveGames[gameID]);

  // helper function only
  var playerInGame = function(playerName) {
    if (typeof playerName === 'string' && liveGames[gameID][playerName]) {
      return playerName;
    } else {
      return false;
    }
  };

  // Only used as helper function for whenTargetAcquired
  // can assume playerName is valid player still in game
  var setUpTargetAcquiredListener = function(playerName, callback) {
    playerSockets[playerName].removeAllListeners('acquiredTarget');
    playerSockets[playerName].on('acquiredTarget', function(targetName) {
      // due to async nature of sockets and possible slow connections
      // between server and client, check that the acquired target sent
      // by client is actually the current target. If not, don't trigger
      // callback, since player has not acquired the current target
      if (targetName === getTargetOf(playerName)) {
        callback(playerName, targetName);
      }
    });
  }

  // callback(playerName, targetName)
  // playerName_s_ is either a playerName or array of playerNames
  var whenTargetAcquired = function(playerName_s_, callback) {
    if (typeof playerName_s_ === 'string') {
      playerName_s_ = [playerName_s_];
    }

    if (Array.isArray(playerName_s_)) {
      var numPlayers = playerName_s_.length;
      var playerName;
      for (var ind = 0; ind < numPlayers; ind++) {
        playerName = playerName_s_[ind];
        if (playerInGame(playerName)) {
          setUpTargetAcquiredListener(playerName, callback);
        }
      }
    }
  };

  var getTargetOf = function(playerName) {
    if (playerInGame(playerName)) {
      return liveGames[gameID][playerName].target;
    }
  };

  // only a helper function for assignNewTarget and assignNewTargets
  // can assume playerName is valid player still in game and that
  // targetName is either valid player still in game or targetName === false
  var updateTargets = function(playerName, targetName) {
    var oldTarget = liveGames[gameID][liveGames[gameID][playerName].target];
    // if player has a current target, will delete player from
    // the current target's isTargetOf list
    if (oldTarget) {
      var ind = oldTarget.isTargetOf.indexOf(playerName);
      if (ind !== -1) {
        oldTarget.isTargetOf.splice(ind, 1);
      }
    }

    liveGames[gameID][playerName].target = targetName;
    if (targetName) {
      liveGames[gameID][targetName].isTargetOf.push(playerName);
    }
  };

  var assignNewTargets = function(targetsObj) { //then-callback?
    var emitObj = {};
    for (var playerName in targetsObj) {
      // check if playerName is valid player still in game
      if (playerInGame(playerName)) {
        var targetName = playerInGame(targetsObj[playerName]);
        updateTargets(playerName, targetName);
        if (targetName) {
          emitObj[playerName] = {
            playerName: targetName,
            location: getHomeLocationOf(targetName);
          };
        } else {
          // if you pass in false for a playerName in the targetsObj,
          // then the player will now have no target
          emitObj[playerName] = {
            noTarget: true
          };
        }
      }
    }
    io.to(gameID).emit('newTarget', emitObj); // then-callback?
  };

  var assignNewTarget = function(playerName, targetName) { // then-callback?
    var targetsObj = {};
    targetsObj[playerName] = targetName;
    assignNewTargets(targetsObj); // then-callback?
  };

  var getHomeLocationOf = function(playerName) {
    if (playerInGame(playerName)) {
      return liveGames[gameID][playerName].home;
    }
  };

  var playerOut = function(playerName) { //then-callback if assignNewTargets?
    if (typeof playerName === 'object') {
      playerName = playerName.playerName;
    }
    if (playerInGame(playerName)) {
      io.to(gameID).emit('playerOut', playerName); //async?
      var currTargetName = liveGames[gameID][playerName].target;
      var currTargetIsTargetOf = liveGames[gameID][currTargetName].isTargetOf;
      for (var i = 0; i < currTargetIsTargetOf.length; i++) {
        if (currTargetIsTargetOf[i] = playerName) {
          currTargetIsTargetOf.splice(i, 1);
          break;
        }
      }
      var isTargetOf = liveGames[gameID][playerName].isTargetOf;
      delete liveGames[gameID][playerName];
      var len = isTargetOf.length;
      // If the player's pursuers have not already been reassigned
      // targets, then by default they will now be targeting the
      // player's current target. However, it is recommended that
      // the game logic always reassigns targets before calling playerOut
      if (len) {
        var targetsObj = {};
        for (var j = 0; j < isTargetOf.length; j++) {
          targetsObj[isTargetOf[j]] = currTargetName;
        }
        assignNewTargets(targetsObj); //then-callback?
      }
    }
  };

  var setCurrentLocationOfAllAsHome = function(then) {
    // Needs to be the first thing that runs when game starts
    // after setUpPlayerQuitListeners and whenTargetAcquired
    // have been set up
    setCurrentLocationAsHome(allPlayers, then);
  }

  var setCurrentLocationAsHome = function(playerName_s_, then) {
    if (typeof playerName_s_ === 'string') {
      playerName_s_ = [playerName_s_];
    }

    if (Array.isArray(playerName_s_)) {
      // setCurrLocationListener for each of the valid players in the array
      // once all players have emitted back location, then-callback will run
      var thenCallbackHasRun = false;
      var whenLocationReceived = function(playerName, location) {
        liveGames[gameID][playerName].home = location;
        delete remainingPlayers[playerName];
        // In case a player leaves game before sending location,
        // this will prevent gameplay from waiting for that location
        // Might be unnecessary now that setTimeout has been set below
        /*for (var remainingPlayer in remainingPlayers) {
          if (!playerInGame(remainingPlayer)) {
            delete remainingPlayers[remainingPlayer];
          }
        }*/

        if (Object.keys(remainingPlayers).length === 0 && !thenCallbackHasRun) {
          thenCallbackHasRun = true;
          then();
        }
      };

      var numPlayers = playerName_s_.length;
      var remainingPlayers = {};
      var playerName;
      for (var i = 0; i < numPlayers; i++) {
        playerName = playerName_s_[i];
        if (playerInGame(playerName)) {
          remainingPlayers[playerName] = 1;
          setCurrLocationListener(playerName, whenLocationReceived);
        }
      }
      io.to(gameID).emit('getCurrLocation', remainingPlayers); // need to set up on client
      // If a player's connection is slow, gameplay will just continue
      // after 5 seconds of waiting for location from client
      // Location will still update for a client that sends back a location
      // after 5 seconds, but no guarantee that any new pursuers will get
      // the new location as their next target location
      setTimeout(function() {
        if (!thenCallbackHasRun) {
          thenCallbackHasRun = true;
          then();
        }
      }, 5000);
    }
  };

  // helper function only
  var setUpCurrLocationListener = function(playerName, callback) {
    // need to set this up on the client side
    playerSockets[playerName].removeAllListeners('currLocation');
    playerSockets[playerName].on('currLocation', function(location) {
      callback(playerName, location);
    });
  }


  var isTargeting = function(targetName) {
    if (playerInGame(targetName)) {
      return liveGames[gameID][targetName].isTargetOf;
    }
  };

  var playerWins = function(playerName) {
    if (playerInGame(playerName)) {
      gameEnd(playerName);
    } else {
      gameOver();
    }
  };

  var gameOver = function() {
    gameEnd('No one');
  };

  // must be run before game logic
  var setUpPlayerQuitListeners = function() {
    for (var playerName in playerSockets) {
      playerSockets[playerName].on('playerQuit', playerOut);
    }
  };

  // not part of game developer interface
  // only helper function for playerWins and gameOver
  var gameEnd = function(winner) {
    io.to(gameID).emit('gameEnd', winner);
  };

  for (var i = 0; i < players.length; i++) {
    playerSockets[players[i].playerName].on('targetAcquiredBy', function(playerInfo){
      var winner = playerInfo.playerName;
      var gameID = playerInfo.gameID;
      var player0 = playersByGame[gameID][0].playerName;
      var player1 = playersByGame[gameID][1].playerName;

      if (winner === player0 || winner === player1) {
        io.to(gameID).emit('gameEnd', winner);
        delete liveGames[gameID];
        delete playersByGame[gameID];
        delete sockets[gameID];
        //io.emit('console.log', liveGames);
      }
    });
  }

  targets[players[0].playerName] = players[1];
  targets[players[1].playerName] = players[0];
  io.to(gameID).emit('newTarget', targets);
};

var gameSettings = {
  SwappingGame: {name: 'Swap', func: SwappingGame, min: 2, max: 2}
};

http.listen(port, function(){
  console.log('listening on *:'+port);
});
