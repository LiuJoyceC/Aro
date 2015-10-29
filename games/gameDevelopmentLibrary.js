var server = require('../../index');
var liveGames = server.liveGames;
var sockets = server.sockets;
var io = server.io;
var GameLib = server.GameLib;
var gameMenu = ('./gameMenu');

var playerOutCallbacks = {};



/* Helper functions (not part of game dev library) */

// helper function only
var playerInGame = function(playerName, gameID) {
  var liveGame = liveGames[gameID];
  if (typeof playerName === 'string' && liveGame && liveGame[playerName]) {
    return playerName;
  } else {
    return false;
  }
};

// must be run before game logic
var setUpPlayerQuitListeners = function(gameID, playerOut) {
  var playerSockets = sockets[gameID];
  var playerSocket;
  for (var playerName in playerSockets) {
    playerSocket = playerSockets[playerName];
    playerSocket.on('playerQuit', playerOut);
    playerSocket.on('disconnect', playerOut);
  }
};

// Only used as helper function for whenTargetAcquired
// can assume playerName is valid player still in game
var setUpAcquiredTargetListener = function(playerName, gameID, getTargetOf, callback) {
  var playerSocket = sockets[gameID][playerName];
  playerSocket.removeAllListeners('acquiredTarget');
  playerSocket.on('acquiredTarget', function(targetName) {
    // due to async nature of sockets and possible slow connections
    // between server and client, check that the acquired target sent
    // by client is actually the current target. If not, don't trigger
    // callback, since player has not acquired the current target
    console.log('acquiredTarget listener got triggered');
    if (targetName === getTargetOf(playerName)) {
      console.log('and so did the callback');
      callback(playerName, targetName);
    }
  });
};

// helper function only
var setUpCurrLocationListener = function(playerName, gameID, callback) {
  // need to set this up on the client side
  var playerSocket = sockets[gameID][playerName];
  playerSocket.removeAllListeners('currLocation');
  playerSocket.on('currLocation', function(location) {
    callback(playerName, location);
  });
};

// only a helper function for assignNewTarget and assignNewTargets
// can assume playerName is valid player still in game and that
// targetName is either valid player still in game or targetName === false
var updateTargets = function(playerName, targetName, gameID) {
  var liveGame = liveGames[gameID];
  var oldTarget = liveGame[liveGame[playerName].target];
  // if player has a current target, will delete player from
  // the current target's isTargetOf list
  if (oldTarget) {
    var ind = oldTarget.isTargetOf.indexOf(playerName);
    if (ind !== -1) {
      oldTarget.isTargetOf.splice(ind, 1);
    }
  }

  liveGame[playerName].target = targetName;
  if (targetName) {
    liveGame[targetName].isTargetOf.push(playerName);
  }
};

// helper function
var disactivateGameplayListeners = function(playerNames, gameID, playerOut) {
  console.log('disactivateGameplayListeners got run');
  var playerSocket;
  for (var i = 0; i < playerNames.length; i++) {
    playerSocket = sockets[gameID][playerNames[i]];
    if (playerSocket) {
      console.log('listener removers run');
      playerSocket.removeAllListeners('acquiredTarget');
      playerSocket.removeAllListeners('currLocation');
      playerSocket.removeListener('playerQuit', playerOut);
      playerSocket.removeListener('disconnect', playerOut);
    }
  }
};

// not part of game developer interface
// only helper function for playerWins and gameOver
var gameEnd = function(winner, gameID, playerOut) {
  io.to(gameID).emit('gameEnd', winner);
  var playerSockets = sockets[gameID];
  disactivateGameplayListeners(Object.keys(liveGames[gameID]), gameID, playerOut);
  for (var playerName in playerSockets) {
    playerSockets[playerName].leave(gameID);
  }
  delete liveGames[gameID];
  // delete playersByGame[gameID];
  delete sockets[gameID];
  delete playerOutCallbacks[gameID];
};






/* Game Dev Library */

