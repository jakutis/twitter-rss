var bignum = require('bignum');
var Twitter = require('twitter');
var Promise = require('bluebird');
var debug = require('debug');
var RSS = require('rss');
var fs = Promise.promisifyAll(require('fs'));
var http = require('http');
var htmlEntities = require('html-entities');
var URL = require('url').URL;

var consts = {
  ADD_USER_QUEUE: '/add-user-queue'
};

function location(userAgent, url, redirects) {
  debug('twitter-rss')('--- ' + redirects + ' ' + url);
  if (redirects === undefined) {
    redirects = 20;
  }
  if (redirects <= 0) {
    return Promise.resolve(url);
  }
  redirects--;
  return new Promise(resolve => {
    try {
      var link = require('url').parse(url);
    } catch (e) {
      return resolve(url);
    }
    var protocol = link.protocol.substr(0, link.protocol.length - 1);
    if (protocol !== 'http' && protocol !== 'https') {
      return resolve(url);
    }
    var h = require(protocol);
    var options = Object.assign({
      headers: {
        'User-Agent': userAgent
      },
    }, link);
    var resolved = false;
    var timeout = setTimeout(function () {
      if (resolved) {
        return;
      }
      resolved = true;
      resolve(url);
      req.abort();
    }, 15000);
    var req = h.request(options, r => {
      if (resolved) {
        return;
      }
      try {
        clearTimeout(timeout);
        r.destroy();
        if (r && r.headers && r.headers.location) {
          resolved = true;
          return resolve(new URL(r.headers.location, url).href);
        }
      } catch (e) {
        debug('twitter-rss')(e.stack);
      }
      resolved = true;
      resolve(url);
    });
    req.on('error', function () {
      if (resolved) {
        return;
      }
      resolved = true;
      resolve(url);
    });
    req.end();
  }).then(function (redirectedUrl) {
    debug('twitter-rss')('--> ' + redirects + ' ' + url);
    debug('twitter-rss')('<-- ' + redirects + ' ' + redirectedUrl);
    if (url !== redirectedUrl) {
      return location(userAgent, redirectedUrl, redirects);
    }
    return redirectedUrl;
  });
}

function unescape(text) {
  var entities = new htmlEntities.AllHtmlEntities();
  return entities.decode(text);
}

function toError(err) {
  if (err instanceof Error) {
    return err;
  }
  var error;
  try {
    error = new Error(JSON.stringify(err));
  } catch (e) {
    error = new Error(String(err));
  }
  try {
    throw error;
  } catch (e) {
    return error;
  }
}

function addTwitterUser(users, twitterUser) {
  var user = users[twitterUser.id_str];

  users[twitterUser.id_str] = {
    id: twitterUser.id_str,
    fullName: twitterUser.empty ? (user ? user.fullName : '-') : twitterUser.name,
    userName: twitterUser.empty ? (user ? user.userName : '-') : twitterUser.screen_name,
    updatedAt: twitterUser.empty ? (user ? user.updatedAt : Date.now()) : Date.now()
  };
  if (user && user.tweet) {
    users[twitterUser.id_str].tweet = user.tweet;
  }
  if (user && user.savedAt) {
    users[twitterUser.id_str].savedAt = user.savedAt;
  }
}

var Tweet = {
  isReply: function (tweet) {
    return !!tweet.in_reply_to_status_id_str;
  },
  sortOldestToNewest: function (a, b) {
    a = Tweet.createdNumber(a);
    b = Tweet.createdNumber(b);
    return a - b;
  },
  escapedText: function (tweet, text) {
    if (text === undefined) {
      return tweet.full_text;
    } else {
      tweet.full_text = text;
    }
  },
  unescapedText: function (tweet) {
    return unescape(tweet.full_text);
  },
  createdString: function (tweet) {
    return tweet.created_at;
  },
  createdNumber: function (tweet) {
    return Date.parse(tweet.created_at);
  },
  isOlderThan: function (a, b) {
    var aTime = Tweet.createdNumber(a);
    var bTime = Tweet.createdNumber(b);
    return aTime < bTime;
  },
  id: function (tweet) {
    return tweet.id_str;
  },
};

