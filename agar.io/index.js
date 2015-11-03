'use strict';

// See "agar.io/utils/index.js" for information about what "defineLazyModuleGetter" does
function defineLazyModuleGetter(e,m,p){Object.defineProperty(e,m,{configurable:true,get(){
    let d=require(p);Object.defineProperty(e,m,{value:d});return d;}});}

module.exports = {};

defineLazyModuleGetter(module.exports, 'Helper', './class/helper');
defineLazyModuleGetter(module.exports, 'Bot', './class/bot');
defineLazyModuleGetter(module.exports, 'Client', './class/client');
defineLazyModuleGetter(module.exports, 'utils', './utils');
defineLazyModuleGetter(module.exports, 'config', './config');
