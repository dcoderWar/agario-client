'use strict';

const Bot = require('./bot'), knownBots = {};
const timer = require('./timer');

class Clone {
    constructor(id, x, y, otherBot) {
        this.persist = timer.once(id => delete knownBots[id], 5000, id);
        
        this.update(x, y, otherBot);
    }

    setCords(x, y) {
        if (this.x !== x || this.y !== y) { // If bot is moving...
            this.x = x;
            this.y = y;

            this.persist();
            return true;
        }

        return false;
    }

    computeDistance(otherBot) {
        this.dist = Bot.computeDistance(this.x, this.y, otherBot.x, otherBot.y);
    }
    
    update(x, y, otherBot) {
        if (this.setCords(x, y)) {
            this.computeDistance(otherBot);
            return true;
        }
        return false;
    }
}

module.exports = Clone;
Clone.bots = knownBots;