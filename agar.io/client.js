'use strict';

const WebSocket = require('ws');
const Packet = require('./packet.js');
const { EventEmitter } = require('events');

const defaultOptions = { // You can change these values
    name: 'agario-client',
    debug: 0, // Debug level, 0-6 (5 and higher will output an extreme amount of data!)
    inactiveDestroy: 5 * 60 * 1000, // Time in ms when to destroy inactive cells
    inactiveCheck: 10 * 1000, // Time in ms when to search inactive cells
    spawnInterval: 200, // Time in ms for respawn interval. 0 to disable (if your custom server don't have spawn problems)
    spawnAttempts: 25 // How many attempts to spawn before giving up (official servers do have unstable spawn problems)
};

const validOptions = Object.keys(defaultOptions);

class Client extends EventEmitter {
    constructor(options) {
        super();

        if (options) {
            validOptions.forEach(opt =>
                this[opt] = options.hasOwnProperty(opt) ? options[opt] : defaultOptions[opt]);
        }
        else {
            validOptions.forEach(opt => this[opt] = defaultOptions[opt]);
        }

        let log = console.log.bind(console, this.name + ':');
        let emit = this.emit.bind(this);
        let debugLevels = [1, 2, 3, 4, 5, 6];
        
        debugLevels.forEach(level => {
            let method = level > 1 ? 'emit' + level : 'emit';

            if (this.debug >= level) {
                // Log only the event but emit the event with args
                this[method] = (event, ...args) => {
                    log(event);
                    emit(event, ...args);
                    return this;
                };

                // Log and emit the event with args
                this[method].log = (event, ...args) => {
                    log(event + ':', ...args);
                    emit(event, ...args);
                    return this;
                };
            }
            else {
                // Just emit the event with args
                this[method] = (...args) => {
                    emit(...args);
                    return this;
                };

                // Just emit the event with args
                this[method].log = this[method];
            }
        });

        this.log = log;
        this.justEmit = emit;


        // Don't change things below if you don't understand what you're doing

        this.tickCounter = 0; // Number of ticks (packet ID 16 counter)
        this.inactiveID = 0; // ID of setInterval()
        this.cells = {}; // All cells
        this.playerIDs = []; // IDs of my cells
        this.score = 0; // My score
        this.leaders = []; // IDs of leaders in FFA mode
        this.teamsScores = []; // Scores of teams in Teams mode
        this.facebookKey = ''; // Facebook key. Check README.md how to get it
        this.spawnAttempt = 0; // Attempt to spawn
        this.spawnID = 0; // ID of setInterval()
    }

    connect(server, key) {
        let headers = {
            'Origin': 'http://agar.io'
        };

        this.webSocket = new WebSocket(server, null, {headers: headers});
        this.webSocket.binaryType = "arraybuffer";
        this.webSocket.onopen = this.onConnect.bind(this);
        this.webSocket.onmessage = this.onMessage.bind(this);
        this.webSocket.onclose = this.onDisconnect.bind(this);
        this.webSocket.onerror = this.onError.bind(this);

        this.server = server;
        this.key = key;

        if (!key) this.emit.log('warning', 'You did not specified "key" for Client.connect(server, key)\n' +
            '          If server will not accept you, this may be the problem');

        this.emit('connecting');
    }

    disconnect() {
        if (this.debug >= 1)
            this.log('disconnect called');

        this.webSocket.close();
    }

    onConnect() {
        let client = this;

        this.inactiveID = setInterval(this.destroyInactive.bind(this), this.inactiveCheck);

        let buf = new Buffer(5);
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
            for (let i = 1; i <= this.key.length; ++i) {
                buf.writeUInt8(this.key.charCodeAt(i - 1), i);
            }
            this.send(buf);
        }
        if (this.facebookKey) {
            buf = new Buffer(1 + this.facebookKey.length);
            buf.writeUInt8(81, 0);
            for (i = 1; i <= this.facebookKey.length; ++i) {
                buf.writeUInt8(this.facebookKey.charCodeAt(i - 1), i);
            }
            this.send(buf);
        }

