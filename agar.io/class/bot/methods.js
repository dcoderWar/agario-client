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

module.exports = {
    isThreat,                       computeDistance,                computeDistanceFromCircleEdge,
    compareSize,                    canSplit,                       isFood,
    isVirus,                        isSplitTarget,                  getFood,
    CellsIterator,                  getMaster,                      getPrey,
    getThreats,                     getViruses,                     skipMine,
    getCells,                       getFoodClusters,                getAngle,
    slopeFromAngle,                 pointsOnLine,                   followAngle,
    angleIsWithin,                  rangeToAngle,                   getEdgeLinesFromPoint,
    addWall,                        getAngleIndex,                  addAngle,
    getAngleRange,                  shiftAngle
};

function isThreat(player, cell) {
    return !!(!cell.virus && compareSize(player, cell, 1.30));
}

function computeDistance(x1, y1, x2, y2) {
    var xdis = x1 - x2; // <--- FAKE AmS OF COURSE!
    var ydis = y1 - y2;

    return Math.sqrt(xdis * xdis + ydis * ydis);
}

function computeDistanceFromCircleEdge(x1, y1, x2, y2, s2) {
    var tempD = computeDistance(x1, y1, x2, y2);

    var ratioX = tempD / (x1 - x2);
    var ratioY = tempD / (y1 - y2);

    var offsetX = x1 - (s2 / ratioX);
    var offsetY = y1 - (s2 / ratioY);

    return computeDistance(x2, y2, offsetX, offsetY);
}

function compareSize(player1, player2, ratio) {
    return player1.size * player1.size * ratio < player2.size * player2.size;
}

function canSplit(player1, player2) {
    return compareSize(player1, player2, 2.8) && !compareSize(player1, player2, 20);
}

function isFood(player, cell) {
    return !!(!cell.virus && compareSize(cell, player, 1.33) || (cell.size <= 13));
}

function isVirus(player, cell) {
    return !!(cell.virus && compareSize(cell, player, 1.2));

}

function isSplitTarget(player, cell) {
    return !!canSplit(cell, player);
}

function CellsIterator(bot) {
    var cells = bot.cells;
    var list, collect, iDs = Object.keys(cells);

    function test(id) {
        return !collect.call(bot, cells[id], list);
    }

    return function getList(collector) {
        list = [];
        collect = collector;
        iDs = iDs.filter(test);
        return list;
    };
}

function getMaster(cell, master) {
    var dist, temp, split = 0, player = this.player;

    // If the bot is in slave mode and the cell's name matches our player name
    // Hmmm.... Kinda an issue, seeing how anyone could use your name!!!! For now use something unique!
    // @TODO are cell IDs consistent enough to use? i.e. if (cell.id === bot.masterID)
    if (this.isSlave && cell.id === this.masterID && cell.name == player.name) {
        this.log('getMaster:', cell.id, cell.name, player.name);
        if (isThreat(cell, player)) {
            dist = computeDistanceFromCircleEdge(cell.x, cell.y, player.x, player.y, cell.size);

            if (dist <= 50 && !this.goingToSlave) {
                this.isSplit = true;

                temp = {size: player.size};
                while (!split || canSplit(cell, temp)) {
                    temp.size = temp.size / 2;

                    this.split();

                    if (++split >= 10) break;
                }
            }
        }

        return master.push(cell);
    }
    else if (this.isSlave) {
        if (cell.id === this.masterID)
            this.log('Master ID matches', cell.id, this.masterID, 'but the name does not', cell.name, player.name);
        else if (cell.name === player.name)
            this.log('Master names matches', cell.name, player.name, 'but the id does not', cell.id, this.masterID);
    }
}

// getFood and getPrey return [x, y, size]
function getFood(cell, food) {
    if (isFood(this.player, cell))
        return food.push([cell.x, cell.y, cell.size]);
}

function getThreats(cell, threats) {
    if (isThreat(this.player, cell))
        return threats.push(cell);
}

// getFood and getPrey return [x, y, size]
function getPrey(cell, prey) {
    if (isSplitTarget(this.player, cell))
        return prey.push([cell.x, cell.y, cell.size]);
}

function getViruses(cell, viruses) {
    if (isVirus(this.player, cell))
        return viruses.push(cell);
}

function skipMine(cell) {
    return cell.mine;
}

