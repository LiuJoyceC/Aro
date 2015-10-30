var app = require('express')();
var http = require('http').Server(app);
var io = exports.io = require('socket.io')(http);
var port = process.env.PORT || 3000;

var lobby = {};
var liveGames = exports.liveGames = {};
// var playersByGame = {};
var sockets = exports.sockets = {};

io.on('connection', function(socket){
  console.log('user connected');
  io.emit('updateLobby', lobby);

  var gamePlayerInfo = {};

  var quitGame = function(playerInfo){
    console.log('a player quit!');
    var quitter = playerInfo.playerName;
    var gameID = playerInfo.gameID;

    // if (playersByGame[gameID]) {
    //   var player0 = playersByGame[gameID][0].playerName;
    //   var player1 = playersByGame[gameID][1].playerName;

    //   if (quitter === player0 || quitter === player1) {
    //     if (quitter === player0) {
    //       io.to(gameID).emit('gameEnd', player1);
    //     } else {
    //       io.to(gameID).emit('gameEnd', player0);
    //     }
    //     delete liveGames[gameID];
    //     delete playersByGame[gameID];
    //     delete sockets[gameID];
    //     //io.emit('console.log', liveGames);
    //   }
    // }

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
        // // call the gameType function passing in player array
        // var liveGame = liveGames[gameID] = {};
        // var joinedPlayer;
        // for (var j = 0; j < numJoined; j++) {
        //   joinedPlayer = players[j];
        //   liveGame[joinedPlayer.playerName] = {
        //     //socket: sockets[gameID][joinedPlayer.playerName],
        //     target: false, // starts out with no target, must assign in game
        //     isTargetOf: [],
        //     home: joinedPlayer.location
        //   };
        // }
        // // playersByGame[gameID] = players;
        // delete lobby[gameID];
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

// var SwappingGame = function (players, playerSockets) {
//   var gameID = players[0].gameID;
//   var targets = {};

//   // not directly accessible in game development library
//   var allPlayers = Object.keys(liveGames[gameID]);

//   var listAllPlayers = function() {
//     return allPlayers.slice();
//   };

//   // helper function only
//   var playerInGame = function(playerName) {
//     var liveGame = liveGames[gameID];
//     if (typeof playerName === 'string' && liveGame && liveGame[playerName]) {
//       return playerName;
//     } else {
//       return false;
//     }
//   };

//   // Only used as helper function for whenTargetAcquired
//   // can assume playerName is valid player still in game
//   var setUpAcquiredTargetListener = function(playerName, callback) {
//     playerSockets[playerName].removeAllListeners('acquiredTarget');
//     playerSockets[playerName].on('acquiredTarget', function(targetName) {
//       // due to async nature of sockets and possible slow connections
//       // between server and client, check that the acquired target sent
//       // by client is actually the current target. If not, don't trigger
//       // callback, since player has not acquired the current target
//       console.log('acquiredTarget listener got triggered');
//       if (targetName === getTargetOf(playerName)) {
//         console.log('and so did the callback');
//         callback(playerName, targetName);
//       }
//     });
//   };

//   // callback(playerName, targetName)
//   // playerName_s_ is either a playerName or array of playerNames
//   var whenTargetAcquired = function(playerName_s_, callback) {
//     if (typeof playerName_s_ === 'string') {
//       playerName_s_ = [playerName_s_];
//     }

//     if (Array.isArray(playerName_s_)) {
//       var numPlayers = playerName_s_.length;
//       var playerName;
//       for (var ind = 0; ind < numPlayers; ind++) {
//         playerName = playerName_s_[ind];
//         if (playerInGame(playerName)) {
//           setUpAcquiredTargetListener(playerName, callback);
//         }
//       }
//     }
//   };

//   var getTargetOf = function(playerName) {
//     if (playerInGame(playerName)) {
//       return liveGames[gameID][playerName].target;
//     }
//   };

//   // only a helper function for assignNewTarget and assignNewTargets
//   // can assume playerName is valid player still in game and that
//   // targetName is either valid player still in game or targetName === false
//   var updateTargets = function(playerName, targetName) {
//     var oldTarget = liveGames[gameID][liveGames[gameID][playerName].target];
//     // if player has a current target, will delete player from
//     // the current target's isTargetOf list
//     if (oldTarget) {
//       var ind = oldTarget.isTargetOf.indexOf(playerName);
//       if (ind !== -1) {
//         oldTarget.isTargetOf.splice(ind, 1);
//       }
//     }

//     liveGames[gameID][playerName].target = targetName;
//     if (targetName) {
//       liveGames[gameID][targetName].isTargetOf.push(playerName);
//     }
//   };

//   var assignNewTargets = function(targetsObj) { //next-callback?
//     var emitObj = {};
//     for (var playerName in targetsObj) {
//       // check if playerName is valid player still in game
//       if (playerInGame(playerName)) {
//         var targetName = playerInGame(targetsObj[playerName]);
//         updateTargets(playerName, targetName);
//         if (targetName) {
//           emitObj[playerName] = {
//             playerName: targetName,
//             location: getHomeLocationOf(targetName)
//           };
//         } else {
//           // if you pass in false for a playerName in the targetsObj,
//           // then the player will now have no target
//           emitObj[playerName] = {
//             location: {}
//           };
//         }
//       }
//     }
//     io.to(gameID).emit('newTarget', emitObj); // next-callback?
//     // because a check is built into the acquiredTarget listener
//     // to ensure that client does not acquire an old target after
//     // new targets have been emitted, this function can be treated
//     // as if it is synchronous.
//   };

//   var assignNewTarget = function(playerName, targetName) { // next-callback?
//     var targetsObj = {};
//     targetsObj[playerName] = targetName;
//     assignNewTargets(targetsObj); // next-callback?
//     // because a check is built into the acquiredTarget listener
//     // to ensure that client does not acquire an old target after
//     // new targets have been emitted, this function can be treated
//     // as if it is synchronous.
//   };

//   var getHomeLocationOf = function(playerName) {
//     if (playerInGame(playerName)) {
//       return liveGames[gameID][playerName].home;
//     }
//   };

//   var playerOut = function(playerName) { //next-callback if assignNewTargets?
//     if (typeof playerName === 'object') {
//       playerName = playerName.playerName;
//     }
//     if (playerInGame(playerName)) {
//       disactivateGameplayListeners([playerName]);
//       io.to(gameID).emit('playerOut', playerName);
//       var currTargetName = liveGames[gameID][playerName].target;
//       var currTargetIsTargetOf = liveGames[gameID][currTargetName].isTargetOf;
//       for (var i = 0; i < currTargetIsTargetOf.length; i++) {
//         if (currTargetIsTargetOf[i] = playerName) {
//           currTargetIsTargetOf.splice(i, 1);
//           break;
//         }
//       }
//       var isTargetOf = liveGames[gameID][playerName].isTargetOf;
//       delete liveGames[gameID][playerName];

//       var playerInd = allPlayers.indexOf(playerName);
//       if (playerInd !== -1) {
//         allPlayers.splice(playerInd, 1);
//       }

//     //   var len = isTargetOf.length;
//     //   // If the player's pursuers have not already been reassigned
//     //   // targets, then by default they will now be targeting the
//     //   // player's current target. However, it is recommended that
//     //   // the game logic always reassigns targets before calling playerOut
//     //   if (len) {
//     //     var targetsObj = {};
//     //     for (var j = 0; j < isTargetOf.length; j++) {
//     //       targetsObj[isTargetOf[j]] = currTargetName;
//     //     }
//     //     assignNewTargets(targetsObj); //next-callback? not needed anymore
//     //   }
//     }

//     playerOutCallback(playerName, allPlayers);
//   };

//   // Not directly accessible in game developer library
//   var playerOutCallback = function(outPlayerName, outPlayerInfo) {
//     // Must call whenPlayerOut to set this playerOutCallback
//   };

//   // Only one playerOutCallback can be defined at a time,
//   // if whenPlayerOut is called again, playerOutCallback replaced
//   // callback(outPlayerName, outPlayerInfo)
//   // if at the end of the callback the game hasn't ended and there
//   // are players still targeting the outPlayer, those players will
//   // now get assigned no target
//   // may later add team or role as a parameter
//   var whenPlayerOut = function(callback) {
//     playerOutCallback = function(outPlayerName, outPlayerInfo) {
//       callback(outPlayerName, outPlayerInfo);
//       // if game has not already been ended in callback
//       if (liveGames[gameID]) {
//         if (allPlayers.length === 1) {
//           playerWins(allPlayers[0]);
//         } else {
//           var targetsObj = {};
//           for (var i = 0; i < allPlayers.length; i++) {
//             var playerName = allPlayers[i];
//             if (!playerInGame(liveGames[gameID][playerName].target)) {
//               targetsObj[playerName] = false;
//             }
//           }
//           assignNewTargets(targetsObj);
//         }
//       }
//     };
//   };

//   var setCurrentLocationOfAllAsHome = function(next) {
//     // Needs to be the first thing that runs when game starts
//     // after setUpPlayerQuitListeners and whenTargetAcquired
//     // have been set up
//     setCurrentLocationAsHome(allPlayers, next);
//   };

//   var setCurrentLocationAsHome = function(playerName_s_, next) {
//     if (typeof playerName_s_ === 'string') {
//       playerName_s_ = [playerName_s_];
//     }

//     if (Array.isArray(playerName_s_)) {
//       // setCurrLocationListener for each of the valid players in the array
//       // once all players have emitted back location, next-callback will run
//       var nextCallbackHasRun = false;
//       var whenLocationReceived = function(playerName, location) {
//         liveGames[gameID][playerName].home = location;
//         delete remainingPlayers[playerName];
//         // In case a player leaves game before sending location,
//         // this will prevent gameplay from waiting for that location
//         // Might be unnecessary now that setTimeout has been set below
//         /*for (var remainingPlayer in remainingPlayers) {
//           if (!playerInGame(remainingPlayer)) {
//             delete remainingPlayers[remainingPlayer];
//           }
//         }*/

//         if (Object.keys(remainingPlayers).length === 0 && !nextCallbackHasRun) {
//           nextCallbackHasRun = true;
//           next();
//         }
//       };

//       var numPlayers = playerName_s_.length;
//       var remainingPlayers = {};
//       var playerName;
//       for (var i = 0; i < numPlayers; i++) {
//         playerName = playerName_s_[i];
//         if (playerInGame(playerName)) {
//           remainingPlayers[playerName] = 1;
//           setUpCurrLocationListener(playerName, whenLocationReceived);
//         }
//       }
//       io.to(gameID).emit('getCurrLocation', remainingPlayers); // need to set up on client
//       // If a player's connection is slow, gameplay will just continue
//       // after 5 seconds of waiting for location from client
//       // Location will still update for a client that sends back a location
//       // after 5 seconds, but no guarantee that any new pursuers will get
//       // the new location as their next target location
//       setTimeout(function() {
//         if (!nextCallbackHasRun) {
//           nextCallbackHasRun = true;
//           next();
//         }
//       }, 5000);
//     } else {
//       // if playerName_s_ not an array, then no home locations will be
//       // updated, and the next-callback just immediately executes
//       next();
//     }
//   };

//   // helper function only
//   var setUpCurrLocationListener = function(playerName, callback) {
//     // need to set this up on the client side
//     playerSockets[playerName].removeAllListeners('currLocation');
//     playerSockets[playerName].on('currLocation', function(location) {
//       callback(playerName, location);
//     });
//   };


//   var isTargeting = function(targetName) {
//     if (playerInGame(targetName)) {
//       return liveGames[gameID][targetName].isTargetOf;
//     }
//   };

//   var playerWins = function(playerName) {
//     if (playerInGame(playerName)) {
//       gameEnd(playerName);
//     } else {
//       gameOver();
//     }
//   };

//   var gameOver = function() {
//     gameEnd('No one');
//   };

//   var disactivateGameplayListeners = function(playerNames) {
//     console.log('disactivateGameplayListeners got run');
//     var playerSocket;
//     for (var i = 0; i < playerNames.length; i++) {
//       playerSocket = playerSockets[playerNames[i]];
//       if (playerSocket) {
//         console.log('listener removers run');
//         playerSocket.removeAllListeners('acquiredTarget');
//         playerSocket.removeAllListeners('currLocation');
//         playerSocket.removeListener('playerQuit', playerOut);
//         playerSocket.removeListener('disconnect', playerOut);
//       }
//     }
//   };

//   // must be run before game logic
//   var setUpPlayerQuitListeners = function() {
//     for (var playerName in playerSockets) {
//       var playerSocket = playerSockets[playerName];
//       playerSocket.on('playerQuit', playerOut);
//       playerSocket.on('disconnect', playerOut);
//     }
//   };

//   // not part of game developer interface
//   // only helper function for playerWins and gameOver
//   var gameEnd = function(winner) {
//     io.to(gameID).emit('gameEnd', winner);
//     disactivateGameplayListeners(allPlayers);
//     for (var i = 0; i < playerSockets.length; i++) {
//       playerSockets[i].leave(gameID);
//     }
//     delete liveGames[gameID];
//     // delete playersByGame[gameID];
//     delete sockets[gameID];
//   };

//   // new game logic for Swap starts here:
//   whenPlayerOut(function(outPlayerName, outPlayerInfo) {
//     // in this game, this function is mostly needed for
//     // when one player quits or disconnects from game
//     // Remaining player wins
//     playerWins(listAllPlayers()[0]);
//   });

//   setUpPlayerQuitListeners();

//   whenTargetAcquired(listAllPlayers(), function(playerName, targetName) {
//     playerWins(playerName);
//   });

//   // start
//   setCurrentLocationOfAllAsHome(function() {
//     var targetsObj = {};
//     var allPlayersList = listAllPlayers();
//     targetsObj[allPlayersList[0]] = allPlayersList[1];
//     targetsObj[allPlayersList[1]] = allPlayersList[0];
//     assignNewTargets(targetsObj);
//   });


//   // old game logic
//   // for (var i = 0; i < players.length; i++) {
//   //   playerSockets[players[i].playerName].on('targetAcquiredBy', function(playerInfo){
//   //     var winner = playerInfo.playerName;
//   //     var gameID = playerInfo.gameID;
//   //     var player0 = playersByGame[gameID][0].playerName;
//   //     var player1 = playersByGame[gameID][1].playerName;

//   //     if (winner === player0 || winner === player1) {
//   //       io.to(gameID).emit('gameEnd', winner);
//   //       delete liveGames[gameID];
//   //       delete playersByGame[gameID];
//   //       delete sockets[gameID];
//   //       //io.emit('console.log', liveGames);
//   //     }
//   //   });
//   // }

//   // targets[players[0].playerName] = players[1];
//   // targets[players[1].playerName] = players[0];
//   // io.to(gameID).emit('newTarget', targets);
//   //
// };

var gameMenu = require('./games/gameMenu').gameMenu;

// Game developer library methods will be added
// to the prototype in the gameDevelopmentLibrary.js
// var GameLib = exports.GameLib = function(gameID) {
//   this._gameID = gameID;
//   // this.playerSockets = playerSockets;
//   // this._livePlayers = Object.keys(liveGames[gameID]);
// };
var GameLib = require('./games/gameDevelopmentLibrary').GameLib;

var launchGame = function(gameType, gameID, players) {
  var liveGame = liveGames[gameID] = {};
  var joinedPlayer;
  for (var j = 0; j < players.length; j++) {
    joinedPlayer = players[j];
    liveGame[joinedPlayer.playerName] = {
      //socket: sockets[gameID][joinedPlayer.playerName],
      target: false, // starts out with no target, must assign in game
      isTargetOf: [],
      home: joinedPlayer.location
    };
  }
  // playersByGame[gameID] = players;
  delete lobby[gameID];
  gameMenu[gameType].play(new GameLib(gameID));
}

http.listen(port, function(){
  console.log('listening on *:'+port);
});