function formatTitle({tweet, users}) {
  var user = users[tweet.user.id_str];
  var originalTweet = tweet.retweeted_status || tweet;
  var originalUser = users[originalTweet.user.id_str];
  var title = Tweet.unescapedText(originalTweet);
  originalTweet.entities.urls.forEach(function (url) {
    title = title.split(url.url).join(url.final_url);
  });
  (originalTweet.entities.media || []).forEach(function (media) {
    title = title.split(media.url).join(media.expanded_url);
  });
  if (tweet !== originalTweet) {
    title = originalUser.fullName + ' @' + originalUser.userName + ': ' + title;
  }
  return user.fullName + ' @' + user.userName + ': ' + title;
}

function formatDescription({tweet, users}) {
  var user = users[tweet.user.id_str];
  var originalTweet = tweet.retweeted_status || tweet;
  var originalUser = users[originalTweet.user.id_str];
  var description = Tweet.escapedText(originalTweet);
  description = description.split('\n').join('<br>');

  originalTweet.entities.user_mentions.forEach(function (mention) {
    description = description.split('@' + mention.screen_name)
      .join('<a href="https://twitter.com/' + mention.screen_name + '">@' + mention.screen_name + '</a>');
  });
  originalTweet.entities.hashtags.forEach(function (hashtag) {
    description = description.split('#' + hashtag.text)
      .join('<a href="https://twitter.com/hashtag/' + hashtag.text + '">#' + hashtag.text + '</a>');
  });
  originalTweet.entities.urls.forEach(function (url) {
    var title = url.linked_status ? formatTitle({tweet: url.linked_status, users}) : url.final_url;
    description = description.split(url.url).join('<a href="' + url.final_url + '">' + title + '</a>');
  });
  (originalTweet.entities.media || []).forEach(function (media) {
    description = description.split(media.url).join('<a href="' + media.expanded_url + '">' + media.expanded_url + '</a>');
  });

  description += '<hr>';

  if (Tweet.isReply(originalTweet)) {
    var repliedToUser = users[originalTweet.in_reply_to_user_id_str];
    var repliedToTitle = originalTweet.in_reply_to_status ? formatTitle({tweet: originalTweet.in_reply_to_status, users}) : 'deleted tweet by ' + repliedToUser.fullName + ' @' + repliedToUser.userName;
    description += '<br><br>in reply to: <a href="https://twitter.com/' + repliedToUser.userName + '/status/' + originalTweet.in_reply_to_status_id_str + '">' + repliedToTitle + '</a>';
  }
  description += '<br><br>by: <a href="https://twitter.com/' + originalUser.userName + '">' + originalUser.fullName + ' @' + originalUser.userName + '</a>';
  description += '<br><br>at: ' + Tweet.createdString(originalTweet);
  if (tweet !== originalTweet) {
    description += '<br><br>retweeted by: <a href="https://twitter.com/' + user.userName + '">' + user.fullName + ' @' + user.userName + '</a>';
    description += '<br><br>retweeted at: ' + Tweet.createdString(tweet);
  }
  return description;
}

function formatFeed({pubDate, tweets, updateInterval, url, title, siteUrl, users}) {
  var feed = new RSS({
    title: title,
    description: title,
    feed_url: url,
    site_url: siteUrl,
    author: 'Twitter',
    pubDate: pubDate,
    ttl: updateInterval.toString()
  });
  tweets.forEach(function(tweet) {
    feed.item({
      title: formatTitle({tweet, users}),
      description: formatDescription({tweet, users}),
      url: 'https://twitter.com/' + users[tweet.user.id_str].userName + '/status/' + Tweet.id(tweet),
      date: Tweet.createdString(tweet)
    });
  });
  return feed.xml();
}

