# twitter-rss

Represent a Twitter user timeline as an RSS feed.

## Installing

    npm install -g twitter-rss

## Configuring

Copy, edit and save this example configuration file:

    {
      "count": 10,
      "bindPort": 1337,
      "bindIp": "127.0.0.1",
      "baseURL": "http://127.0.0.1:1337",
      "ttl": "60",
      "twitter": {
        "consumer_key": "TODO",
        "consumer_secret": "TODO",
        "access_token_key": "TODO",
        "access_token_secret": "TODO"
      }
    }

## Running

    twitter-rss /path/to/config/file

## Using

The URL for RSS feed of user `@example`, when configuration option `baseURL` is set to `"http://localhost:1337"`, is `http://localhost:1337/example`.
