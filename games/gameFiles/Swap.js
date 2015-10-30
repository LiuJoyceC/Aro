
module.exports.gameInfo = {
  // Fill out the following info for your game:
  name: 'Swap'
  ,
  minPlayers: 2
  ,
  maxPlayers: 2
};

module.exports.play = Swap; // for now. will change to a generic name

function Swap(lib) {
  console.log('swap got run');

  lib.startGame();

  lib.whenPlayerOut(function(outPlayerName, outPlayerInfo) {
    // in this game, this function is mostly needed for
    // when one player quits or disconnects from game
    // Remaining player wins
    lib.playerWins(lib.listRemainingPlayers()[0]);
  });

  lib.whenTargetAcquired(lib.listRemainingPlayers(), function(playerName, targetName) {
    lib.playerWins(playerName);
  });

  // start
  lib.setCurrentLocationOfAllAsHome(function() {
    var targetsObj = {};
    var players = lib.listRemainingPlayers();
    targetsObj[players[0]] = players[1];
    targetsObj[players[1]] = players[0];
    lib.assignNewTargets(targetsObj);
  });

};
