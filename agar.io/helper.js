'use strict';

const Client = require('./client');
const Bot = require('./bot');
const Clone = require('./clones');
const servers = require('./servers.js');
const cors = require('cors');
const { createUUID } = require('./utils');
const timer = require('./timer');
const http = require('http');
const parseUrl = require('parseurl');
const bodyParser = require('body-parser');

// The helper is meant to be continuously updated or completely idle
// The session will expire 30 seconds after the last update

// @TODO server requests maybe should be spaced out, perhaps random? 100ms - 300ms
// @TODO finish integrating old code!!!

const defaultOptions = {
    path: '/update', // The path to receive updates
    // See: https://www.npmjs.com/package/cors - for detailed information on available options
    // Pass an object i.e. cors: { origin: 'http://agar.io' } or pass true to use the defaults, false to disable
    cors: true, // Useful i.e. if needing to connect using a TamperMonkey script that modifies agar.io(The origin)
    clones: null, // A list of host names or addresses to clones that this bot should communicate with
    secretKey: null // A key that only this bot, clones, and the client are aware of
};

const defaultSession = {
    test: null,
    name: 'agario-helper', // The nickname of the player
    leaders: [], // The current names on the leaderboard
    region: 'US-Atlanta', // The current region
    x: 0, y: 0, // The current position of the actual player
    id: null, // The id of client that last updated this session, not the cell id, uh, everything is unstable atm!
    target: null, // The hostname of this bot when this bot is the target to be updated, or a clone's hostname
    server: null // The server's url i.e. scheme://address:port, the scheme should be "ws"
};

const validOptionKeys = Object.keys(defaultOptions), validSessionKeys = Object.keys(defaultSession);

class Helper extends Client {
    constructor(options) {
        super(options);

        // An unique ID for this instance
        this.id = createUUID();

        // Set default options
        this.options = Object.create(defaultOptions);
        this.session = Object.create(defaultSession);

        if (options) {
            validOptionKeys.forEach(key => {
                if (options.hasOwnProperty(key))
                    this.options[key] = options[key];
            });

            ['clones', 'secretKey'].forEach(key => {
                this[key] = this.options[key]
            });
        }

        this.bot = new Bot(this);

        this.expire = timer(this.expire.bind(this), 30000).start();
        this.mainLoop = timer(this.bot.mainLoop.bind(this.bot), 100);
        this.timeout = timer(this.timeout.bind(this), 20000);

        this.processing = false;

        this.join = this.join.bind(this);
        this.coordinate = this.coordinate.bind(this);

        this.on('reset', reason => {
            if (this.mainLoop.stop() && reason === 'disconnect')
                this.emit('session-end');
        });

        this.on('player-death', reason => {
            if (reason === 'eaten')
                this.spawn(this.session.name);
        });

        this.on('leaderboard-update', iDs => {
            if (this.joined) return;

            let leaders = this.session.leaders, cells = this.cells, count = 0;

            if (leaders.length) {
                iDs.forEach(id => {
                    if (leaders.indexOf(cells[id].name) !== -1) count++;
                });

                if (count <= 4) {
                    this.emit('session-mismatch', this.session);
                    return this.disconnect();
                }
            }

            this.lastJoin = Date.now();
            this.joining = false;

            this.spawn(this.session.name);
            this.mainLoop.start();
        });
    }

    set processing(bool) {
        this.joining = this.coordinating = bool;
    }

    get processing() {
        return (this.joining || this.coordinating) && Date.now() - this.lastRequest <= 10000;
    }

    get expired() {
        return Date.now() - this.lastRequest >= 60000;
    }

    get joined() {
        return !this.joining && this.webSocket && this.webSocket.readyState === this.webSocket.OPEN;
    }

    timeout() {
        if (this.timeout.stop()) {
            this.processing = false;
            this.emit('session-resume');
        }
    }

    expire() {
        if (!this.timeout.active && this.expired) {
            if (this.mainLoop.active || this.webSocket.readyState !== this.webSocket.CLOSED) {
                this.emit('session-expire');
                this.disconnect();
            }
        }
    }

    static getFFAServer(session, callback) {
        return servers.getFFAServer(session, callback)
    }

    static middleware(options) {
        return (new Helper(options)).middleware();
    }

    middleware() {
        let helper = this, jsonParser = bodyParser.json(), corsHandler;
        let { path, cors: corsOptions } = helper.options;

        if (corsOptions)
            corsHandler = typeof(corsOptions) === 'boolean' ? cors() : cors(corsOptions);

        return function agarioHelper(request, response, next) {
            if (parseUrl(request).pathname === path) {
                if (corsHandler) {
                    corsHandler(request, response, error => {
                        if (error) next(error);
                        else {
                            jsonParser(request, response, error => {
                                if (error) next(error);
                                else {
                                    helper.receive(request, response);
                                }
                            });
                        }
                    });
                }
                else {
                    jsonParser(request, response, error => {
                        if (error) next(error);
                        else {
                            helper.receive(request, response);
                        }
                    });
                }
            }
            else {
                next();
            }
        };
    }