GameLib.prototype.startGame = function() {
  var gameID = this._gameID;
  var library = this;

  this.playerOut = function(playerName) { //next-callback if assignNewTargets?
    if (typeof playerName === 'object') {
      playerName = playerName.playerName;
    }
    if (playerInGame(playerName, gameID)) {
      disactivateGameplayListeners([playerName], gameID, library.playerOut);
      io.to(gameID).emit('playerOut', playerName);
      var playerInfo = liveGames[gameID][playerName];
      var currTargetName = playerInfo.target;
      var currTargetIsTargetOf = liveGames[gameID][currTargetName].isTargetOf;
      for (var i = 0; i < currTargetIsTargetOf.length; i++) {
        if (currTargetIsTargetOf[i] === playerName) {
          currTargetIsTargetOf.splice(i, 1);
          break;
        }
      }
      // var isTargetOf = playerInfo.isTargetOf;
      delete liveGames[gameID][playerName];

      // var playerInd = this._livePlayers.indexOf(playerName);
      // if (playerInd !== -1) {
      //   this._livePlayers.splice(playerInd, 1);
      // }

    //   var len = isTargetOf.length;
    //   // If the player's pursuers have not already been reassigned
    //   // targets, then by default they will now be targeting the
    //   // player's current target. However, it is recommended that
    //   // the game logic always reassigns targets before calling playerOut
    //   if (len) {
    //     var targetsObj = {};
    //     for (var j = 0; j < isTargetOf.length; j++) {
    //       targetsObj[isTargetOf[j]] = currTargetName;
    //     }
    //     assignNewTargets(targetsObj); //next-callback? not needed anymore
    //   }
      playerOutCallbacks[gameID](playerName, playerInfo);
    }

  };

  setUpPlayerQuitListeners(gameID, library.playerOut);

  // In case this function is not called later, this will set a default
  this.whenPlayerOut();
};

// Only one playerOutCallback for a game can be defined at a time,
// if whenPlayerOut is called again, playerOutCallback replaced
// callback(outPlayerName, outPlayerInfo)
// if at the end of the callback the game hasn't ended and there
// are players still targeting the outPlayer, those players will
// now get assigned no target
// may later add team or role as a parameter
GameLib.prototype.whenPlayerOut = function(callback) {
  callback = callback || function() {};
  var gameID = this._gameID;
  var library = this;
  playerOutCallbacks[gameID] = function(outPlayerName, outPlayerInfo) {
    callback(outPlayerName, outPlayerInfo);
    // if game has not already been ended in callback
    if (liveGames[gameID]) {
      var livePlayers = library.listRemainingPlayers();
      if (livePlayers.length === 1) {
        playerWins(livePlayers[0]);
      } else {
        var targetsObj = {};
        for (var i = 0; i < livePlayers.length; i++) {
          var playerName = livePlayers[i];
          if (!playerInGame(liveGames[gameID][playerName].target, gameID)) {
            targetsObj[playerName] = false;
          }
        }
        library.assignNewTargets(targetsObj);
      }
    }
  };
};

// callback(playerName, targetName)
// playerName_s_ is either a playerName or array of playerNames
GameLib.prototype.whenTargetAcquired = function(playerName_s_, callback) {
  if (typeof playerName_s_ === 'string') {
    playerName_s_ = [playerName_s_];
  }

  if (Array.isArray(playerName_s_)) {
    var gameID = this._gameID;
    var numPlayers = playerName_s_.length;
    var playerName;
    for (var ind = 0; ind < numPlayers; ind++) {
      playerName = playerName_s_[ind];
      if (playerInGame(playerName, gameID)) {
        setUpAcquiredTargetListener(playerName, gameID, this.getTargetOf.bind(this), callback);
      }
    }
  }
};

GameLib.prototype.listRemainingPlayers = function() {
  // any changes made to the array will not affect
  // the object from which the keys are retrieved
  return Object.keys(liveGames[this._gameID]);
};

GameLib.prototype.getTargetOf = function(playerName) {
  var gameID = this._gameID;
  if (playerInGame(playerName, gameID)) {
    return liveGames[gameID][playerName].target;
  }
};

