var WebSocket = require('ws');
var Packet = require('./packet.js');
var EventEmitter = require('events').EventEmitter;

Client.Ball = Ball;
module.exports = Client;

function Client(name) {
    //you can change this values
    this.name = name; //name used for log
    this.debug = 1;           //debug level, 0-5 (5 will output extremely lot of data)
    this.inactive_destroy = 5 * 60 * 1000;   //time in ms when to destroy inactive cells
    this.inactive_check = 10 * 1000;     //time in ms when to search inactive cells
    this.spawn_interval = 200;	 //time in ms for respawn interval. 0 to disable (if your custom server don't have spawn problems)
    this.spawn_attempts = 25;		 //how much attempts to spawn before give up (official servers do have unstable spawn problems)

    //don't change things below if you don't understand what you're doing

    this.tick_counter = 0;    //number of ticks (packet ID 16 counter)
    this.inactive_interval = 0;    //ID of setInterval()
    this.cells = {};   //all cells
    this.playerIDs = [];   //IDs of my cells
    this.score = 0;    //my score
    this.leaders = [];   //IDs of leaders in FFA mode
    this.teams_scores = [];   //scores of teams in Teams mode
    this.facebook_key = '';   //facebook key. Check README.md how to get it
    this.spawn_attempt = 0;    //attempt to spawn
    this.spawn_interval_id = 0;    //ID of setInterval()
}

