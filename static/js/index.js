var eio = require('engine.io-client');
var flipCounter = require('flip-counter');

var request_counter = new flipCounter('request-count', {
    value: 0,
    pace: 10,
    fW: 30,
    tFH: 20,
    bFH: 40,
    bOffset: 200,
    auto: false
});

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
    request_counter.incrementTo(msg.requests);
    user_counter.incrementTo(msg.tunnels);
});

socket.on('close', function () {
    request_counter.incrementTo(0);
    user_counter.incrementTo(0);
});