        client.emit('connected');
    }

    onError(error) {
        this.emit.log('connection-error', error).reset('connection-error');
    }

    onDisconnect() {
        this.emit('disconnect').reset('disconnect');
    }

    onMessage(e) {
        let packet = new Packet(e);
        let packetID = packet.readUInt8();
        let processor = this.processors[packetID];
        if (!processor)
            return this.emit.log('warning', 'Unknown packet ID(' + packetID + '): ' + packet.toString());

        if (this.debug >= 4)
            this.log('RECV packet ID=' + packetID + ' LEN=' + packet.length);
        if (this.debug >= 5)
            this.log('dump: ' + packet.toString());

        this.justEmit('message', packet);
        processor(this, packet);
    }

    send(buf) {
        if (this.debug >= 4)
            this.log('SEND packet ID=' + buf.readUInt8(0) + ' LEN=' + buf.length);

        if (this.debug >= 5)
            this.log('dump: ' + (new Packet(buf).toString()));

        this.webSocket.send(buf);
    }

    reset(reason) {
        clearInterval(this.inactiveID);
        clearInterval(this.spawnID);

        this.inactiveID = 0;
        this.spawnID = 0;

        this.leaders = [];
        this.teamsScores = [];
        this.playerIDs = [];

        this.spawnAttempt = 0;

        let { cells } = this, keys = Object.keys(cells);
        for (let i = 0, length = keys.length; i < length; i++)
            cells[keys[i]].destroy('reset');

        this.emit3.log('reset', reason);
    }

    destroyInactive() {
        let time = Date.now();

        if (this.debug >= 3)
            this.log('destroying inactive cells...');

        let { cells, inactiveDestroy } = this, keys = Object.keys(cells);

        for (let cell, i = 0, length = keys.length; i < length; i++) {
            cell = cells[keys[i]];
            if (time - cell.lastUpdate < inactiveDestroy || cell.visible)
                continue;

            cell.destroy('inactive');
        }
    }

    updateScore() {
        let potentialScore = 0;
        for (let cellID, cell, i = 0; i < this.playerIDs.length; i++) {
            cellID = this.playerIDs[i];
            cell = this.cells[cellID];
            potentialScore += Math.pow(cell.size, 2);
        }
        let oldScore = this.score;
        let newScore = Math.max(oldScore, Math.floor(potentialScore / 100));

        if (this.score === newScore) return;
        this.score = newScore;
        
        this.emit2.log('score-update', oldScore, newScore);
    }

    // Functions that you can call to control your cells

    // Spawn cell
    spawn(name) {
        this.emit3.log('spawn', name);

        if (this.webSocket.readyState !== WebSocket.OPEN) {
            this.emit.log('warning', 'Spawn was called when connection was not established, packet will be dropped');
            return false;
        }

        let buf = new Buffer(1 + 2 * name.length);
        buf.writeUInt8(0, 0);
        for (let i = 0; i < name.length; i++) {
            buf.writeUInt16LE(name.charCodeAt(i), 1 + i * 2);
        }
        this.send(buf);

        // Fix for unstable spawn on official servers
        if (!this.spawnAttempt && this.spawnInterval) {
            if (this.debug >= 4)
                this.log('Starting spawn interval');

            let that = this;
            this.spawnAttempt = 1;
            this.spawnID = setInterval(function () {
                if (that.debug >= 4)
                    that.log('spawn interval tick, attempt ' + that.spawnAttempt + '/' + that.spawnAttempts);

                if (that.spawnAttempt >= that.spawnAttempts) {
                    that.emit.log('warning', 'Spawn interval gave up! Disconnecting from server!');
                    that.spawnAttempt = 0;
                    clearInterval(that.spawnID);
                    that.spawnID = 0;
                    that.disconnect();
                    return;
                }
                that.spawnAttempt++;
                that.spawn(name);
            }, that.spawnInterval);
        }

        return true;
    }

    // Activate spectate mode
    spectate() {
        if (this.webSocket.readyState !== WebSocket.OPEN) {
            this.emit.log('warning', 'Attempted to spectate without an established connection, packet will be dropped');
            return false;
        }

        let buf = new Buffer([1]);
        this.send(buf);

        return true;
    }

    // Switch spectate mode (toggle between free look view and leader view)
    spectateModeToggle() {
        if (this.webSocket.readyState !== WebSocket.OPEN) {
            this.emit.log('warning', 'Attempted to toggle spectate mode without an established connection, packet will be dropped');
            return false;
        }

        let buf = new Buffer([18]);
        this.send(buf);
        buf = new Buffer([19]);
        this.send(buf);

        return true;
    }

    moveTo(x, y) {
        if (this.webSocket.readyState !== WebSocket.OPEN) {
            this.emit.log('warning', 'Attempted to move without an established connection, packet will be dropped');
            return false;
        }
        let buf = new Buffer(13);
        buf.writeUInt8(16, 0);
        buf.writeInt32LE(Math.round(x), 1);
        buf.writeInt32LE(Math.round(y), 5);
        buf.writeUInt32LE(0, 9);
        this.send(buf);

        return true;
    }

    // Split your cells
    // They will split in direction that you have set with moveTo()
    split() {
        if (this.webSocket.readyState !== WebSocket.OPEN) {
            this.emit.log('warning', 'Attempted to split without an established connection, packet will be dropped');
            return false;
        }
        let buf = new Buffer([17]);
        this.send(buf);

        return true;
    }

    // Eject some mass
    // Mass will eject in direction that you have set with moveTo()
    eject() {
        if (this.webSocket.readyState !== WebSocket.OPEN) {
            this.emit.log('warning', 'Attempted to eject mass without an established connection, packet will be dropped');
            return false;
        }
        let buf = new Buffer([21]);
        this.send(buf);

        return true;
    }
}