Client.prototype = {
    connect: function (server, key) {
        var headers = {
            'Origin': 'http://agar.io'
        };

        this.webSocket = new WebSocket(server, null, {headers: headers});
        this.webSocket.binaryType = "arraybuffer";
        this.webSocket.onopen = this.onConnect.bind(this);
        this.webSocket.onmessage = this.onMessage.bind(this);
        this.webSocket.onclose = this.onDisconnect.bind(this);
        this.webSocket.onerror = this.onError.bind(this);
        this.server = server;
        console.log(server, key);
        this.key = key;

        if (this.debug >= 1) {
            if (!key) this.log('[warning] You did not specified "key" for Client.connect(server, key)\n' +
                '          If server will not accept you, this may be the problem');
            this.log('connecting...');
        }

        this.emit('connecting');
    },

    disconnect: function () {
        if (this.debug >= 1)
            this.log('disconnect() called');

        this.webSocket.close();
    },

    onConnect: function () {
        var client = this;

        if (this.debug >= 1)
            this.log('connected to server');

        this.inactive_interval = setInterval(this.destroyInactive.bind(this), this.inactive_check);

        var buf = new Buffer(5);
        buf.writeUInt8(254, 0);
        buf.writeUInt32LE(5, 1);
        this.send(buf);

        buf = new Buffer(5);
        buf.writeUInt8(255, 0);
        buf.writeUInt32LE(154669603, 1);
        this.send(buf);

        if (this.key) {
            buf = new Buffer(1 + this.key.length);
            buf.writeUInt8(80, 0);
            for (var i = 1; i <= this.key.length; ++i) {
                buf.writeUInt8(this.key.charCodeAt(i - 1), i);
            }
            this.send(buf);
        }
        if (this.facebook_key) {
            buf = new Buffer(1 + this.facebook_key.length);
            buf.writeUInt8(81, 0);
            for (i = 1; i <= this.facebook_key.length; ++i) {
                buf.writeUInt8(this.facebook_key.charCodeAt(i - 1), i);
            }
            this.send(buf);
        }

        if (client.debug >= 2)
            client.log('emit connected event');
        client.emit('connected');
    },

    onError: function (e) {
        if (this.debug >= 1)
            this.log('connection error: ' + e);

        this.emit('connection-error', e);
        this.reset('connection-error');
    },

    onDisconnect: function () {
        if (this.debug >= 1)
            this.log('disconnected');

        this.emit('disconnect');
        this.reset('disconnect');
    },

    onMessage: function (e) {
        var packet = new Packet(e);
        var packet_id = packet.readUInt8();
        var processor = this.processors[packet_id];
        if (!processor) return this.log('[warning] unknown packet ID(' + packet_id + '): ' + packet.toString());

        if (this.debug >= 4)
            this.log('RECV packet ID=' + packet_id + ' LEN=' + packet.length);
        if (this.debug >= 5)
            this.log('dump: ' + packet.toString());

        this.emit('message', packet);
        processor(this, packet);
    },

    send: function (buf) {
        if (this.debug >= 4)
            this.log('SEND packet ID=' + buf.readUInt8(0) + ' LEN=' + buf.length);

        if (this.debug >= 5)
            this.log('dump: ' + (new Packet(buf).toString()));

        this.webSocket.send(buf);
    },

    reset: function (reason) {
        if (this.debug >= 3)
            this.log('reset(' + reason + ')');

        clearInterval(this.inactive_interval);
        clearInterval(this.spawn_interval_id);
        this.spawn_interval_id = 0;
        this.leaders = [];
        this.teams_scores = [];
        this.playerIDs = [];
        this.spawn_attempt = 0;

        for (var k in this.cells) if (this.cells.hasOwnProperty(k)) this.cells[k].destroy('reset');
        this.emit('reset', reason);
    },

    destroyInactive: function () {
        var time = Date.now();

        if (this.debug >= 3)
            this.log('destroying inactive cells');

        for (var k in this.cells) {
            if (!this.cells.hasOwnProperty(k)) continue;
            var cell = this.cells[k];
            if (time - cell.last_update < this.inactive_destroy) continue;
            if (cell.visible) continue;

            if (this.debug >= 3)
                this.log('destroying inactive ' + cell);

            cell.destroy('inactive');
        }
    },

    processors: {
        //tick
        '16': function (client, packet) {
            var eaters_count = packet.readUInt16LE();

            client.tick_counter++;

            //reading eat events
            for (var i = 0; i < eaters_count; i++) {
                var eater_id = packet.readUInt32LE();
                var eaten_id = packet.readUInt32LE();

                if (client.debug >= 4)
                    client.log(eater_id + ' ate ' + eaten_id + ' (' + client.cells[eater_id] + '>' + client.cells[eaten_id] + ')');

                var player = client.cells[eater_id];
                if (!player)
                    player = new Ball(client, eater_id);
                player.update();
                if (client.cells[eaten_id]) client.cells[eaten_id].destroy('eaten', eater_id);

                client.emit('something-ate', player, client.cells[eaten_id]);
                if (player.mine)
                    client.emit('player-ate', client.cells[eaten_id], player);
            }


            //reading actions of cells
            while (1) {
                var is_virus = false;
                var cell_id;
                var coordinate_x;
                var coordinate_y;
                var size;
                var color;
                var nick = null;

                cell_id = packet.readUInt32LE();
                if (cell_id == 0) break;
                coordinate_x = packet.readSInt32LE();
                coordinate_y = packet.readSInt32LE();
                size = packet.readSInt16LE();

                var color_R = packet.readUInt8();
                var color_G = packet.readUInt8();
                var color_B = packet.readUInt8();

                color = (color_R << 16 | color_G << 8 | color_B).toString(16);
                color = '#' + ('000000' + color).substr(-6);

                var opt = packet.readUInt8();
                is_virus = !!(opt & 1);
                var something_1 = !!(opt & 16); //todo what is this?

                //reserved for future use?
                if (opt & 2) {
                    packet.offset += packet.readUInt32LE();
                }
                if (opt & 4) {
                    var something_2 = ''; //todo something related to premium skins
                    while (1) {
                        var char = packet.readUInt8();
                        if (char == 0) break;
                        if (!something_2) something_2 = '';
                        something_2 += String.fromCharCode(char);
                    }
                }

                while (1) {
                    char = packet.readUInt16LE();
                    if (char == 0) break;
                    if (!nick) nick = '';
                    nick += String.fromCharCode(char);
                }

                var cell = client.cells[cell_id] || new Ball(client, cell_id);
                cell.color = color;
                cell.virus = is_virus;
                cell.setCords(coordinate_x, coordinate_y);
                cell.setSize(size);
                if (nick) cell.setName(nick);
                cell.update_tick = client.tick_counter;
                cell.appear();
                cell.update();

                if (client.debug >= 5)
                    client.log('action: cell_id=' + cell_id + ' coordinate_x=' + coordinate_x + ' coordinate_y=' + coordinate_y + ' size=' + size + ' is_virus=' + is_virus + ' nick=' + nick);

                client.emit('cellAction', cell_id, coordinate_x, coordinate_y, size, is_virus, nick);
            }

            var cells_on_screen_count = packet.readUInt32LE();

            //disappear events
            for (i = 0; i < cells_on_screen_count; i++) {
                cell_id = packet.readUInt32LE();

                cell = client.cells[cell_id] || new Ball(client, cell_id);
                cell.update_tick = client.tick_counter;
                cell.update();
                if (cell.mine) {
                    cell.destroy('merge', cell.id);
                    client.emit('merge', cell.id);
                } else {
                    cell.disappear();
                }
            }
        },

        //update spectating coordinates in "spectate" mode
        '17': function (client, packet) {
            var x = packet.readFloat32LE();
            var y = packet.readFloat32LE();
            var zoom = packet.readFloat32LE();

            if (client.debug >= 4)
                client.log('spectate FOV update: x=' + x + ' y=' + y + ' zoom=' + zoom);

            client.emit('spectateFieldUpdate', x, y, zoom);
        },

        '20': function () {
            //i dont know what this is
            //in original code it clears our cells array, but i never saw this packet
        },

        //new ID of your cell (when you join or press space)
        '32': function (client, packet) {
            var cell_id = packet.readUInt32LE();
            var cell = client.cells[cell_id] || new Ball(client, cell_id);
            cell.mine = true;
            if (!client.playerIDs.length) client.score = 0;
            client.playerIDs.push(cell_id);

            if (client.debug >= 2)
                client.log('my new cell: ' + cell_id);

            if (client.spawn_interval_id) {
                if (client.debug >= 4)
                    client.log('detected new cell, disabling spawn() interval');
                client.spawn_attempt = 0;
                clearInterval(client.spawn_interval_id);
                client.spawn_interval_id = 0;
            }

            client.emit('player-cell-gain', cell_id);
        },

        //leaderboard update in FFA mode
        '49': function (client, packet) {
            var users = [];
            var count = packet.readUInt32LE();

            for (var i = 0; i < count; i++) {
                var id = packet.readUInt32LE();

                var name = '';
                while (1) {
                    var char = packet.readUInt16LE();
                    if (char == 0) break;
                    name += String.fromCharCode(char);
                }

                users.push(id);
                var cell = client.cells[id] || new Ball(client, id);
                if (name) cell.setName(name);
                cell.update();
            }

            if (JSON.stringify(client.leaders) == JSON.stringify(users)) return;
            var old_leaders = client.leaders;
            client.leaders = users;

            if (client.debug >= 2)
                client.log('leaders update: ' + JSON.stringify(users));

            client.emit('leaderboard-update', users, old_leaders);
        },

        //teams scored update in teams mode
        '50': function (client, packet) {
            var teams_count = packet.readUInt32LE();
            var teams_scores = [];

            for (var i = 0; i < teams_count; ++i) {
                teams_scores.push(packet.readFloat32LE());
            }

            if (JSON.stringify(client.teams_scores) == JSON.stringify(teams_scores)) return;
            var old_scores = client.teams_scores;

            if (client.debug >= 2)
                client.log('teams scores update: ' + JSON.stringify(teams_scores));

            client.teams_scores = teams_scores;

            client.emit('teamsScoresUpdate', old_scores, teams_scores);
        },

        //map size load
        '64': function (client, packet) {
            var min_x = packet.readFloat64LE();
            var min_y = packet.readFloat64LE();
            var max_x = packet.readFloat64LE();
            var max_y = packet.readFloat64LE();

            if (client.debug >= 2)
                client.log('map size: ' + [min_x, min_y, max_x, max_y].join(','));

            client.emit('map-size-update', min_x, min_y, max_x, max_y);
        },

        //another unknown backet
        '72': function () {
            //packet is sent by server but not used in original code
        },

        '81': function (client, packet) {
            var level = packet.readUInt32LE();
            var curernt_exp = packet.readUInt32LE();
            var need_exp = packet.readUInt32LE();

            if (client.debug >= 2)
                client.log('experience update: ' + [level, curernt_exp, need_exp].join(','));

            client.emit('experience-update', level, curernt_exp, need_exp);
        },

        '240': function (client, packet) {
            packet.offset += 4;
            var packet_id = packet.readUInt8();
            var processor = client.processors[packet_id];
            if (!processor) return client.log('[warning] unknown packet ID(240->' + packet_id + '): ' + packet.toString());
            processor(client, packet);
        },

        //somebody won, end of the game (server restart)
        '254': function (client) {
            if (client.debug >= 1)
                client.log(client.cells[client.leaders[0]] + ' WON THE GAME! Server going for restart');

            client.emit('winner', client.leaders[0]);
        }
    },

    updateScore: function () {
        var potential_score = 0;
        for (var i = 0; i < this.playerIDs.length; i++) {
            var cell_id = this.playerIDs[i];
            var cell = this.cells[cell_id];
            potential_score += Math.pow(cell.size, 2);
        }
        var old_score = this.score;
        var new_score = Math.max(this.score, Math.floor(potential_score / 100));

        if (this.score == new_score) return;
        this.score = new_score;
        this.emit('score-update', old_score, new_score);

        if (this.debug >= 2)
            this.log('score: ' + new_score);

    },

    log: function (msg) {
        console.log(this.name + ': ' + msg);
    },

    //functions that you can call to control your cells

    //spawn cell
    spawn: function (name) {
        if (this.debug >= 3)
            this.log('spawn() called, name=' + name);

        if (this.webSocket.readyState !== WebSocket.OPEN) {
            if (this.debug >= 1)
                this.log('[warning] spawn() was called when connection was not established, packet will be dropped');
            return false;
        }

        var buf = new Buffer(1 + 2 * name.length);
        buf.writeUInt8(0, 0);
        for (var i = 0; i < name.length; i++) {
            buf.writeUInt16LE(name.charCodeAt(i), 1 + i * 2);
        }
        this.send(buf);

        //fix for unstable spawn on official servers
        if (!this.spawn_attempt && this.spawn_interval) {
            if (this.debug >= 4)
                this.log('Starting spawn() interval');

            var that = this;
            this.spawn_attempt = 1;
            this.spawn_interval_id = setInterval(function () {
                if (that.debug >= 4)
                    that.log('spawn() interval tick, attempt ' + that.spawn_attempt + '/' + that.spawn_attempts);

                if (that.spawn_attempt >= that.spawn_attempts) {
                    if (that.debug >= 1)
                        that.log('[warning] spawn() interval gave up! Disconnecting from server!');
                    that.spawn_attempt = 0;
                    clearInterval(that.spawn_interval_id);
                    that.spawn_interval_id = 0;
                    that.disconnect();
                    return;
                }
                that.spawn_attempt++;
                that.spawn(name);
            }, that.spawn_interval);
        }

        return true;
    },

    //activate spectate mode
    spectate: function () {
        if (this.webSocket.readyState !== WebSocket.OPEN) {
            if (this.debug >= 1)
                this.log('[warning] spectate() was called when connection was not established, packet will be dropped');
            return false;
        }

        var buf = new Buffer([1]);
        this.send(buf);

        return true;
    },

    //switch spectate mode (toggle between free look view and leader view)
    spectateModeToggle: function () {
        if (this.webSocket.readyState !== WebSocket.OPEN) {
            if (this.debug >= 1)
                this.log('[warning] spectateModeToggle() was called when connection was not established, packet will be dropped');
            return false;
        }

        var buf = new Buffer([18]);
        this.send(buf);
        var buf = new Buffer([19]);
        this.send(buf);

        return true;
    },

    moveTo: function (x, y) {
        if (this.webSocket.readyState !== WebSocket.OPEN) {
            if (this.debug >= 1)
                this.log('[warning] moveTo() was called before connection established, packet will be dropped');
            return false;
        }
        var buf = new Buffer(13);
        buf.writeUInt8(16, 0);
        buf.writeInt32LE(Math.round(x), 1);
        buf.writeInt32LE(Math.round(y), 5);
        buf.writeUInt32LE(0, 9);
        this.send(buf);

        return true;
    },

    //split your cells
    //they will split in direction that you have set with moveTo()
    split: function () {
        if (this.webSocket.readyState !== WebSocket.OPEN) {
            if (this.debug >= 1)
                this.log('[warning] split() was called when connection was not established, packet will be dropped');
            return false;
        }
        var buf = new Buffer([17]);
        this.send(buf);

        return true;
    },

    //eject some mass
    //mass will eject in direction that you have set with moveTo()
    eject: function () {
        if (this.webSocket.readyState !== WebSocket.OPEN) {
            if (this.debug >= 1)
                this.log('[warning] eject() was called when connection was not established, packet will be dropped');
            return false;
        }
        var buf = new Buffer([21]);
        this.send(buf);

        return true;
    }
};

