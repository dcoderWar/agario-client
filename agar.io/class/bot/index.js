/*The MIT License (MIT)

 Copyright (c) 2015 Apostolique

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.*/

'use strict';

const { utils: { mirror, merge }, config } = require('./../../');
const { defineOptions, splitDistance,
    bot: { options: defaults } } = config;

merge(this, require('./methods'));

Object.defineProperty(Number.prototype, 'mod', {
    value: function mod(n) {
        return ((this % n) + n) % n;
    }
});


class Bot {
    constructor(client) {
        // Sanity Checks
        if (client == null) throw new TypeError('Invalid constructor argument');
        if (typeof(client.on) !== 'function')
            throw new TypeError('Client doesn\'t appear to be an instance of EventEmitter');
        if (client.cells == null || !Array.isArray(client.playerIDs))
            throw new TypeError('Client doesn\'t have expected property values');


        let updatePlayer = () =>
            this.player = this.client.cells[this.client.playerIDs[0]];

        let updateMap = (...coords) => this.map = coords;

        client.on('player-cell-gain', updatePlayer);
        client.on('player-cell-loss', updatePlayer);
        client.on('map-size-update', updateMap);

        this.cells = client.cells;
        this.split = client.split.bind(client);
        this.log = client.log.bind(client);

        this.client = client;
        this.version = '3.8.1'; // Forked from version 3.7
        this.masterLastSeen = Date.now();
        this.isSlave = true;
        this.masterLocation = [100, 100];
        this.goingToSlave = false;
        this.goingToX = 100;
        this.goingToY = 100;

        updatePlayer();
        updateMap(0, 0, 0, 0);
    }

    endeavorFreedom() {
        if (this.isSlave && Date.now() - this.masterLastSeen > 5000) {
            this.isSlave = false;
        }
    }

    get x() {
        return this.player ? this.player.x : 0;
    }

    get y() {
        return this.player ? this.player.y : 0;
    }

    get size() {
        return this.player ? this.player.size : 0;
    }

    getPlayer() {
        return this.client.playerIDs;
    }

    moveTo(x, y) {
        this.goingToX = x;
        this.goingToY = y;

        this.client.moveTo(x, y);
    }

    toString() {
        return 'AgarioHelper v' + this.version;
    }

