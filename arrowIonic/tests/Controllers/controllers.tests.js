describe('Controllers', function() {
  var scope;

  // load the controller's module
  beforeEach(module('starter.controllers'));

  beforeEach(inject(function($rootScope, $controller) {
    scope = $rootScope.$new();
    $controller('MapCtrl', {$scope: scope});
  }));

  // tests start here
  it('drop a pin', function() {
    expect(scope.settings.enableFriends).toEqual(true);
  });
});
