'use strict';

// https://nodejs.org/en/docs/es6/
const requiredArgs = '--harmony --harmony_destructuring --harmony_rest_parameters';

requiredArgs.split(' ').every(function checkProcess(arg) {
    let valid = process.execArgv.indexOf(arg) !== -1;

    if (valid == false) {
        console.error((new Error('This package requires that you execute node with at ' +
            'least the following arguments: ' + requiredArgs + ['\nExpected:', process.argv[0],
                requiredArgs, process.argv[1], process.argv.slice(2)].join(' '))).stack);

        try {
            require('v8').setFlagsFromString(requiredArgs);
        }
        catch (error) {
            /*
                https://nodejs.org/api/process.html#process_exit_codes
                    9 - Invalid Argument - Either an unknown option was specified,
                    or an option requiring a value was provided without a value.
            */
            process.exit(9);
        }
    }

    return valid;
});

module.exports = { utils: require('./utils') };

defineLazyModuleGetter(this, 'Helper', './class/helper');
defineLazyModuleGetter(this, 'Bot', './class/bot');
defineLazyModuleGetter(this, 'Client', './class/client');
defineLazyModuleGetter(this, 'config', './config');
