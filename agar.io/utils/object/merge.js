/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";


// This code originates from https://github.com/mozilla/addon-sdk/blob/master/lib/sdk/util/object.js
module.exports = merge;

/**
 * Merges all the properties of all arguments into first argument. If two or
 * more argument objects have own properties with the same name, the property
 * is overridden, with precedence from right to left, implying, that properties
 * of the object on the left are overridden by a same named property of the
 * object on the right.
 *
 * Any argument given with "falsy" value - commonly `null` and `undefined` in
 * case of objects - are skipped.
 *
 * @examples
 *    var a = { bar: 0, a: 'a' }
 *    var b = merge(a, { foo: 'foo', bar: 1 }, { foo: 'bar', name: 'b' });
 *    b === a   // true
 *    b.a       // 'a'
 *    b.foo     // 'bar'
 *    b.bar     // 1
 *    b.name    // 'b'
 */
function merge(source) {
    let descriptor = {};

    // `Boolean` converts the first parameter to a boolean value. Any object is
    // converted to `true` where `null` and `undefined` becames `false`. Therefore
    // the `filter` method will keep only objects that are defined and not null.
    Array.slice(arguments, 1).filter(Boolean).forEach(function onEach(properties) {
        getOwnPropertyIdentifiers(properties).forEach(function(name) {
            descriptor[name] = Object.getOwnPropertyDescriptor(properties, name);
        });
    });
    return Object.defineProperties(source, descriptor);
}

// get object's own property Symbols and/or Names, including nonEnumerables by default
function getOwnPropertyIdentifiers(object, options = { names: true, symbols: true, nonEnumerables: true }) {
    const symbols = !options.symbols ? [] :
        Object.getOwnPropertySymbols(object);
    const names = !options.names ? [] :
        options.nonEnumerables ? Object.getOwnPropertyNames(object) :
            Object.keys(object);
    return [...names, ...symbols];
}