class Cell extends EventEmitter {
    constructor(client, id) {
        super();

        // @TODO - WTF is this shit doing here anyway?
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
        this.lastUpdate = Date.now();
        this.updateTick = 0;

        client.cells[id] = this;
    }

    destroy(reason) {
        let { client } = this;
        
        this.destroyed = reason;
        delete client.cells[this.id];
        
        let cellIndex = client.playerIDs.indexOf(this.id);
        if (cellIndex > -1) {
            client.playerIDs.splice(cellIndex, 1);
            
            client.emit.log('player-cell-loss', this.id, reason);
            if (!client.playerIDs.length) client.emit.log('player-death', reason);
        }

        this.emit('destroy', reason);
        client.emit6.log('cell-destroy', this.id, reason);
    }

    setCords(newX, newY) {
        if (this.x === newX && this.y === newY) return;
        let oldX = this.x;
        let oldY = this.y;
        this.x = newX;
        this.y = newY;

        if (!oldX && !oldY) return;
        this.emit('move', oldX, oldY, newX, newY);
        this.client.emit6.log('cell-move', this.id, oldX, oldY, newX, newY); // @TODO too much? 
    }

    setSize(newSize) {
        if (this.size === newSize) return;
        let oldSize = this.size;
        this.size = newSize;
        this.mass = parseInt(Math.pow(newSize / 10, 2));

        if (!oldSize) return;
        this.emit('resize', oldSize, newSize);
        this.client.emit6.log('cell-resize', this.id, oldSize, newSize);
        if (this.mine) this.client.updateScore();
    }

    setName(name) {
        if (this.name === name) return;
        let oldName = this.name;
        this.name = name;

        this.emit('rename', oldName, name);
        this.client.emit6.log('cell-rename', this.id, oldName, name);
    }

