# agario-helper

agar.io suicide bot implementation

### WARNING: Its unstable! Don't bother unless you really know what your doing. Check back soon!

You will need to modify the agar.io client using for example a TamperMonkey script such as [ZeachCobbler](https://github.com/RealDebugMonkey/ZeachCobbler)
or [Apostolique/Agar.io-bot](https://github.com/Apostolique/Agar.io-bot).

Basically you send(post) the x, y, cell id, and nickname to the helper's server periodically.
I will provide step by step instructions and/or modified TamperMonkey scripts at some point in the future.
The helper isn't quite ready yet. ***To be continued...***

## Running Locally

```sh
git clone https://github.com/dcoderWar/agario-helper.git # or clone your own fork
cd agario-helper
npm install
npm start
```

Your app should now be running on [localhost:5000](http://localhost:5000/).

## Deploying to Heroku

Make sure you have [Node.js](http://nodejs.org/) and the [Heroku Toolbelt](https://toolbelt.heroku.com/) installed.

```
heroku create
git push heroku master
heroku open
```

Alternatively, you can deploy your own copy of the app using the web-based flow:

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

## Dependencies

- [body-parser](https://github.com/expressjs/body-parser): Node.js body parsing middleware
- [cors](https://github.com/expressjs/cors): middleware for dynamically or statically enabling CORS in express/connect applications
- [express](https://github.com/strongloop/express): Fast, unopinionated, minimalist web framework
- [parseurl](https://github.com/expressjs/parseurl): parse a url with memoization
- [serve-favicon](https://github.com/expressjs/serve-favicon): favicon serving middleware with caching
- [ws](https://github.com/websockets/ws): simple to use, blazing fast and thoroughly tested websocket client, server and console for node.js, up-to-date against RFC-6455

## Dev Dependencies

- [pretty-error](https://github.com/AriaMinaei/pretty-error): See nodejs errors with less clutter


## License

MIT
