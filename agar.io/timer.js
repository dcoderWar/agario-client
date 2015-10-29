'use strict';

module.exports = timer;
timer.once = once;

function timer(timedFn, ms, ...args) {
    let id = 0, active = false;

    if (typeof(timedFn) !== 'function')
        throw new TypeError('setInterval expects [object Function]');

    function start() {
        stop();
        active = true;
        id = setInterval(timedFn, ms, ...args);
        timedFn(...args);
    }

    function stop() {
        if (active) {
            active = false;
            clearInterval(id);
            return true;
        }
        return false;
    }

    Object.defineProperties(timedFn, {
        start: { value: start },
        stop: { value: stop },
        active: {
            get() { return active; }
        }
    });

    return timedFn;
}

function once(timedFn, ms, ...args) {
    let id = 0, active = false;

    if (typeof(timedFn) !== 'function')
        throw new TypeError('setTimeout expects [object Function]');

    function start() {
        stop();
        active = true;
        id = setTimeout(timedFn, ms, ...args);
        timedFn(...args);
    }

    function stop() {
        if (active) {
            active = false;
            clearTimeout(id);
            return true;
        }
        return false;
    }

    Object.defineProperties(timedFn, {
        start: { value: start },
        stop: { value: stop },
        active: {
            get() { return active; }
        }
    });

    return timedFn;
}
