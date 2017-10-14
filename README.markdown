# twitter-rss

Represent a Twitter user timeline as an RSS feed.

- [Overview](#overview)
- [Installation](#installation)
- [CLI](#cli)

## Overview

- saves followed users tweets to file system
- provides endpoint `/tweets` returns RSS feed of most recent tweets from your Twitter homepage
- provides endpoints `/user/{screen name}/tweets` return RSS feed of most recent tweets from the specified user

## Installation

  Install with [npm](https://www.npmjs.org/package/twitter-rss):

    $ npm install --global twitter-rss


  Then copy, edit and save this example configuration file:

    {
      "baseURL": "http://127.0.0.1:1337",
      "basePath": "/twitter",
      "count": 100,
      "updateInterval": 15,
      "myUserId": "2801964827",
      "directory": "/data/twitter",
      "consumerKey": "TODO",
      "consumerSecret": "TODO",
      "accessTokenKey": "TODO",
      "accessTokenSecret": "TODO"
      "bindPort": 1337,
      "bindIp": "127.0.0.1",
      "unshortenerUserAgent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36"
    }

  You can get the keys and secrets by creating a Twitter app at <https://apps.twitter.com/>.

## CLI

  Run:

    $ twitter-rss /path/to/config/file

  The URL for RSS feed of user `@example`, when configuration option `baseURL` is set to `"http://localhost:1337"` and `basePath` to `"/twitter"`, is `http://localhost:1337/twitter/user/example/tweets`.
