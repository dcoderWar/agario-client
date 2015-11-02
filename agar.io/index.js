'use strict';

function defineLazyLoader(e,m,p){Object.defineProperty(e,m,{configurable:true,get(){
    let d=require(p);Object.defineProperty(e,m,{value:d});return d;}});}

module.exports = {};

defineLazyLoader(module.exports, 'Helper', './class/helper');
defineLazyLoader(module.exports, 'Bot', './class/bot');
defineLazyLoader(module.exports, 'Client', './class/client');

defineLazyLoader(module.exports, 'utils', './utils');
defineLazyLoader(module.exports, 'config', './config');