function getCells(bot) {
    var it = new CellsIterator(bot);

    // Probably shouldn't have to perform this operation, I'll look into it sometime later
    // As I'm maintaining a separate version of pulviscriptor/agario-client(less features, more sane) :P
    it(skipMine);

    var cells = {
        master: it(getMaster), // An array of cells that this helper bot intends to feed
        food: it(getFood), // An array of cells small enough to eat and aren't viruses
        threats: it(getThreats), // Not an array...Ha, joking
        viruses: it(getViruses), // An array
        prey: it(getPrey) // An array of cells that this bot can pounce/split on and eat
    };

    // If its prey than its food, the prey list isn't used any where else that I'm aware of
    // So it might be possible to further optimize getting the full food list
    cells.food.push.apply(cells.food, cells.prey);

    return cells;
}

function getFoodClusters(foodList, playerSize) {
    var clusters = [];
    var addedCluster = false;

    //1: x
    //2: y
    //3: size or value
    //4: Angle, not set here.

    for (var i = 0; i < foodList.length; i++) {
        for (var j = 0; j < clusters.length; j++) {
            if (computeDistance(foodList[i][0], foodList[i][1], clusters[j][0], clusters[j][1]) < playerSize * 1.5) {
                clusters[j][0] = (foodList[i][0] + clusters[j][0]) / 2;
                clusters[j][1] = (foodList[i][1] + clusters[j][1]) / 2;
                clusters[j][2] += foodList[i][2];
                addedCluster = true;
                break;
            }
        }
        if (!addedCluster) {
            clusters.push([foodList[i][0], foodList[i][1], foodList[i][2], 0]);
        }
        addedCluster = false;
    }
    return clusters;
}

function getAngle(x1, y1, x2, y2) {
    //Handle vertical and horizontal lines.

    if (x1 == x2) {
        if (y1 < y2) {
            return 271;
            //return 89;
        } else {
            return 89;
        }
    }

    return (Math.round(Math.atan2(-(y1 - y2), -(x1 - x2)) / Math.PI * 180 + 180));
}

function slopeFromAngle(degree) {
    if (degree == 270) {
        degree = 271;
    } else if (degree == 90) {
        degree = 91;
    }
    return Math.tan((degree - 180) / 180 * Math.PI);
}

//Given a slope and an offset, returns two points on bot line.
function pointsOnLine(slope, useX, useY, distance) {
    var r = Math.sqrt(1 + slope * slope);

    var newX1 = (useX + (distance / r));
    var newY1 = (useY + ((distance * slope) / r));
    var newX2 = (useX + ((-distance) / r));
    var newY2 = (useY + (((-distance) * slope) / r));

    return [
        [newX1, newY1],
        [newX2, newY2]
    ];
}

function followAngle(angle, useX, useY, distance) {
    var slope = slopeFromAngle(angle);
    var coords = pointsOnLine(slope, useX, useY, distance);

    var side = (angle - 90).mod(360);
    if (side < 180)
        return coords[1];
    return coords[0];
}

function angleIsWithin(angle, range) {
    var diff = (rangeToAngle(range) - angle).mod(360);
    return !!(diff >= 0 && diff <= range[1]);
}

function rangeToAngle(range) {
    return (range[0] + range[1]).mod(360);
}

//TODO: Don't let this function do the radius math.
function getEdgeLinesFromPoint(player1, player2, radius) {
    var px = player1.x;
    var py = player1.y;

    var cx = player2.x;
    var cy = player2.y;

    var tempRadius = computeDistance(px, py, cx, cy);
    if (tempRadius <= radius) {
        radius = tempRadius - 5;
    }

    var dx = cx - px;
    var dy = cy - py;
    var dd = Math.sqrt(dx * dx + dy * dy);
    var a = Math.asin(radius / dd);
    var b = Math.atan2(dy, dx);

    var t = b - a;
    var ta = {
        x: radius * Math.sin(t),
        y: radius * -Math.cos(t)
    };

    t = b + a;
    var tb = {
        x: radius * -Math.sin(t),
        y: radius * Math.cos(t)
    };

    var angleLeft = getAngle(cx + ta.x, cy + ta.y, px, py);
    var angleRight = getAngle(cx + tb.x, cy + tb.y, px, py);
    var angleDistance = (angleRight - angleLeft).mod(360);

    return [angleLeft, angleDistance, [cx + tb.x, cy + tb.y],
        [cx + ta.x, cy + ta.y]
    ];
}

