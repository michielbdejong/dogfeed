angular.module('ngRSS', ['ngRemoteStorage', 'ngSockethubClient']).


/**
 * settings service
 */
value('configHelper', {
  exists: function exists(config, cfg) {
    if (!cfg) {
      cfg = config;
    }

    for (var key in config) {
      if (!cfg[key]) {
        return false;
      }
    }
    return true;
  },
  set: function (config, cfg) {
    for (var key in cfg) {
      config[key] = cfg[key];
    }
    return config;
  }
}).

value('util', {
  isEmptyObject: function isEmptyObject(obj) {
    for(var prop in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, prop)) {
        return false;
      }
    }
    return true;
  }
}).




///////////////////////////////////////////////////////////////////////////
//
// FACTORY
//
///////////////////////////////////////////////////////////////////////////


/**
 * Factory: RSS
 */
factory('RSS', ['$rootScope', '$q', 'SH', 'configHelper', 'RS',
function ($rootScope, $q, SH, CH, RS) {

  var config = {};
  var data = {
    articles: [],
    info: {}
  };
  var func = {};

  /****
   * CONFIG MANAGEMENT
   ********************/
  function exists(cfg) {
    return CH.exists(config, cfg);
  }

  func.setConfig = function set(cfg) {
    var defer = $q.defer();
    if (exists(cfg)) {
      if (cfg) {
        CH.set(config, cfg);
      }
      defer.resolve(config);
    } else {
      defer.reject('config not set correctly');
    }
    return defer.promise;
  };

  /****
   * FEED MANAGEMENT
   ******************/
  // grab whatever feeds exists in remoteStorage right away
  (function getFeedUrls() {
    RS.call('rss', 'getAll', ['']).then(function (urls) {
      console.log('getFeedUrls - got: ', urls);
      for (var key in urls) {
        data.info[key] = urls[key];
      }
    }, function (err) {
      console.log('error: unable to get feed list from remoteStorage: ', err);
    });
  })();

  // add a new feed to remoteStorage
  func.addFeed = function addFeed(obj) {
    var defer = $q.defer();
    RS.call('rss', 'add', [obj]).then(function (m) {
      console.log('feed added: ', obj);
      data.info[obj.id] = obj;
      defer.resolve(m);
    }, function (err) {
      defer.reject(err);
    });
    return defer.promise;
  };


  /****
   * FEED FETCHING
   ****************/
  // issue orders to fetch feeds from sockethub
  func.fetchFeed = function fetch(url) {
    var defer = $q.defer();
    var msg = {};
    msg.target[0].address = url;
    msg.platform = 'rss';
    msg.verb = 'fetch';
    msg.actor.address = "rss";
    console.log("FETCH: ", msg);
    SH.submit(msg, 5000).then(defer.resolve, defer.reject);
    return defer.promise;
  };

  // detect when new articles are received from Sockethub
  SH.on('rss', 'message', function (m) {
    console.log("RSS received message");
    data.articles.push(m);
  });

  return {
    config: config,
    data: data,
    func: func
  };
}]).




///////////////////////////////////////////////////////////////////////////
//
// CONTROLLERS
//
///////////////////////////////////////////////////////////////////////////


/**
 * controller: addFeedCtrl
 */
controller('addFeedCtrl',
['$scope', 'RSS', '$rootScope',
function ($scope, RSS, $rootScope) {
  $scope.url = '';
  $scope.adding = false;

  $scope.add = function (url) {
    $scope.adding = true;

    var obj = {
      url: url,
      name: url,
      cache_articles: 20,
      last_fetched: new Date().getTime()
    };

    RSS.func.addFeed(obj).then(function (m) {
      console.log('rss feed url saved!: ', m);
      $rootScope.$broadcast('closeModalAddFeed');
      $scope.adding = false;
      $rootScope.$broadcast('message', {type: 'success', message: 'RSS feed added: '+obj.url});
    }, function (err) {
      console.log('rss feed url save failed!: ', err);
      $rootScope.$broadcast('message', {type: 'error', message: err.message});
    });

  };

}]).


/**
 * controller: feedCtrl
 */
controller('feedCtrl',
['$scope', 'RSS', 'util',
function ($scope, RSS, util) {

  $scope.model = {};
  $scope.model.feeds = RSS.data;
  $scope.model.message = '';

  // display friendly message when no feeds are loaded
  if (util.isEmptyObject($scope.model.feeds.info)) {
    $scope.model.message = "no feeds yet, add some!";
    $scope.$watch('$scope.model.feeds.info', function (newVal, oldVal) {
      console.log('feed info n: ', newVal);
      console.log('feed info o: ', oldVal);
      if (!util.isEmptyObject($scope.model.feeds.info)) {
        $scope.model.message = '';
      }

    });
  }
}]).




///////////////////////////////////////////////////////////////////////////
//
// DIRECTIVES
//
///////////////////////////////////////////////////////////////////////////



/**
 * sdirective: articles
 */
directive('articles', [
function () {
  return {
    restrict: 'E',
    scope: {
      feeds: '='
    },
    template: '<div class="well" ng-repeat="f in articles">' +
              '  <h2>{{ f.object.title }}</h2>' +
              '  <p>feed: <i>{{ f.actor.address }}</i></p>' +
              '  <p>article link: <i><a target="_blank" href="{{ f.object.link }}">{{ f.object.link }}</a><i></p>' +
              '  <div data-brief data-ng-bind-html-unsafe="f.object.brief_html"></div>' +
              '</div>',
    link: function (scope) {
      console.log('ARTICLES: ', scope.feeds.articles);
      for (var i = 0, num = scope.feeds.articles.length; i < num; i = i + 1) {
        if (!scope.feeds.articles[i].object.html) {
          scope.feeds.articles[i].object.html = scope.feeds.articles[i].object.text;
        }
        if (!scope.feeds.articles[i].object.brief_html) {
          scope.feeds.articles[i].object.brief_html = scope.feeds.articles[i].object.brief_text;
        }
      }
    }
  };
}]).


/**
 * directive: feedList
 */
directive('feedList', [
function () {
  return {
    restrict: 'E',
    scope: {
      'feeds': '='
    },
    template: '<h4 ng-transclude></h4>' +
              '<span>{{ message }}<span>' +
              '<ul class="nav nav-list">' +
              '  <li ng-repeat="f in feeds.info" data-toggle="tooltip" title="{{ f.name }}">' +
              '    <a href="#/feed/{{ f.url | urlEncode }}">{{ f.name }}</a>' +
              '  </li>' +
              '</ul>',
    transclude: true
  };
}]);
