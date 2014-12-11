var log = require('bookrc');
var express = require('express');
var bouncy = require('bouncy');
var taters = require('taters');
var enchilada = require('enchilada');
var stylish = require('stylish');
var makeover = require('makeover');
var makeup = require('makeup');
var browserkthx = require('browserkthx');
var tldjs = require('tldjs');
var on_finished = require('on-finished');
var favicon = require('serve-favicon');
var debug = require('debug')('localtunnel-server');

var Proxy = require('./proxy');
var rand_id = require('./lib/rand_id');

var PRODUCTION = process.env.NODE_ENV === 'production';

// id -> client http server
var clients = Object.create(null);

// proxy statistics
var stats = {
    tunnels: 0
};

function maybe_bounce(req, res, bounce) {
    // without a hostname, we won't know who the request is for
    var hostname = req.headers.host;
    if (!hostname) {
        return false;
    }

    var subdomain = tldjs.getSubdomain(hostname);
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

    // flag if we already finished before we get a socket
    // we can't respond to these requests
    var finished = false;
    on_finished(res, function(err) {
        finished = true;
        req.connection.destroy();
    });

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

        var stream = bounce(socket, { headers: { connection: 'close' } });

        stream.on('error', function(err) {
            socket.destroy();
            req.connection.destroy();
            done();
        });

        // return the socket to the client pool
        stream.once('end', function() {
            done();
        });

        on_finished(res, function(err) {
            if (err) {
                req.connection.destroy();
                socket.destroy();
                done();
            }
        });
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

    var app = express();

    app.set('view engine', 'html');
    app.set('views', __dirname + '/views');
    app.engine('html', require('hbs').__express);

    taters(app, {
        cache: PRODUCTION
    });

    app.use(favicon(__dirname + '/static/favicon.ico'));
    app.use(browserkthx({ ie: '< 9' }));

    app.use(stylish({
        src: __dirname + '/static/',
        compress: PRODUCTION,
        cache: PRODUCTION,
        setup: function(stylus) {
            return stylus.use(makeover());
        }
    }));

    app.use(enchilada({
        src: __dirname + '/static/',
        compress: PRODUCTION,
        cache: PRODUCTION
    }));

    app.use(express.static(__dirname + '/static'));

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
        return res.render('index');
    });

    app.get('/:req_id', function(req, res, next) {
        var req_id = req.param('req_id');

        // limit requested hostnames to 20 characters
        if (! /^[A-Za-z0-9]{4,20}$/.test(req_id)) {
            var err = new Error('Invalid subdomain. Subdomains must be between 4 and 20 alphanumeric characters.');
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

    var app_port = 0;
    var app_server = app.listen(app_port, function() {
        app_port = app_server.address().port;
    });

    var server = bouncy(function(req, res, bounce) {
        debug('request %s', req.url);

        // if we should bounce this request, then don't send to our server
        if (maybe_bounce(req, res, bounce)) {
            return;
        };

        bounce(app_port);
    });

    return server;
};