    update() {
        let oldTime = this.lastUpdate;
        this.lastUpdate = Date.now();

        this.emit('update', oldTime, this.lastUpdate);
        this.client.emit6.log('cell-update', this.id, oldTime, this.lastUpdate);
    }

    appear() {
        if (this.visible) return;
        this.visible = true;
        this.emit('appear');
        this.client.emit6.log('cell-appear', this.id);

        if (this.mine) this.client.updateScore();
    }

    disappear() {
        if (!this.visible) return;
        this.visible = false;
        this.emit('disappear');
        this.client.emit6.log('cell-disappear', this.id);
    }

    toString() {
        if (this.name) return this.id + '(' + this.name + ')';
        return this.id.toString();
    }
}

Object.defineProperty(Client.prototype, 'processors', {
    value: {
        // Tick
        '16': function (client, packet) {
            let eatersCount = packet.readUInt16LE();

            client.tickCounter++;

            // Reading eat events
            for (let i = 0; i < eatersCount; i++) {
                let eatersID = packet.readUInt32LE();
                let eatenID = packet.readUInt32LE();

                /*
                if (client.debug >= 4)
                    client.log(eatersID + ' ate ' + eatenID + ' (' + client.cells[eatersID] + '>' + client.cells[eatenID] + ')');
                */
                
                let player = client.cells[eatersID];
                if (!player)
                    player = new Cell(client, eatersID);
                player.update();
                if (client.cells[eatenID]) client.cells[eatenID].destroy('eaten', eatersID);

                // @TODO provide method to separate emit args from log args, maybe chainable ?
                client.emit4('something-ate', client.cells[eatersID], client.cells[eatenID]);
                
                if (player.mine)
                    client.emit('player-ate', client.cells[eatenID], player);
            }


            // Reading actions of cells
            while (1) {
                let isVirus = false;
                let cellID;
                let coordX;
                let coordY;
                let size;
                let color;
                let nick = null;

                cellID = packet.readUInt32LE();
                if (cellID === 0) break;
                coordX = packet.readSInt32LE();
                coordY = packet.readSInt32LE();
                size = packet.readSInt16LE();

                let color_R = packet.readUInt8();
                let color_G = packet.readUInt8();
                let color_B = packet.readUInt8();

                color = (color_R << 16 | color_G << 8 | color_B).toString(16);
                color = '#' + ('000000' + color).substr(-6);

                let opt = packet.readUInt8();
                isVirus = !!(opt & 1);
                let something_1 = !!(opt & 16); // @TODO: What is this?

                // Reserved for future use?
                if (opt & 2) {
                    packet.offset += packet.readUInt32LE();
                }
                if (opt & 4) {
                    let something_2 = ''; // @TODO: Something related to premium skins
                    while (1) {
                        let char = packet.readUInt8();
                        if (char === 0) break;
                        if (!something_2) something_2 = '';
                        something_2 += String.fromCharCode(char);
                    }
                }

                while (1) {
                    let char = packet.readUInt16LE();
                    if (char === 0) break;
                    if (!nick) nick = '';
                    nick += String.fromCharCode(char);
                }

                let cell = client.cells[cellID] || new Cell(client, cellID);
                cell.color = color;
                cell.virus = isVirus;
                cell.setCords(coordX, coordY);
                cell.setSize(size);
                if (nick) cell.setName(nick);
                cell.updateTick = client.tickCounter;
                cell.appear();
                cell.update();

                /*
                if (client.debug >= 5)
                    client.log('action: cellID=' + cellID + ' coordX=' + coordX + ' coordY=' + coordY + ' size=' + size + ' isVirus=' + isVirus + ' nick=' + nick);
                */
                
                client.emit5.log('cell-action', cellID, coordX, coordY, size, isVirus, nick);
            }

            let cellsOnScreen = packet.readUInt32LE();

            // Disappear events
            for (let cellID, cell, i = 0; i < cellsOnScreen; i++) {
                cellID = packet.readUInt32LE();

                cell = client.cells[cellID] || new Cell(client, cellID);
                cell.updateTick = client.tickCounter;
                cell.update();
                if (cell.mine) {
                    cell.destroy('merge', cell.id);
                    client.emit.log('merge', cell.id);
                } else {
                    cell.disappear();
                }
            }
        },

        // Update spectating coordinates in "spectate" mode
        '17': function (client, packet) {
            let x = packet.readFloat32LE();
            let y = packet.readFloat32LE();
            let zoom = packet.readFloat32LE();

            /*
            if (client.debug >= 4)
                client.log('spectate FOV update: x=' + x + ' y=' + y + ' zoom=' + zoom);
            */

            client.emit4.log('spectate-field-update', x, y, zoom);
        },

        '20': function () {
            // I don't know what this is, in the original code it would clear the cells array but I never saw this packet
        },

        // New ID of your cell (when you join or press space)
        '32': function (client, packet) {
            let cellID = packet.readUInt32LE();
            let cell = client.cells[cellID] || new Cell(client, cellID);
            cell.mine = true;
            if (!client.playerIDs.length) client.score = 0;
            client.playerIDs.push(cellID);

            if (client.spawnID) {
                if (client.debug >= 4)
                    client.log('detected new cell, disabling spawn interval');
                client.spawnAttempt = 0;
                clearInterval(client.spawnID);
                client.spawnID = 0;
            }

            client.emit2.log('player-cell-gain', cellID);
        },

        // Leaderboard update in FFA mode
        '49': function (client, packet) {
            let users = [];
            let count = packet.readUInt32LE();

            for (let i = 0; i < count; i++) {
                let id = packet.readUInt32LE();

                let name = '';
                while (1) {
                    let char = packet.readUInt16LE();
                    if (char === 0) break;
                    name += String.fromCharCode(char);
                }

                users.push(id);
                let cell = client.cells[id] || new Cell(client, id);
                if (name) cell.setName(name);
                cell.update();
            }

            if (JSON.stringify(client.leaders) === JSON.stringify(users)) return;
            let oldLeaders = client.leaders;
            client.leaders = users;

            client.emit2.log('leaderboard-update', users, oldLeaders);
        },

        // Teams scored update in teams mode
        '50': function (client, packet) {
            let teamsCount = packet.readUInt32LE();
            let teamsScores = [];

            for (let i = 0; i < teamsCount; ++i) {
                teamsScores.push(packet.readFloat32LE());
            }

            if (JSON.stringify(client.teamsScores) === JSON.stringify(teamsScores)) return;
            let oldScores = client.teamsScores;

            client.teamsScores = teamsScores;

            client.emit2.log('teams-scores-update', oldScores, teamsScores);
        },

        // Map size load
        '64': function (client, packet) {
            let min_x = packet.readFloat64LE();
            let min_y = packet.readFloat64LE();
            let max_x = packet.readFloat64LE();
            let max_y = packet.readFloat64LE();

            client.emit2.log('map-size-update', min_x, min_y, max_x, max_y);
        },

        // Another unknown packet
        '72': function () {
            // Packet is sent by server but not used in original code
        },

        '81': function (client, packet) {
            let level = packet.readUInt32LE();
            let currentExp = packet.readUInt32LE();
            let needExp = packet.readUInt32LE();

            client.emit2.log('experience-update', level, currentExp, needExp);
        },

        '240': function (client, packet) {
            packet.offset += 4;
            let packetID = packet.readUInt8();
            let processor = client.processors[packetID];
            if (!processor)
                return client.emit.log('warning', 'Unknown packet ID(240->' + packetID + '): ' + packet.toString());
            processor(client, packet);
        },

        // Somebody won, end of the game (server restart)
        '254': function (client) {
            if (client.debug >= 1)
                client.log(client.cells[client.leaders[0]] + ' WON THE GAME! Server going for restart');

            client.emit('winner', client.leaders[0]);
        }
    }
});

Client.Cell = Cell;
module.exports = Client;
