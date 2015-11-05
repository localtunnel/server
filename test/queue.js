var http = require('http');
var url = require('url');
var assert = require('assert');
var localtunnel = require('localtunnel');

suite('queue');

var localtunnel_server = require('../server')({
    max_tcp_sockets: 1
});

var server;
var lt_server_port;

before('set up localtunnel server', function(done) {
    var lt_server = localtunnel_server.listen(function() {
        lt_server_port = lt_server.address().port;
        done();
    });
});

before('set up local http server', function(done) {
    server = http.createServer();
    server.on('request', function(req, res) {
        // respond sometime later
        setTimeout(function() {
            res.setHeader('x-count', req.headers['x-count']);
            res.end('foo');
        }, 500);
    });

    server.listen(function() {
        var port = server.address().port;

        test._fake_port = port;
        done();
    });
});

before('set up localtunnel client', function(done) {
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

test('query localtunnel server w/ ident', function(done) {
    var uri = test._fake_url;
    var hostname = url.parse(uri).hostname;

    var count = 0;
    var opt = {
        host: 'localhost',
        port: lt_server_port,
        agent: false,
        headers: {
            host: hostname + '.tld'
        },
        path: '/'
    }

    var num_requests = 2;
    var responses = 0;

    function maybe_done() {
        if (++responses >= num_requests) {
            done();
        }
    }

    function make_req() {
        opt.headers['x-count'] = count++;
        http.get(opt, function(res) {
            res.setEncoding('utf8');
            var body = '';

            res.on('data', function(chunk) {
                body += chunk;
            });

            res.on('end', function() {
                assert.equal('foo', body);
                maybe_done();
            });
        });
    }

    for (var i=0 ; i<num_requests ; ++i) {
        make_req();
    }
});

after('shutdown', function() {
    localtunnel_server.close();
});

