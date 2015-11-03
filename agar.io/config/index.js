'use strict';

const config = module.exports = require('./config.json');

module.exports.defineOptions = defineOptions;
module.exports.createOptions = createOptions;
module.exports.updateOptions = updateOptions;

const defineOption = config.weakOptions ? defineWeakOption : defineStrongOption;

function defineWeakOption(obj, opt, value) {
    Object.defineProperty(obj, opt, { value });
}

function defineStrongOption(obj, opt, val) {
    let type = toString(val);

    Object.defineProperty(obj, opt, {
        get() { return val },
        set(value) {
            if (toString(value) === type) {
                //noinspection JSUnusedAssignment
                val = value;
            }
        }
    });
}

function defineOptions(obj, defaults, opts) {
    if (opts) {
        for (let keys = Object.keys(defaults), length = keys.length, i = 0; i < length; i++) {
            defineOption(obj, keys[i], defaults[keys[i]]);
            obj[keys[i]] = opts[keys[i]];
        }

    }
    else {
        for (let keys = Object.keys(defaults), length = keys.length, i = 0; i < length; i++)
            defineOption(obj, keys[i], defaults[keys[i]]);
    }

    return obj;
}

function createOptions(obj, defaults, opts) {
    let options = obj.options ? Object.create(obj.options) : {};

    Object.defineProperty(obj, 'options', {
        configurable: true,
        value: defineOptions(options, defaults, opts)
    });

    return options;
}

function updateOptions(obj, opts) {
    let { options } = obj;

    for (let keys = Object.keys(options), length = keys.length, i = 0; i < length; i++)
        options[keys[i]] = opts[keys[i]];

    return options;
}