function createServer({bindPort, bindIp, twitterRss, baseUrl, basePath, count, updateInterval}) {

  function update() {
    return Promise.resolve(twitterRss.update())
      .catch(function (err) {
        debug('twitter-rss')('update failed: ' + err.stack);
      })
      .delay(updateInterval * 60 * 1000)
      .then(update);
  }

  update();

  http.createServer(async (req, res) => {
    try {
      var path = req.url.substr(basePath.length + 1).split('/');

      if(path[0] === 'user' && path[2] === 'tweets') {
        var userName = path[1];
        var users = await twitterRss.users();
        var user = await twitterRss.loadUser({users, userName});
        if (!user) {
          user = await twitterRss.loadTwitterUser({ userName });
          user.tweets = [];
          await twitterRss.addUser(user.id_str);
        }
        var begin = user.tweets.length - count;
        var tweets = user.tweets.slice(begin, begin + count).reverse();
        var feed = formatFeed({
          pubDate: tweets.length > 0 ? Tweet.createdString(tweets[0]) : new Date().toString(),
          users,
          tweets,
          updateInterval,
          title: 'tweets by ' + userName,
          url: baseUrl + '/user/' + userName + '/tweets',
          siteUrl: 'https://twitter.com/' + userName
        });

        res.writeHead(200, {
          'Content-Type': 'application/rss+xml'
        });
        res.end(feed);
        return;
      }

      if(path[0] === 'tweets') {
        var tweets = await twitterRss.mostRecentTweets();
        var feed = formatFeed({
          pubDate: Tweet.createdString(tweets[0]),
          users: await twitterRss.users(),
          tweets: tweets,
          updateInterval,
          title: 'tweets by followed users',
          url: baseUrl + '/tweets',
          siteUrl: 'https://twitter.com/'
        });

        res.writeHead(200, {
          'Content-Type': 'application/rss+xml'
        });
        res.end(feed);
        return;
      }

      res.writeHead(404);
      res.end();
    } catch (err) {
      debug('twitter-rss')('error:\n' + err.stack);
      res.writeHead(500);
      res.end();
    }
  }).listen(bindPort, bindIp);

  debug('twitter-rss')('HTTP server running on port ' + bindPort + ' bound to ip ' + bindIp + ' with base URL set to ' + baseUrl + '.');
}

function Twitter2000({consumerKey, consumerSecret, accessTokenKey, accessTokenSecret}) {
  var opts = {
    consumer_key: consumerKey,
    consumer_secret: consumerSecret,
    access_token_key: accessTokenKey,
    access_token_secret: accessTokenSecret
  };
  this._twitter = Promise.promisifyAll(new Twitter(opts));
}

Twitter2000.prototype = {
  _twitter: null,
  _get: async function (resource, parameters) {
    try {
      return await this._twitter.getAsync(resource, parameters);
    } catch (err) {
      debug('twitter-rss')('get ' + resource + '(' + JSON.stringify(parameters) + ') failed');
      throw toError(err);
    }
  },
  loadTweet: function ({tweetId}) {
    debug('twitter-rss')('getting tweet ' + tweetId);
    return this._get('statuses/show', {
      id: tweetId,
      trim_user: false,
      include_my_retweet: false,
      tweet_mode: 'extended',
      include_entities: true
    });
  },
  loadUser: function ({userId, userName}) {
    if (userId && userName) {
      throw new Error('both userId and userName were given');
    }
    debug('twitter-rss')('getting user ' + (userId || userName));
    return this._get('users/show', {
      user_id: userId,
      screen_name: userName,
      include_entities: true
    });
  },
  loadUserFriendIds: async function ({userId}) {
    var friendIds = [];
    var cursor;

    while (true) {
      debug('twitter-rss')('getting friends of user ' + userId);
      var response = await this._get('friends/ids', {
        user_id: userId,
        screen_name: undefined,
        cursor: cursor,
        stringify_ids: true,
        count: 1000
      });

      if (response.ids.length === 0) {
        return friendIds;
      }

      friendIds = friendIds.concat(response.ids);
      cursor = response.next_cursor_str;
    }
  },
  loadUserTweetsAfter: async function ({userId, tweetId}) {
    var maxId = undefined;
    var sinceId = tweetId;
    var loadedTweets = [];

    while (true) {
      debug('twitter-rss')('loadUserTweetsAfter', userId, sinceId, maxId);
      var tweets = await this._get('statuses/user_timeline', {
        user_id: userId,
        screen_name: undefined,
        count: 100,
        since_id: sinceId,
        max_id: maxId,
        trim_user: true,
        exclude_replies: false,
        tweet_mode: 'extended',
        include_rts: true
      });
      debug('twitter-rss')('loadUserTweetsAfter', userId, 'got', tweets.length);

      if (tweets.length === 0) {
        return loadedTweets;
      }

      tweets.sort(Tweet.sortOldestToNewest);

      loadedTweets = tweets.concat(loadedTweets);
      maxId = bignum(Tweet.id(loadedTweets[0])).sub('1').toString();
    }
  }
};

