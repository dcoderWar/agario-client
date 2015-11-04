'use strict';

/*
 WARNING:
     Don't use the libraries in this directory directly, they might depend on globals.
     Instead require this file or the directory it resides in to access any of the exports
     All of the exports in this directory will be *require'd* on demand aka lazy loaded

 You can visit these links for more information:
     https://nodejs.org/api/globals.html#globals_global
     https://nodejs.org/api/modules.html#modules_folders_as_modules

 The idea of lazy loading these modules was mostly obtained from the following locations:
    https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/XPCOMUtils.jsm#defineLazyGetter()
    https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/XPCOMUtils.jsm#defineLazyModuleGetter%28%29
 */

(function defineGlobals() {
    let unbind = Function.call.bind(Function.bind, Function.call);
    let descriptor = value => ({ value });

    Object.defineProperties(global, {
        owns: descriptor(unbind(Object.prototype.hasOwnProperty)),
        toString: descriptor(unbind(Object.prototype.toString)),
        defineLazyGetter: descriptor(defineLazyGetter),
        defineLazyModuleGetter: descriptor(defineLazyModuleGetter)
    });
}());

defineLazyModuleGetter(require, module, 'EventLog', './events/logger');
defineLazyModuleGetter(require, module, 'mirror', './object/mirror');
defineLazyModuleGetter(require, module, 'merge', './object/merge');
defineLazyModuleGetter(require, module, 'range', './range');
defineLazyModuleGetter(require, module, 'timer', './timer');
defineLazyModuleGetter(require, module, ['createUUID', 'upTime'], './misc');

function defineLazyGetter(obj, name, getter) {
    Object.defineProperty(obj, name, {
        configurable: true,
        enumerable: false,
        get() {
            let value = getter(name);

            Object.defineProperty(obj, name, {
                configurable: true,
                writable: true,
                enumerable: true,
                value: value
            });

            return value;
        }
    })
}

function defineLazyModuleGetter(require, module, symbols, path) {

    if (Array.isArray(symbols)) {
        symbols.forEach(symbol => defineLazyGetter(module.exports, symbol, name => {
            let definition = require(path);

            // The module has already been loaded at this point so all the other specified symbols get defined too
            symbols.forEach(symbol =>
                Object.defineProperty(module.exports, symbol, {
                    configurable: true,
                    writable: true,
                    enumerable: true,
                    value: definition[symbol]
                }));

            return defintion[name];
        }));
    }
    else {
        defineLazyGetter(module.exports, symbols, name => require(path));
    }
}
