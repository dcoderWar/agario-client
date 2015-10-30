'use strict';

const express      = require('express');
const favicon      = require('serve-favicon');

const AgarioHelper = require('./agar.io/helper');

const app = express(), port = parseInt(process.env.PORT || 5000);

const helper = new AgarioHelper({
    secretKey: '8*IS3APUcEkn',
    clones: [
        'agario-client0.herokuapp.com',
        'agario-client1.herokuapp.com',
        'agario-client2.herokuapp.com'
    ],
    debug: 3
});

app.use(favicon(__dirname + '/public/favicon-32x32.png'));

app.set('port', port);

app.get('/', (request, response) =>
    response.send(helper.toString() + ' on port ' + app.get('port') + ' ' + (new Date(helper.lastJoin))));

//noinspection JSUnresolvedFunction
app.use(helper.middleware());

app.listen(app.get('port'), () => console.log(helper.toString() + ' on port', app.get('port')));

// Define listeners
helper.on('server-request', attempts =>
    helper.log('Requesting server in region ' + helper.session.region + ': attempt(s) ' + attempts));

helper.on('connection-error', error => {
    helper.log('Connection failed with reason: ' + error);
    helper.log('Server address set to: ' + helper.server + ' please check if this is correct and working address');
});