function TwitterRSS({userAgent, directory, myUserId, consumerKey, consumerSecret, accessTokenKey, accessTokenSecret}) {
  this._userAgent = userAgent;
  this._myUserId = myUserId;
  this._database = new Database({
    directory
  });
  this._twitter = new Twitter2000({ consumerKey, consumerSecret, accessTokenKey, accessTokenSecret });
}

TwitterRSS.prototype = {
  _myUserId: null,
  _database: null,
  _twitter: null,
  _userAgent: null,
  mostRecentTweets: async function () {
    return await this._database.mostRecentTweets();
  },
  loadTwitterUser: async function ({userId, userName}) {
    return await this._twitter.loadUser({userId, userName});
  },
  _loadFriendIds: async function () {
    return await this._twitter.loadUserFriendIds({userId: this._myUserId});
  },
  _loadUserTweetsAfter: async function ({userId, tweetId}) {
    return await this._twitter.loadUserTweetsAfter({userId, tweetId});
  },
  _updateReferencedUsers: async function (users, tweets) {
    var _this = this;
    var userIds = {};
    var add = addTwitterUser.bind(null, users);
    tweets = tweets.slice();

    for (var i = 0; i < tweets.length; i++) {
      var tweet = tweets[i];
      if (tweet.retweeted_status) {
        tweets.push(tweet.retweeted_status);
      }
      if (tweet.in_reply_to_status) {
        tweets.push(tweet.in_reply_to_status);
      }
      tweet.entities.urls.forEach(function (url) {
        if (url.linked_status) {
          tweets.push(url.linked_status);
        }
      });
    }

    tweets.forEach(function (tweet) {
      tweet.entities.user_mentions.forEach(add);
    });

    tweets.forEach(function (tweet) {
      if (!users[tweet.user.id_str]) {
        userIds[tweet.user.id_str] = true;
      }
    });

    await Promise.all(Object.keys(userIds).map(function (userId) {
      return _this.loadTwitterUser({userId}).then(add, function () {
        add({
          id_str: userId,
          empty: true
        });
      });
    }));
  },
  users: async function (users) {
    return await this._database.users(users);
  },
  _resolveLinkRedirects: async function (userAgent, tweet) {
    for (var i = 0; i < tweet.entities.urls.length; i++) {
      tweet.entities.urls[i].final_url = await location(userAgent, tweet.entities.urls[i].expanded_url);
    }
  },
  _resolveLinkedTweets: async function (userAgent, tweet) {
    if (tweet.retweeted_status) {
      await this._resolveLinkRedirects(this._userAgent, tweet.retweeted_status);
      await this._resolveLinkedTweets(this._userAgent, tweet.retweeted_status);
    }

    if (tweet.in_reply_to_status_id_str) {
      try {
        tweet.in_reply_to_status = await this._twitter.loadTweet({tweetId: tweet.in_reply_to_status_id_str});
      } catch (e) {
        debug('twitter-rss')('failed to resolve in_reply_to_status: ' + tweet.in_reply_to_status_id_str);
      }
      if (tweet.in_reply_to_status) {
        await this._resolveLinkRedirects(userAgent, tweet.in_reply_to_status);
      }
    }

    for (var i = 0; i < tweet.entities.urls.length; i++) {
      var url = new URL(tweet.entities.urls[i].final_url);
      var parts = url.pathname.split('/');
      if (url.host === 'twitter.com' && parts.length === 4 && parts[0] === '' && parts[2] === 'status') {
        try {
          tweet.entities.urls[i].linked_status = await this._twitter.loadTweet({tweetId: parts[3]});
        } catch (e) {
          debug('twitter-rss')('failed to resolve linked status: ' + url.href);
        }
        if (tweet.entities.urls[i].linked_status) {
          await this._resolveLinkRedirects(userAgent, tweet.entities.urls[i].linked_status);
        }
      }
    }
  },
  update: async function () {
    debug('twitter-rss')('start updating');
    var users = await this._database.users();

    var userIdsAtTwitter = await this._loadFriendIds();
    var userIdsInDatabase = await this._database.userIds();
    var queuedUserIds = await this._database.dequeueUserIds();

    var userIds = [this._myUserId]
      .concat(userIdsAtTwitter)
      .concat(userIdsInDatabase)
      .concat(queuedUserIds)
      .filter(function (userId, i, userIds) {
        return userIds.indexOf(userId) === i;
      })
      .sort(function (a, b) {
        if (!(a in users)) {
          return -1;
        }
        if (!(b in users)) {
          return 1;
        }
        return users[a].savedAt - users[b].savedAt;
      });

    await this._updateUsers({users, userIds});

    debug('twitter-rss')('finish updating');
  },
  loadUser: async function ({users, userName}) {
    var userId;
    Object.keys(users).some(function (_userId) {
      var user = users[_userId];
      if (user.userName === userName) {
        userId = _userId;
        return true;
      }
    });

    if (!userId) {
      return null;
    }
    return await this._database.loadUser({ userId });
  },
  addUser: async function (userId) {
    await this._database.enqueueUserId(userId);
  },
  _loadUser: async function ({users, userId}) {
    var user;

    user = await this._database.loadUser({ userId });
    if (!user) {
      user = await this.loadTwitterUser({ userId });
      addTwitterUser(users, user);
      user.tweets = [];
      await this._database.saveUser(user);
    }

    return user;
  },
  _updateUsers: async function ({users, userIds}) {
    var _this = this;
    var userIdsAtTwitter = await this._loadFriendIds();

    var userId;
    var user;
    for (var i = 0; i < userIds.length; i++) {
      debug('twitter-rss')('updating user ' + (i + 1) + ' of ' + userIds.length);

      userId = userIds[i];
      user = undefined;

      if (!users[userId]) {
        user = await this._loadUser({users, userId});
      }

      var loadedTweets = await this._loadUserTweetsAfter({userId, tweetId: users[userId].tweet});
      if (loadedTweets.length > 0) {
        debug('twitter-rss')('user ' + users[userId].fullName + ' @' + users[userId].userName + ' has new tweets');
        for (var j = 0; j < loadedTweets.length; j++) {
          debug('twitter-rss')('populating tweet ' + loadedTweets[j].id_str + ' ' + (j + 1) + ' of ' + loadedTweets.length);
          await this._resolveLinkRedirects(this._userAgent, loadedTweets[j]);
          await this._resolveLinkedTweets(this._userAgent, loadedTweets[j]);
        }

        debug('twitter-rss')('updating users');
        await this._updateReferencedUsers(users, loadedTweets);
        users[userId].tweet = Tweet.id(loadedTweets[loadedTweets.length - 1]);

        if (!user) {
          user = await this._loadUser({users, userId});
        }
        user.tweets = user.tweets.concat(loadedTweets);
        await this._database.saveUser(user);

        if (userIdsAtTwitter.indexOf(userId) >= 0) {
          await this._database.updateMostRecentTweets(loadedTweets);
        }
      }

      users[userId].savedAt = Date.now();
      await this._database.users(users);
    }
  }
};

