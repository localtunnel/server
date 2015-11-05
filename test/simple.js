var http = require('http');
var url = require('url');
var assert = require('assert');
var localtunnel = require('localtunnel');

var localtunnel_server = require('../server')({
    max_tcp_sockets: 2
});

var lt_server_port

suite('simple');

test('set up localtunnel server', function(done) {
    var server = localtunnel_server.listen(function() {
        lt_server_port = server.address().port;
        done();
    });
});

test('set up local http server', function(done) {
    var server = http.createServer(function(req, res) {
        res.end('hello world!');
    });

    server.listen(function() {
        test._fake_port = server.address().port;
        done();
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

test('should respond to request', function(done) {
    var hostname = url.parse(test._fake_url).hostname;
    var opt = {
        host: 'localhost',
        port: lt_server_port,
        headers: {
            host: hostname + '.tld'
        }
    };

    http.get(opt, function(res) {
        var body = '';
        res.setEncoding('utf-8');
        res.on('data', function(chunk) {
            body += chunk;
        });

        res.on('end', function() {
            assert.equal(body, 'hello world!');
            done();
        });
    });
});
