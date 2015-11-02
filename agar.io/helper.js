'use strict';

const http = require('http');
const cors = require('cors');
const parseUrl = require('parseurl');
const bodyParser = require('body-parser');

const Client = require('./client');
const Bot = require('./bot');
const Clone = require('./clones');
const servers = require('./servers');

const { createUUID, timer } = require('./utils');

const { createOptions,
    helper: { options: defaults } } = require('./config');

class Helper extends Client {
    constructor(options) {
        super(options);

        // An unique ID for this instance
        this.id = createUUID();

        createOptions(this, defaults, options);

        this.bot = new Bot(this, options);

        this.expirationTimer = timer(this.checkExpiration.bind(this), 10000);
        this.expirationTimer();

        this.mainLoop = timer(this.bot.mainLoop.bind(this.bot), 100);
        this.timeout = timer(this.resume.bind(this), 5000);

        this.processing = false;

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
            this.mainLoop();
        });
    }

    set processing(bool) {
        this.joining = this.coordinating = bool;
    }

    get processing() {
        return (this.joining || this.coordinating) && Date.now() - this.lastRequest <= 10000;
    }

    get joined() {
        return !this.joining && this.webSocket && this.webSocket.readyState === this.webSocket.OPEN;
    }

    resume() {
        if (this.timeout.stop()) {
            this.processing = false;
            this.emit('session-resume');
        }
    }

    checkExpiration() {
        if (Date.now() - this.lastRequest >= 10000) {
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
        let { cors: corsOptions } = helper.options;

        if (corsOptions)
            corsHandler = typeof(corsOptions) === 'boolean' ? cors() : cors(corsOptions);

        let join = process.nextTick.bind(process, helper.join.bind(helper)),
            coordinate = procress.nextTick.bind(process, helper.coordinate.bind(helper));

        function delegate(method, request, response, next) {
            if (corsHandler) {
                corsHandler(request, response, error => {
                    if (error) next(error);
                    else {
                        jsonParser(request, response, error => {
                            if (error) next(error);
                            else {
                                helper.authenticate(request, response, method);
                            }
                        });
                    }
                });
            }
            else {
                jsonParser(request, response, error => {
                    if (error) next(error);
                    else {
                        helper.authenticate(request, response, method);
                    }
                });
            }
        }

        return function agarioHelper(request, response, next) {
            let path = parseUrl(request).pathname;
            if (path === '/:agar-bot/coordinate') delegate(coordinate, request, response, next);
            else if (path === '/:agar-bot/connect') delegate(join, request, response, next);
            else next();
        };
    }

    authenticate(request, response, next) {
        let data = request.body;

        if (this.timeout.active)
            return response.sendStatus(503); // Service Unavailable
        else if (data == null || data.secretKey !== this.secretKey)
            return response.sendStatus(401); // Unauthorized
        else next();
    }


    otherStuff() {
        if (!joined || helper.server !== data.server) {
            helper.update(data);

            if (helper.processing)
                return status(202); // Accepted

            helper.joining = true;
            process.nextTick(helper.join);
            return status(200); // OK
        }

        if (joined && (data.x !== helper.session.x || data.y !== helper.session.y)) {
            helper.update(data);

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
            helper.timeout(); // Processing updates will resume after 20 seconds
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

        let thatBot = Clone.bots[id];
        let master = Clone.bots[this.lastMaster];

        // Avoiding going to slaves if the bot has gained mass
        if (!this.bot || (isSlave && this.bot.size > 200))
            return this.coordinating = false;

        if (thatBot) {
            if (this.lastMaster !== id) { // We're not heading toward that bot.
                if (thatBot.update(x, y, this.bot) || !isSlave) { // That bot is moving or assume master is active
                    // Return if this bot is bigger than the slave bot
                    if (isSlave && !Bot.isThreat(this.bot, {size: size}))
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
                master.update(x, y, this.bot);

                this.setMaster(master);
                this.log('Destination(' + (isSlave ? 'slave' : 'master') + '): ', x, y);
            }
        }
        else {
            Clone.bots[id] = new Clone(id, x, y, this.bot);
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