function Ball(client, id) {
    if (client.cells[id]) return client.cells[id];

    this.id = id;
    this.name = null;
    this.x = 0;
    this.y = 0;
    this.size = 0;
    this.mass = 0;
    this.virus = false;
    this.mine = false;

    this.client = client;
    this.destroyed = false;
    this.visible = false;
    this.last_update = Date.now();
    this.update_tick = 0;

    client.cells[id] = this;
    return this;
}
Ball.prototype = {
    destroy: function (reason) {
        this.destroyed = reason;
        delete this.client.cells[this.id];
        var mine_cell_index = this.client.playerIDs.indexOf(this.id);
        if (mine_cell_index > -1) {
            this.client.playerIDs.splice(mine_cell_index, 1);
            this.client.emit('player-cell-loss', this.id, reason);
            if (!this.client.playerIDs.length) this.client.emit('player-death', reason);
        }

        this.emit('destroy', reason);
        this.client.emit('cell-destroy', this.id, reason);
    },

    setCords: function (new_x, new_y) {
        if (this.x == new_x && this.y == new_y) return;
        var old_x = this.x;
        var old_y = this.y;
        this.x = new_x;
        this.y = new_y;

        if (!old_x && !old_y) return;
        this.emit('move', old_x, old_y, new_x, new_y);
        this.client.emit('cell-move', this.id, old_x, old_y, new_x, new_y);
    },

    setSize: function (new_size) {
        if (this.size == new_size) return;
        var old_size = this.size;
        this.size = new_size;
        this.mass = parseInt(Math.pow(new_size / 10, 2));

        if (!old_size) return;
        this.emit('resize', old_size, new_size);
        this.client.emit('cell-resize', this.id, old_size, new_size);
        if (this.mine) this.client.updateScore();
    },

    setName: function (name) {
        if (this.name == name) return;
        var old_name = this.name;
        this.name = name;

        this.emit('rename', old_name, name);
        this.client.emit('cell-rename', this.id, old_name, name);
    },

    update: function () {
        var old_time = this.last_update;
        this.last_update = Date.now();

        this.emit('update', old_time, this.last_update);
        this.client.emit('cell-update', this.id, old_time, this.last_update);
    },

    appear: function () {
        if (this.visible) return;
        this.visible = true;
        this.emit('appear');
        this.client.emit('cell-appear', this.id);

        if (this.mine) this.client.updateScore();
    },

    disappear: function () {
        if (!this.visible) return;
        this.visible = false;
        this.emit('disappear');
        this.client.emit('cell-disappear', this.id);
    },

    toString: function () {
        if (this.name) return this.id + '(' + this.name + ')';
        return this.id.toString();
    }
};

// Inherit from EventEmitter
for (var key in EventEmitter.prototype) {
    if (!EventEmitter.prototype.hasOwnProperty(key)) continue;
    Client.prototype[key] = Ball.prototype[key] = EventEmitter.prototype[key];
}
