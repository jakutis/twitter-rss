var fs = require('fs');
var url = require('url');
var http = require('http');
var twitter = require('twitter');
var RSS = require('rss');
var async = require('async');

var cfgFilename = fs.realpathSync(process.argv[2]);

console.log('Reading configuration file ' + cfgFilename + '.');
var cfg = JSON.parse(fs.readFileSync(cfgFilename));

var twit = new twitter({
    consumer_key: cfg.twitter.consumer_key,
    consumer_secret: cfg.twitter.consumer_secret,
    access_token_key: cfg.twitter.access_token_key,
    access_token_secret: cfg.twitter.access_token_secret
});

var basePath = url.parse(cfg.baseURL).path;
if(basePath === '/') {
    basePath = '';
}

var tweets = function(path, screenName, cb) {
    twit.get(path, {
        screen_name: screenName,
        count: cfg.count
    }, function(tweets) {
        if(tweets instanceof Error) {
            return cb(tweets);
        }
        if(tweets.length < 1) {
            return cb(new Error('no tweets'));
        }
        cb(null, tweets);
    });
};

var rss = function(title, screenName, feedPath, profilePath, cb) {
    return function(err, tweets) {
        if(err) {
            return cb(err);
        }
        var user = tweets[0].user;
        var feed = new RSS({
            title: cfg.count + ' most recent ' + title + ' by ' + screenName,
            description: cfg.count + ' most recent ' + title + ' by ' + screenName,
            feed_url: cfg.baseURL + '/' + screenName + feedPath,
            site_url: 'https://twitter.com/' + screenName + profilePath,
            image_url: user.profile_image_url,
            author: user.name,
            pubDate: tweets[0].created_at,
            ttl: cfg.ttl
        });
        tweets.forEach(function(tweet) {
            feed.item({
                title: tweet.text,
                description: tweet.text,
                url: 'https://twitter.com/' + tweet.screen_name + '/status/' + tweet.id_str,
                date: tweet.created_at
            });
        });
        cb(null, feed.xml());
    };
};

var timelineTweets = function(screenName, cb) {
    tweets('/statuses/user_timeline.json', screenName, cb);
};

var favoritesTweets = function(screenName, cb) {
    tweets('/favorites/list.json', screenName, cb);
};

var allTweets = function(screenName, cb) {
    async.auto({
        timeline: timelineTweets.bind(null, screenName),
        favorites: favoritesTweets.bind(null, screenName)
    }, function(err, tweets) {
        if(err) {
            return cb(err);
        }
        var allTweets = tweets.timeline.slice();
        allTweets.push.apply(allTweets, tweets.favorites);
        cb(null, allTweets);
    });
};

var timeline = function(screenName, cb) {
    timelineTweets(screenName, rss('original tweets', screenName, '', '', cb));
};

var favorites = function(screenName, cb) {
    favoritesTweets(screenName, rss('favorites', screenName, '/favorites', '/favorites', cb));
};

var all = function(screenName, cb) {
    allTweets(screenName, rss('all tweets', screenName, '', '', cb));
};

http.createServer(function (req, res) {
    var path = req.url.substr(basePath.length + 1);
    var handle = function(err, xml) {
        if(err) {
            res.writeHead(404, {
                'Content-Type': 'text/plain'
            });
            res.end(err.toString());
            return;
        }
        res.writeHead(200, {
            'Content-Type': 'application/rss+xml'
        });
        res.end(xml);
    };
    if(path.indexOf('/') < 0) {
        all(path, handle);
    } else {
        var screenName = path.substr(0, path.indexOf('/'));
        var type = path.substr(path.indexOf('/') + 1);
        if(type === 'timeline') {
            timeline(screenName, handle);
        } else if(type === 'all') {
            all(screenName, handle);
        } else if(type === 'favorites') {
            favorites(screenName, handle);
        } else {
            handle(new Error('unknown type ' + type));
        }
    }
}).listen(cfg.bindPort, cfg.bindIp);

console.log('HTTP server running on port ' + cfg.bindPort + ' bound to ip ' + cfg.bindIp + ' with base URL set to ' + cfg.baseURL + '.');
