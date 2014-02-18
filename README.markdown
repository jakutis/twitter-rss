# twitter-rss

Represent a Twitter user timeline as an RSS feed.

- [Overview](#overview)
- [Installation](#installation)
- [CLI](#cli)
- [Development](#development)

## Overview

    TODO

## Installation

  Install with [npm](https://www.npmjs.org/package/twitter-rss):

    $ npm install --global twitter-rss


  Then copy, edit and save this example configuration file:

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

## CLI

  Run:

    $ twitter-rss /path/to/config/file

  The URL for RSS feed of user `@example`, when configuration option `baseURL` is set to `"http://localhost:1337"`, is `http://localhost:1337/example`.

## Development

    TODO

