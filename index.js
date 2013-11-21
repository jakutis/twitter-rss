var fs = require('fs');
var http = require('http');
var twitter = require('twitter');
var RSS = require('rss');

var cfgFilename = fs.realpathSync(process.argv[2]);

console.log('Reading configuration file ' + cfgFilename);
var cfg = JSON.parse(fs.readFileSync(cfgFilename));

var twit = new twitter({
    consumer_key: cfg.twitter.consumer_key,
    consumer_secret: cfg.twitter.consumer_secret,
    access_token_key: cfg.twitter.access_token_key,
    access_token_secret: cfg.twitter.access_token_secret
});

http.createServer(function (req, res) {
    var screenName = req.url.substr(1);
    twit.get('/statuses/user_timeline.json', {
        screen_name: screenName,
        count: cfg.count
    }, function(tweets) {
        if(tweets instanceof Error) {
            res.writeHead(404);
            res.end();
            return;
        }
        if(tweets.length < 1) {
            res.writeHead(204);
            res.end();
            return;
        }
        var user = tweets[0].user;
        var feed = new RSS({
            title: cfg.count + ' most recent tweets by ' + screenName,
            description: cfg.count + ' most recent tweets by ' + screenName,
            feed_url: cfg.baseURL + '/' + screenName,
            site_url: 'https://twitter.com/' + screenName,
            image_url: user.profile_image_url,
            author: user.name,
            pubDate: tweets[0].created_at,
            ttl: cfg.ttl
        });
        tweets.forEach(function(tweet) {
            feed.item({
                title: tweet.text,
                description: tweet.text,
                url: 'https://twitter.com/' + screenName + '/status/id_str',
                date: tweet.created_at
            });
        });
        res.writeHead(200, {
            'Content-Type': 'application/rss+xml'
        });
        res.end(feed.xml());
    });
}).listen(cfg.bindPort, cfg.bindIp);

console.log('Server running at http://' + cfg.bindIp + ':' + cfg.bindPort + '/');
