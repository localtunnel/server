var http = require('http');
var url = require('url');
var assert = require('assert');
var localtunnel = require('localtunnel');
var WebSocket = require('ws');
var WebSocketServer = require('ws').Server;

var localtunnel_server = require('../server')();

var lt_server_port

test('set up localtunnel server', function(done) {
    var server = localtunnel_server.listen(function() {
        lt_server_port = server.address().port;
        console.log('lt server on:', lt_server_port);
        done();
    });
});

test('set up local websocket server', function(done) {

    var wss = new WebSocketServer({ port: 0 }, function() {
        test._fake_port = wss._server.address().port;
        done();
    });

    wss.on('connection', function connection(ws) {
        ws.on('message', function incoming(message) {
            ws.send(message);
        });
    });
});

test('set up localtunnel client', function(done) {
    var opt = {
        host: 'http://localhost:' + lt_server_port,
    };

    localtunnel(test._fake_port, opt, function(err, tunnel) {
        assert.ifError(err);
        var url = tunnel.url;
        assert.ok(new RegExp('^http:\/\/.*localhost:' + lt_server_port + '$').test(url));
        test._fake_url = url;
        done(err);
    });
});

test('test websocket server request', function(done) {
    var hostname = url.parse(test._fake_url).hostname;
    var ws = new WebSocket('http://localhost:' + lt_server_port, {
        headers: {
            host: hostname + '.tld'
        }
    });
    ws.on('message', function(msg) {
        assert.equal(msg, 'something');
        done();
    });

    ws.on('open', function open() {
        ws.send('something');
    });
});
