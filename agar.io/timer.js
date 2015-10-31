'use strict';

module.exports = createTimer(setInterval, clearInterval);
module.exports.once = createTimer(setTimeout, clearTimeout);

function createTimer(setTimer, clearTimer) {
    return function Timer(fn, ms, ...args) {
        let id = 0, active = false;

        if (typeof(fn) !== 'function')
            throw new TypeError('Timer function argument is not typeof function');

        function timer() {
            clear();
            active = true;
            id = setTimer(fn, ms, ...args);
        }

        function clear() {
            if (active) {
                active = false;
                clearTimer(id);
                return true;
            }
            return false;
        }

        Object.defineProperties(timer, {
            stop: {
                value: clear
            },
            active: {
                get() {
                    return active;
                }
            }
        });

        return timer;
    };
}