var eio = require('engine.io-client');
var flipCounter = require('flip-counter');

var user_counter = new flipCounter('user-count', {
    value: 0,
    pace: 10,
    fW: 30,
    tFH: 20,
    bFH: 40,
    bOffset: 200,
    auto: false
});

var socket = eio();
socket.on('open', function () {});

socket.on('message', function (data) {
    var msg = JSON.parse(data);
    user_counter.incrementTo(msg.tunnels);
});

socket.on('close', function () {
    user_counter.incrementTo(0);
});

// load google analytics after above starts
require('./ga');