    receive({ body: session }, response) {
        let helper = this, joined = helper.joined;

        let status = (response && response.sendStatus) ?
            (code => response.sendStatus(code)) : (code => code);

        if (helper.timeout.active)
            return status(503); // Service Unavailable

        if (session == null || session.secretKey !== helper.secretKey)
            return status(401); // Unauthorized

        if (session.server == null || session.id == null || isNaN(session.x) || isNaN(session.y))
            return status(400); // Bad Request

        if (helper.clones && helper.clones.indexOf(session.target) === -1)
            return status(400); // Bad Request

        if (!joined || helper.server !== session.server) {
            helper.update(session);

            if (helper.processing)
                return status(202); // Accepted

            helper.joining = true;
            process.nextTick(helper.join);
            return status(200); // OK
        }

        if (joined && (session.x !== helper.session.x || session.y !== helper.session.y)) {
            helper.update(session);

            if (helper.processing)
                return status(202); // Accepted

            helper.coordinating = true;
            process.nextTick(helper.coordinate);
            return status(200); // OK
        }

        return status(300); // Not Modified
    }

    update(session) {
        validSessionKeys.forEach(key => {
            if (session.hasOwnProperty(key))
                this.session[key] = session[key];
        });
    }

    join(attempts) {
        let helper = this;
        let { session, webSocket } = helper;

        helper.lastRequest = Date.now();

        if (attempts === undefined) attempts = 0;

        // Delay joining a new session until the end of the current session
        if (helper.mainLoop.active || (webSocket && webSocket.readyState !== webSocket.CLOSED)) {
            helper.joining = false; // prevent a deadlock

            helper.emit('session-pending');

            // No need to stop the main loop, the disconnect listener will take care of that
            return helper.disconnect();
        }

        if (attempts >= 50) {
            helper.timeout.start(); // Processing updates will resume after 20 seconds
            return helper.emit('session-timeout');
        }

        helper.emit('server-request', attempts);

        Helper.getFFAServer(session, response => {
            let { session } = helper; // Get the updated session object

            if (!response.server) {
                helper.emit('server-error', response);

                return this.join(++attempts);
            }

            response.server = 'ws://' + response.server;

            if (session.server !== response.server) {
                helper.emit('server-mismatch', response);

                return this.join(++attempts);
            }

            helper.emit('session-attempt', response);
            helper.connect(response.server, response.key);
        });
    }

    setMaster(master) {
        // The following throws the bot into slave mode
        this.bot.masterLocation = [master.x, master.y];
        this.bot.isSlave = true;
        this.bot.masterID = this.session.test;
        /* @TODO */
        this.bot.masterLastSeen = Date.now();
    }

    getXYSize() {
        let player = this.bot.player;

        // Ensure that the only properties on the returned object are x, y, and size
        return player ? {x: player.x, y: player.y, size: player.size} : undefined;
    }

    coordinate() {
        let { id, x, y, size } = this.session;
        let isSlave = (id !== 'master');

        this.lastRequest = Date.now();

        let thisBot = this.bot.player;

        let thatBot = Clone.bots[id];
        let master = Clone.bots[this.lastMaster];

        // Avoiding going to slaves if the bot has gained mass
        if (!thisBot || (isSlave && thisBot.size > 200))
            return this.coordinating = false;

        if (thatBot) {
            if (this.lastMaster !== id) { // We're not heading toward that bot.
                if (thatBot.update(x, y, thisBot) || !isSlave) { // That bot is moving or assume master is active
                    // Return if this bot is bigger than the slave bot
                    if (isSlave && !Bot.isThreat(thisBot, {size: size}))
                        return this.coordinating = false;

                    if (!master || master.dist > thatBot.dist) {
                        this.lastMaster = id;

                        this.bot.goingToSlave = isSlave;
                        this.setMaster(thatBot);
                        this.log('Destination(new ' + (isSlave ? 'slave' : 'master') + '): ', x, y);
                    }

                }
                else {
                    this.log(id + ' is not moving!!');
                }
            }
            else if (master) { // Already targeting that bot or master so just update the coordinates
                master.update(x, y, thisBot);

                this.setMaster(master);
                this.log('Destination(' + (isSlave ? 'slave' : 'master') + '): ', x, y);
            }
        }
        else {
            Clone.bots[id] = new Clone(id, x, y, thisBot);
        }

        this.coordinating = false;
    }

    toString() {
        return this.bot.toString();
    }
}
/*
 const { EventEmitter } = require('events');
 Helper.prototype.emit = function emit(event,...args) {
 console.log(event);
 EventEmitter.prototype.emit.call(this, event, ...args);
 };
 */

module.exports = Helper;


/*
 let postOptions = {
 port: '80',
 path: '/master',
 method: 'POST',
 headers: {
 'Content-Type': 'application/json; charset=utf-8',
 'X-Requested-With': 'XMLHttpRequest'
 }
 };


 function relay(session) {
 let postData;

 if (session.relay) {
 postOptions.path = '/master';
 postData = {
 server: session.server,
 region: session.region,
 name: session.name,
 leaders: session.leaders,
 x: session.x, y: session.y
 };
 }
 else {
 postOptions.path = '/slave';
 postData = helper.getData();

 if (!postData) return;
 }

 postData.id = Helper.id;

 clients.forEach(function postRequest(host) {
 if (host === session.target) return;

 postData.target = host;
 helper.log('Letting ' + postOptions.path + ' [ ' + host + ' ] know about the new location...');

 let rawData = JSON.stringify(postData);

 postOptions.hostname = host;
 postOptions.headers['Content-Length'] = Buffer.byteLength(rawData);

 let req = http.request(postOptions, function (res) {
 helper.log(host + ': STATUS -> ' + res.statusCode);
 });

 req.on('error', function (err) {
 helper.log(host + ': ERROR -> ' + err.message);
 });

 req.end(rawData);
 });
 }
 */