    mainLoop() {
        const bot = this, player = bot.player,
            badAngles = [], obstacleList = [], goodAngles = [], obstacleAngles = [];

        let master, cells, clusters, stupidList, offsetI = 0, obOffsetI = 1,
            destination = [], sortedObList = [], sortedInterList = [];

        if (player) { // Just to make sure the bot is alive.
            bot.endeavorFreedom();

            cells = getCells(bot);

            if (master = cells.master[0]) {
                console.log('Found master:', master.x, master.y, master.id, master.name);
                bot.masterLocation = [master.x, master.y];

                if (bot.isSplit || bot.getPlayer().length > 1) {
                    bot.isSplit = false;

                    bot.log('suicide-split', "I'm split and going straight to master!");

                    return bot.moveTo(master.x, master.y);
                }

                if (computeDistanceFromCircleEdge(master.x, master.y,
                        player.x, player.y, master.size) <= 50) {

                    bot.log('suicide-close', "I'm really close and going straight to master!");

                    return bot.moveTo(master.x, master.y);
                }
            }

            clusters = getFoodClusters(cells.food, player.size);

            cells.threats.forEach(threat => {
                let temp, distance, enemyCanSplit;

                distance = getDistance(player, threat);
                enemyCanSplit = (bot.isSlave ? false : canSplit(player, threat));

                clusters = clusters.filter(cluster => {
                    let safety = (enemyCanSplit ? distance.split : distance.danger);
                    return computeDistance(threat.x, threat.y, cluster[0], cluster[1]) >= safety;
                });

                if (enemyCanSplit && distance.absolute < distance.split) {
                    badAngles.push(getAngleRange(player, threat, distance.split).concat(distance.relative));
                }
                else if (!enemyCanSplit && distance.absolute < distance.danger) {
                    badAngles.push(getAngleRange(player, threat, distance.danger).concat(distance.relative));
                }
                else if (enemyCanSplit && distance.absolute < distance.split + distance.shift) {
                    temp = getAngleRange(player, threat, distance.split + distance.shift);
                    obstacleList.push([[temp[0], true], [rangeToAngle(temp), false]]);
                }
                else if (!enemyCanSplit && distance.absolute < distance.danger + distance.shift) {
                    temp = getAngleRange(player, threat, distance.danger + distance.shift);
                    obstacleList.push([[temp[0], true], [rangeToAngle(temp), false]]);
                }
            });

            cells.viruses.forEach(virus => {
                let temp, virusDistance = computeDistance(virus.x, virus.y, player.x, player.y);

                if (player.size < virus.size) {
                    if (virusDistance < (virus.size * 2)) {
                        temp = getAngleRange(player, virus, virus.size + 10);
                        obstacleList.push([[temp[0], true], [rangeToAngle(temp), false]]);
                    }
                }
                else if (virusDistance < (player.size * 2)) {
                    temp = getAngleRange(player, virus, player.size + 50);
                    obstacleList.push([[temp[0], true], [rangeToAngle(temp), false]]);
                }
            });

            // NOTE: This is only bandaid wall code. It's not the best way to do it.
            stupidList = badAngles.length ? addWall([], player, bot) : [];

            badAngles.forEach(angle => {
                stupidList.push([
                    [angle[0], true],
                    [rangeToAngle(angle), false],
                    angle[2]
                ]);
            });

            stupidList.sort((a, b) => {
                return a[2] - b[2];
            });

            stupidList.forEach(range => {
                var tempList = addAngle(sortedInterList, range);

                if (tempList.length === 0) // Aiyeeeee! Probably going to die...
                    return bot.log('mayday-uh-oh', "MAYDAY IT'S HAPPENING!");

                // Exhales! Maybe we won't die....
                sortedInterList = tempList;
            });

            for (let i = 0; i < obstacleList.length; i++) {
                sortedObList = addAngle(sortedObList, obstacleList[i]);

                if (sortedObList.length == 0) {
                    break;
                }
            }

            if (sortedInterList.length > 0 && sortedInterList[0][1]) {
                offsetI = 1;
            }
            if (sortedObList.length > 0 && sortedObList[0][1]) {
                obOffsetI = 0;
            }

            for (let angle1, angle2, diff, i = 0; i < sortedInterList.length; i += 2) {
                angle1 = sortedInterList[(i + offsetI).mod(sortedInterList.length)][0];
                angle2 = sortedInterList[(i + 1 + offsetI).mod(sortedInterList.length)][0];
                diff = (angle2 - angle1).mod(360);
                goodAngles.push([angle1, diff]);
            }

            for (let angle1, angle2, diff, i = 0; i < sortedObList.length; i += 2) {
                angle1 = sortedObList[(i + obOffsetI).mod(sortedObList.length)][0];
                angle2 = sortedObList[(i + 1 + obOffsetI).mod(sortedObList.length)][0];
                diff = (angle2 - angle1).mod(360);
                obstacleAngles.push([angle1, diff]);
            }

            if (bot.isSlave && goodAngles.length == 0 && (player.size * player.size / 100) > 50) {
                //This is the slave mode
                bot.log("Really Going to(" +
                    (bot.goingToSlave ? 'slave' : 'master') + "): " + bot.masterLocation);

                let distance = computeDistance(player.x, player.y, bot.masterLocation[0], bot.masterLocation[1]);

                let shiftedAngle = shiftAngle(obstacleAngles, getAngle(bot.masterLocation[0], bot.masterLocation[1], player.x, player.y), [0, 360]);

                destination = followAngle(shiftedAngle, player.x, player.y, distance);
            } else if (goodAngles.length > 0) {
                var bIndex = goodAngles[0];
                var biggest = goodAngles[0][1];
                for (let i = 1; i < goodAngles.length; i++) {
                    var size = goodAngles[i][1];
                    if (size > biggest) {
                        biggest = size;
                        bIndex = goodAngles[i];
                    }
                }

                var perfectAngle = (bIndex[0] + bIndex[1] / 2).mod(360);

                perfectAngle = shiftAngle(obstacleAngles, perfectAngle, bIndex);

                destination = followAngle(perfectAngle, player.x, player.y, 1672.2);
                /* verticalDistance() STAND OUT */
                //tempMoveX = line1[0];
                //tempMoveY = line1[1];
            } else if (badAngles.length > 0 && goodAngles.length == 0) {
                //When there are enemies around but no good angles
                //You're likely screwed. (This should never happen.)

                bot.log('fails', "Failed");
                destination = [bot.goingToX, bot.goingToY];
            } else if (clusters.length > 0) {
                for (let i = 0; i < clusters.length; i++) {
                    var clusterAngle = getAngle(clusters[i][0], clusters[i][1], player.x, player.y);

                    clusters[i][2] = clusters[i][2] * 6 - computeDistance(clusters[i][0], clusters[i][1], player.x, player.y);
                    clusters[i][3] = clusterAngle;
                }

                var bestFoodI = 0;
                var bestFood = clusters[0][2];
                for (let i = 1; i < clusters.length; i++) {
                    if (bestFood < clusters[i][2]) {
                        bestFood = clusters[i][2];
                        bestFoodI = i;
                    }
                }

                let distance = computeDistance(player.x, player.y, clusters[bestFoodI][0], clusters[bestFoodI][1]);

                let shiftedAngle = shiftAngle(obstacleAngles, getAngle(clusters[bestFoodI][0], clusters[bestFoodI][1], player.x, player.y), [0, 360]);

                destination = followAngle(shiftedAngle, player.x, player.y, distance);
            } else {
                // If there are no enemies around and no food to eat.
                bot.moveTo(bot.goingToX, bot.goingToY);
            }


            if (!bot.isSlave) bot.masterLocation = destination;

            bot.endeavorFreedom();

            bot.moveTo(destination[0], destination[1]);
        }
    }
}

module.exports = Bot;

// Export needed functions
Bot.computeDistance = computeDistance;
Bot.isThreat = isThreat;


function getDistance(player, cell) {
    return {
        relative: computeDistanceFromCircleEdge(cell.x, cell.y, player.x, player.y, cell.size),
        absolute: computeDistance(cell.x, cell.y, player.x, player.y),
        split: cell.size + splitDistance + 150,
        danger: cell.size + 150,
        shift: player.size
    };
}
