var log = require('bookrc');
var express = require('express');
var tldjs = require('tldjs');
var on_finished = require('on-finished');
var debug = require('debug')('localtunnel-server');
var http_proxy = require('http-proxy');
var http = require('http');

var BindingAgent = require('./lib/BindingAgent');

var proxy = http_proxy.createProxyServer({
    target: 'http://localtunnel.github.io'
});

proxy.on('error', function(err) {
    log.error(err);
});

proxy.on('proxyReq', function(proxyReq, req, res, options) {
    // rewrite the request so it hits the correct url on github
    // also make sure host header is what we expect
    proxyReq.path = '/www' + proxyReq.path;
    proxyReq.setHeader('host', 'localtunnel.github.io');
});

var Proxy = require('./proxy');
var rand_id = require('./lib/rand_id');

var PRODUCTION = process.env.NODE_ENV === 'production';

// id -> client http server
var clients = Object.create(null);

// proxy statistics
var stats = {
    tunnels: 0
};

// are we serving from a subdomain?
var sub = false; 

function maybe_bounce(req, res, sock, head) {
    // without a hostname, we won't know who the request is for
    var hostname = req.headers.host;
    if (!hostname) {
        return false;
    }

    var subdomain = tldjs.getSubdomain(hostname);
    // if we're serving from a subdomain do a proper check
    if (sub) {
        var subsub = (subdomain || '').split('.');
        subdomain = subsub.length > 1 ? subsub[0] : '';
    }

    if (!subdomain) {
        return false;
    }

    var client_id = subdomain;
    var client = clients[client_id];

    // no such subdomain
    // we use 502 error to the client to signify we can't service the request
    if (!client) {
        res.statusCode = 502;
        res.end('localtunnel error: no active client for \'' + client_id + '\'');
        req.connection.destroy();
        return true;
    }

    var finished = false;
    if (sock) {
        sock.once('end', function() {
            finished = true;
        });
    }

    if (res) {
        // flag if we already finished before we get a socket
        // we can't respond to these requests
        on_finished(res, function(err) {
            finished = true;
            req.connection.destroy();
        });
    }

    // TODO add a timeout, if we run out of sockets, then just 502

    // get client port
    client.next_socket(function(socket, done) {
        done = done || function() {};

        // the request already finished or client disconnected
        if (finished) {
            return done();
        }

        // happens when client upstream is disconnected
        // we gracefully inform the user and kill their conn
        // without this, the browser will leave some connections open
        // and try to use them again for new requests
        // we cannot have this as we need bouncy to assign the requests again
        else if (!socket) {
            res.statusCode = 504;
            res.end();
            req.connection.destroy();
            return;
        }

        // websocket requests are special in that we simply re-create the header info
        // and directly pipe the socket data
        // avoids having to rebuild the request and handle upgrades via the http client
        if (res === null) {
            var arr = [req.method + ' ' + req.url + ' HTTP/' + req.httpVersion];
            for (var i=0 ; i < (req.rawHeaders.length-1) ; i+=2) {
                arr.push(req.rawHeaders[i] + ': ' + req.rawHeaders[i+1]);
            }

            arr.push('');
            arr.push('');

            socket.pipe(sock).pipe(socket);
            socket.write(arr.join('\r\n'));
            socket.once('end', function() {
                done();
            });

            return;
        }

        var agent = new BindingAgent({
            socket: socket
        });

        var opt = {
            path: req.url,
            agent: agent,
            method: req.method,
            headers: req.headers
        };

        var client_req = http.request(opt, function(client_res) {
            // write response code and headers
            res.writeHead(client_res.statusCode, client_res.headers);
            
            client_res.pipe(res);
            on_finished(client_res, function(err) {
                done();
            });
        });

        req.pipe(client_req);
    });

    return true;
}

function new_client(id, opt, cb) {

    // can't ask for id already is use
    // TODO check this new id again
    if (clients[id]) {
        id = rand_id();
    }

    var popt = {
        id: id,
        max_tcp_sockets: opt.max_tcp_sockets
    };

    var client = Proxy(popt, function(err, info) {
        if (err) {
            return cb(err);
        }

        ++stats.tunnels;
        clients[id] = client;

        info.id = id;

        cb(err, info);
    });

    client.on('end', function() {
        --stats.tunnels;
        delete clients[id];
    });
}

module.exports = function(opt) {
    opt = opt || {};

    var schema = opt.secure ? 'https' : 'http';
    
    sub = opt.sub || false;

    var app = express();

    app.get('/', function(req, res, next) {
        if (req.query['new'] === undefined) {
            return next();
        }

        var req_id = rand_id();
        debug('making new client with id %s', req_id);
        new_client(req_id, opt, function(err, info) {
            if (err) {
                res.statusCode = 500;
                return res.end(err.message);
            }

            var url = schema + '://' + req_id + '.' + req.headers.host;
            info.url = url;
            res.json(info);
        });
    });

    app.get('/', function(req, res, next) {
        proxy.web(req, res);
    });

    app.get('/assets/*', function(req, res, next) {
        proxy.web(req, res);
    });

    app.get('/favicon.ico', function(req, res, next) {
        proxy.web(req, res);
    });

    app.get('/:req_id', function(req, res, next) {
        var req_id = req.params.req_id;

        // limit requested hostnames to 63 characters
        if (! /^[a-z0-9]{4,63}$/.test(req_id)) {
            var err = new Error('Invalid subdomain. Subdomains must be lowercase and between 4 and 63 alphanumeric characters.');
            err.statusCode = 403;
            return next(err);
        }

        debug('making new client with id %s', req_id);
        new_client(req_id, opt, function(err, info) {
            if (err) {
                return next(err);
            }

            var url = schema + '://' + req_id + '.' + req.headers.host;
            info.url = url;
            res.json(info);
        });

    });

    app.use(function(err, req, res, next) {
        var status = err.statusCode || err.status || 500;
        res.status(status).json({
            message: err.message
        });
    });

    var server = http.createServer();

    server.on('request', function(req, res) {
        debug('request %s', req.url);
        if (maybe_bounce(req, res, null, null)) {
            return;
        };

        app(req, res);
    });

    server.on('upgrade', function(req, socket, head) {
        if (maybe_bounce(req, null, socket, head)) {
            return;
        };

        socket.destroy();
    });

    return server;
};
