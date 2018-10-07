# sparrow
A configurable dashboard for Wikipedia editors.

## Configuration

There must be a config.ini file located at www/python/src/config.ini.
It should contain one section, named CREDS, and four keys:
`CONSUMER_KEY` and `CONSUMER_SECRET` from the OAuth setup,
`SECRET_KEY` for Flask, and `OAUTH_MWURI` to indicate the endpoint of
the wiki we're connecting to. For the English Wikipedia, this would be
`https://en.wikipedia.org/w/index.php`.
