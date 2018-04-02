import http from 'http';
import url from 'url';
import assert from 'assert';
import localtunnel from 'localtunnel';

import CreateServer from '../server';

const localtunnel_server = CreateServer({
    domain: 'domain.example.com',
});

process.on('uncaughtException', (err) => {
    console.error(err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(reason);
});

suite('domain');

var lt_server_port;

before('set up localtunnel server', function(done) {
    var server = localtunnel_server.listen(function() {
        lt_server_port = server.address().port;
        done();
    });
});

test('landing page', function(done) {
    var opt = {
        host: 'localhost',
        port: lt_server_port,
        headers: {
            host: 'domain.example.com'
        },
        path: '/'
    }

    var req = http.request(opt, function(res) {
        res.setEncoding('utf8');
        assert.equal(res.headers.location, 'https://localtunnel.github.io/www/')
        done();
    });

    req.end();
});

after('shutdown', function() {
    localtunnel_server.close();
});
