var log = require('bookrc');
var express = require('express');
var bouncy = require('bouncy');
var taters = require('taters');
var enchilada = require('enchilada');
var makeup = require('makeup');
var engine = require('engine.io');
var browserkthx = require('browserkthx');
var debug = require('debug')('localtunnel-server');

var Proxy = require('./proxy');
var rand_id = require('./lib/rand_id');

var kProduction = process.env.NODE_ENV === 'production';

// id -> client http server
var clients = {};

// proxy statistics
var stats = {
    requests: 0,
    waiting: 0,
    tunnels: 0,
};

function maybe_bounce(req, res, bounce) {
    // without a hostname, we won't know who the request is for
    var hostname = req.headers.host;
    if (!hostname) {
        return false;
    }

    var match = hostname.match(/^([a-z]{4})[.].*/);

    // not for a specific client
    // pass on to regular server
    if (!match) {
        return false;
    }

    var client_id = match[1];
    var client = clients[client_id];

    // no such subdomain
    // we use 502 error to the client to signify we can't service the request
    if (!client) {
        res.statusCode = 502;
        res.end('localtunnel error: no active client for \'' + client_id + '\'');
        return true;
    }

    ++stats.requests;

    res.on('close', function() {
        --stats.requests;
    });

    // get client port
    client.next_socket(function(socket, done) {
        var stream = bounce(socket); //, { headers: { connection: 'close' } });

        // return the socket to the client pool
        stream.once('end', function() {
            done();
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

    var app = express();

    app.set('view engine', 'html');
    app.set('views', __dirname + '/views');
    app.engine('html', require('hbs').__express);

    app.use(express.favicon());

    app.use(browserkthx({ ie: '< 9' }));
    app.use(taters({ cache: kProduction }));

    app.use(enchilada({
        src: __dirname + '/static/',
        compress: kProduction,
        cache: kProduction
    }));

    app.use('/css/widgets.css', makeup(__dirname + '/static/css/widgets.css'));
    app.use(express.static(__dirname + '/static'));
    app.use(app.router);

    app.get('/', function(req, res, next) {
        if (!req.query.hasOwnProperty('new')) {
            return next();
        }

        var req_id = rand_id();
        debug('making new client with id %s', req_id);
        new_client(req_id, opt, function(err, info) {
            if (err) {
                res.statusCode = 500;
                return res.end(err.message);
            }

            var url = 'http://' + req_id + '.' + req.headers.host;
            info.url = url;
            res.end(JSON.stringify(info));
        });
    });

    app.get('/:req_id', function(req, res, next) {
        var req_id = req.param('req_id');

        debug('making new client with id %s', req_id);
        new_client(req_id, opt, function(err, info) {
            if (err) {
                res.statusCode = 500;
                return res.end(err.message);
            }

            var url = 'http://' + req_id + '.' + req.headers.host;
            info.url = url;
            res.end(JSON.stringify(info));
        });

    });

    app.get('/', function(req, res, next) {
        return res.render('index');
    });

    // connected engine.io sockets for stats updates
    var eio_sockets = [];

    setInterval(function() {
        eio_sockets.forEach(function(socket) {
            socket.send(JSON.stringify(stats));
        });
    }, 1000);

    var eio_server = new engine.Server();
    eio_server.on('connection', function (socket) {

        eio_sockets.push(socket);
        socket.send(JSON.stringify(stats));

        socket.on('close', function() {

            // remove from socket pool so no more updates are sent
            var idx = eio_sockets.indexOf(socket);
            if (idx >= 0) {
                eio_sockets.splice(idx, 1);
            }
        });
    });

    app.use('/engine.io', function(req, res, next) {
        eio_server.handleRequest(req, res);
    });

    var app_port = 0;
    var app_server = app.listen(app_port, function() {
        app_port = app_server.address().port;
    });

    var server = bouncy(function(req, res, bounce) {
        // if we should bounce this request, then don't send to our server
        if (maybe_bounce(req, res, bounce)) {
            return;
        };

        bounce(app_port);
    });

    return server;
};
