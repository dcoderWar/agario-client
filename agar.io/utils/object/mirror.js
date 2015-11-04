'use strict';

// Requires global owns, needs optional type checking

module.exports = mirror;

function mirror(target, source, descriptors, weak) {
    let keys = Object.keys(descriptors);
    for (let descriptor, key, value, length = keys.length, i = 0; i < length; i++) {
        key = keys[i];
        descriptor = descriptors[key];

        if (descriptor === mirror.descriptor) {
            Object.defineProperty(target, key, {
                set(value) {
                    source[key] = value;
                },
                get() {
                    return source[key];
                }
            });
        }
        else if (descriptor === mirror.set) {
            let privateValue;
            Object.defineProperty(target, key, {
                set(value) {
                    source[key] = privateValue = value;
                },
                get () {
                    return privateValue;
                }
            })
        }
        else if (descriptor === mirror.get) {
            Object.defineProperty(target, key, {
                get() {
                    return source[key];
                }
            });
        }
        else if (descriptor === mirror.method) {
            value = source[key];
            if (typeof(value) === 'function') {
                target[key] = bind(value, source);
            }
            else if (weak) {
                target[key] = function () {}
            }
            else {
                throw new TypeError('Source method "' + key + '" is not a typeof function');
            }
        }
        else if (descriptor === mirror.value) {
            if (owns(source, key)) {
                target[key] = source[key];
            }
            else if (weak) {
                target[key] = undefined;
            }
            else {
                throw new TypeError('Source does not have own property "' + key + '"');
            }
        }
        else {
            value = source[key];
            target[key] = value === undefined ? descriptor : value;
        }
    }
}

['descriptor', 'set', 'get', 'method', 'value'].forEach(descriptor => mirror[descriptor] = {});