function Database({directory}) {
  this._directory = directory;
}

Database.prototype = {
  _mostRecentTweetsCount: 100,
  _directory: null,
  _loadFile: async function ({file, initial}) {
    try {
      debug('twitter-rss')('loading ' + file);
      return JSON.parse(await fs.readFileAsync(this._directory + '/' + file));
    } catch (err) {
      return initial;
    }
  },
  _saveFile: function ({file, content}) {
    debug('twitter-rss')('saving ' + file);
    return fs.writeFileAsync(this._directory + '/' + file, JSON.stringify(content, null, 2));
  },

  dequeueUserIds: async function () {
    var userIds = await fs.readdirAsync(this._directory + consts.ADD_USER_QUEUE);
    for (var i = 0; i < userIds.length; i++) {
      await fs.unlinkAsync(this._directory + consts.ADD_USER_QUEUE + '/' + userIds[i]);
    }
    debug('twitter-rss')('dequeued user ids: ' + userIds.join(', '));
    return userIds;
  },

  enqueueUserId: async function (userId) {
    await this._saveFile({file: consts.ADD_USER_QUEUE + '/' + userId, content: null});
  },

  userIds: async function () {
    var users = await this.users();
    return Object.keys(users).filter(function (userId) {
      return !!users[userId].savedAt;
    });
  },
  loadUser: function ({userId}) {
    return this._loadFile({file: userId, initial: null});
  },
  users: async function (users) {
    if (users) {
      await this._saveFile({file: 'users', content: users});
    } else {
      return await this._loadFile({file: 'users', initial: {}});
    }
  },
  mostRecentTweets: async function () {
    return await this._loadFile({file: 'mostRecentTweets', initial: []});
  },
  saveUser: async function (user) {
    await this._saveFile({file: user.id_str, content: user});
  },
  updateMostRecentTweets: async function (tweets) {
    debug('twitter-rss')('updating most recent tweets');
    var _this = this;
    var mostRecentTweets = await _this.mostRecentTweets();
    tweets.forEach(function (tweet) {
      if (Tweet.isReply(tweet)) {
        return;
      }
      var oldestTweet = mostRecentTweets[mostRecentTweets.length - 1];
      if (mostRecentTweets.length === _this._mostRecentTweetsCount) {
        if (Tweet.isOlderThan(tweet, oldestTweet)) {
          return;
        }
        mostRecentTweets.pop();
      }

      for (var location = 0; location < mostRecentTweets.length; location++) {
        if (Tweet.isOlderThan(mostRecentTweets[location], tweet)) {
          break;
        }
      }

      mostRecentTweets.splice(location, 0, tweet);
      debug('twitter-rss')('adding to most recent: ' + Tweet.id(tweet));
    });
    await _this._saveFile({file: 'mostRecentTweets', content: mostRecentTweets});
  },
};

var configuration = require(process.argv[2]);

try {
  fs.mkdirSync(configuration.directory + consts.ADD_USER_QUEUE);
} catch (e) {
}

createServer({
  twitterRss: new TwitterRSS({
    userAgent: configuration.unshortenerUserAgent,
    myUserId: configuration.myUserId,
    directory: configuration.directory,
    consumerKey: configuration.consumerKey,
    consumerSecret: configuration.consumerSecret,
    accessTokenKey: configuration.accessTokenKey,
    accessTokenSecret: configuration.accessTokenSecret,
  }),
  bindIp: configuration.bindIp,
  bindPort: configuration.bindPort,
  baseUrl: configuration.baseUrl,
  basePath: configuration.basePath,
  count: configuration.count,
  updateInterval: configuration.updateInterval
});