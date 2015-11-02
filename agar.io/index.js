'use strict';

const { defineLazyLoader } = require('./utils');

module.exports = {};

defineLazyLoader(module.exports, 'Helper', './class/helper');
defineLazyLoader(module.exports, 'Bot', './class/bot');
defineLazyLoader(module.exports, 'Client', './class/client');

defineLazyLoader(module.exports, 'utils', './utils');
defineLazyLoader(module.exports, 'config', './config');