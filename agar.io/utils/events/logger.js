'use strict';

const { EventEmitter } = require('events');
const range = require('../range');

const { defineOptions,
    eventLog: { options: defaults } } = require('../../config');

class EventLog extends EventEmitter {
    constructor(options) {
        super();

        defineOptions(this, defaults, options);

        let log = (...args) => console.log(this.name + ':', ...args);

        let emit = this.emit.bind(this);

        range(this.minLevel, this.maxLevel).forEach(level => {
            let method = level > this.minLevel ? 'emit_' + level : 'emit';

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
        this.onlyEmit = emit;
    }
}

module.exports = EventLog;
