'use strict';

const config = module.exports = (function validateConfig() {
    let config, missing = [], example = {},
        required = ['client', 'bot', 'helper', 'eventLog'];

    try {
        config = require('./config.json');
    }
    catch (error) {
        error.name = 'ConfigError';
        error.message += '\nConfigError: Cannot load configuration from: ' +
            __dirname + require('path').sep + 'config.json\n';

        console.error(error.stack + '\n');
        process.exit(1);
    }

    required.forEach(key => {
        if (!config.hasOwnProperty(key) || !config[key].hasOwnProperty('options'))
            missing.push(key);
    });

    if (missing.length) {
        missing.forEach(key => example[key] = {options: {}});

        let error = new Error('config.json is missing the following' +
            ' required properties:\n\n' + JSON.stringify(example, null, '\t') + '\n');
        error.name = 'ConfigError';

        console.error(error.stack + '\n');
        process.exit(1);
    }

    return config;
}());

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