function addWall(listToUse, player, bot) {
    var distanceFromWallY = 2000;
    var distanceFromWallX = 2000;
    if (player.x < bot.map[0] + distanceFromWallX) {
        // LEFT
        listToUse.push([
            [90, true],
            [270, false], computeDistance(bot.map[0], player.y, player.x, player.y)
        ]);
    }
    if (player.y < bot.map[1] + distanceFromWallY) {
        // TOP
        listToUse.push([
            [180, true],
            [0, false], computeDistance(player.x, bot.map[1], player.x, player.y)
        ]);
    }
    if (player.x > bot.map[2] - distanceFromWallX) {
        // RIGHT
        listToUse.push([
            [270, true],
            [90, false], computeDistance(bot.map[2], player.y, player.x, player.y)
        ]);
    }
    if (player.y > bot.map[3] - distanceFromWallY) {
        // BOTTOM
        listToUse.push([
            [0, true],
            [180, false], computeDistance(player.x, bot.map[3], player.x, player.y)
        ]);
    }
    return listToUse;
}

//listToUse contains angles in the form of [angle, boolean].
//boolean is true when the range is starting. False when it's ending.
//range = [[angle1, true], [angle2, false]]

function getAngleIndex(listToUse, angle) {
    if (listToUse.length == 0) {
        return 0;
    }

    for (var i = 0; i < listToUse.length; i++) {
        if (angle <= listToUse[i][0]) {
            return i;
        }
    }

    return listToUse.length;
}

function addAngle(listToUse, range) {
    //#1 Find first open element
    //#2 Try to add range1 to the list. If it is within other range, don't add it, set a boolean.
    //#3 Try to add range2 to the list. If it is withing other range, don't add it, set a boolean.

    //TODO: Only add the new range at the end after the right stuff has been removed.

    var newListToUse = listToUse.slice();

    var startIndex = 1;

    if (newListToUse.length > 0 && !newListToUse[0][1]) {
        startIndex = 0;
    }

    var startMark = getAngleIndex(newListToUse, range[0][0]);
    var startBool = startMark.mod(2) != startIndex;

    var endMark = getAngleIndex(newListToUse, range[1][0]);
    var endBool = endMark.mod(2) != startIndex;

    var removeList = [];

    if (startMark != endMark) {
        //Note: If there is still an error, this would be it.
        var biggerList = 0;
        if (endMark == newListToUse.length) {
            biggerList = 1;
        }

        for (let i = startMark; i < startMark + (endMark - startMark).mod(newListToUse.length + biggerList); i++) {
            removeList.push((i).mod(newListToUse.length));
        }
    } else if (startMark < newListToUse.length && endMark < newListToUse.length) {
        var startDist = (newListToUse[startMark][0] - range[0][0]).mod(360);
        var endDist = (newListToUse[endMark][0] - range[1][0]).mod(360);

        if (startDist < endDist) {
            for (let i = 0; i < newListToUse.length; i++) {
                removeList.push(i);
            }
        }
    }

    removeList.sort((a, b) => {
        return b - a;
    });

    for (let i = 0; i < removeList.length; i++) {
        newListToUse.splice(removeList[i], 1);
    }

    if (startBool) {
        newListToUse.splice(getAngleIndex(newListToUse, range[0][0]), 0, range[0]);
    }
    if (endBool) {
        newListToUse.splice(getAngleIndex(newListToUse, range[1][0]), 0, range[1]);
    }

    return newListToUse;
}

function getAngleRange(player1, player2, radius) {
    var angleStuff = getEdgeLinesFromPoint(player1, player2, radius);

    var leftAngle = angleStuff[0];
    var difference = angleStuff[1];

    return [leftAngle, difference];
}

//Given a list of conditions, shift the angle to the closest available spot respecting the range given.
function shiftAngle(listToUse, angle, range) {
    //TODO: shiftAngle needs to respect the range! DONE?
    for (var i = 0; i < listToUse.length; i++) {
        if (angleIsWithin(angle, listToUse[i])) {
            //this.log("Shifting needed!");

            var angle1 = listToUse[i][0];
            var angle2 = rangeToAngle(listToUse[i]);

            var dist1 = (angle - angle1).mod(360);
            var dist2 = (angle2 - angle).mod(360);

            if (dist1 < dist2) {
                if (angleIsWithin(angle1, range))
                    return angle1;

                return angle2;
            }

            if (angleIsWithin(angle2, range))
                return angle2;

            return angle1;
        }
    }
    //this.log("No Shifting Was needed!");
    return angle;
}