GameLib.prototype.isTargeting = function(targetName) {
  var gameID = this._gameID;
  if (playerInGame(targetName, gameID)) {
    // should I give open-source community copy instead so they can't
    // mess with this?
    return liveGames[gameID][targetName].isTargetOf;
  }
};

GameLib.prototype.getHomeLocationOf = function(playerName) {
  var gameID = this._gameID;
  if (playerInGame(playerName, gameID)) {
    // should I give open-source community copy instead so they can't
    // mess with this?
    return liveGames[gameID][playerName].home;
  }
};

GameLib.prototype.assignNewTarget = function(playerName, targetName) { // next-callback?
  var targetsObj = {};
  targetsObj[playerName] = targetName;
  this.assignNewTargets(targetsObj); // next-callback?
  // because a check is built into the acquiredTarget listener
  // to ensure that client does not acquire an old target after
  // new targets have been emitted, this function can be treated
  // as if it is synchronous.
};

GameLib.prototype.assignNewTargets = function(targetsObj) { //next-callback?
  var emitObj = {};
  var gameID = this._gameID;
  for (var playerName in targetsObj) {
    // check if playerName is valid player still in game
    if (playerInGame(playerName, gameID)) {
      var targetName = playerInGame(targetsObj[playerName], gameID);
      updateTargets(playerName, targetName, gameID);
      if (targetName) {
        emitObj[playerName] = {
          playerName: targetName,
          location: this.getHomeLocationOf(targetName)
        };
      } else {
        // if you pass in false for a playerName in the targetsObj,
        // then the player will now have no target
        emitObj[playerName] = {
          location: {}
        };
      }
    }
  }
  io.to(gameID).emit('newTarget', emitObj); // next-callback?
  // because a check is built into the acquiredTarget listener
  // to ensure that client does not acquire an old target after
  // new targets have been emitted, this function can be treated
  // as if it is synchronous.
};

GameLib.prototype.setCurrentLocationAsHome = function(playerName_s_, next) {
  if (typeof playerName_s_ === 'string') {
    playerName_s_ = [playerName_s_];
  }

  if (Array.isArray(playerName_s_)) {
    var gameID = this._gameID;
    // setCurrLocationListener for each of the valid players in the array
    // once all players have emitted back location, next-callback will run
    var nextCallbackHasRun = false;
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

      if (Object.keys(remainingPlayers).length === 0 && !nextCallbackHasRun) {
        nextCallbackHasRun = true;
        next();
      }
    };

    var numPlayers = playerName_s_.length;
    var remainingPlayers = {};
    var playerName;
    for (var i = 0; i < numPlayers; i++) {
      playerName = playerName_s_[i];
      if (playerInGame(playerName, gameID)) {
        remainingPlayers[playerName] = 1;
        setUpCurrLocationListener(playerName, gameID, whenLocationReceived);
      }
    }
    io.to(gameID).emit('getCurrLocation', remainingPlayers); // need to set up on client
    // If a player's connection is slow, gameplay will just continue
    // after 5 seconds of waiting for location from client
    // Location will still update for a client that sends back a location
    // after 5 seconds, but no guarantee that any new pursuers will get
    // the new location as their next target location
    setTimeout(function() {
      if (!nextCallbackHasRun) {
        nextCallbackHasRun = true;
        next();
      }
    }, 5000);
  } else {
    // if playerName_s_ not an array, then no home locations will be
    // updated, and the next-callback just immediately executes
    next();
  }
};

GameLib.prototype.setCurrentLocationOfAllAsHome = function(next) {
  // Needs to be the first thing that runs when game starts
  // after setUpPlayerQuitListeners and whenTargetAcquired
  // have been set up
  this.setCurrentLocationAsHome(this.listRemainingPlayers(), next);
};

GameLib.prototype.playerWins = function(playerName) {
  var gameID = this._gameID;
  if (playerInGame(playerName, gameID)) {
    gameEnd(playerName, gameID, this.playerOut);
  } else {
    this.gameOver();
  }
};

GameLib.prototype.gameOver = function() {
  gameEnd('No one', this._gameID, this.playerOut);
};
