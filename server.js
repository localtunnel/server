var log = require('bookrc');
var express = require('express');
var taters = require('taters');
var enchilada = require('enchilada');
var makeup = require('makeup');
var engine = require('engine.io');
var browserkthx = require('browserkthx');
var debug = require('debug')('localtunnel-server');
var createRawServer = require('http-raw');

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

// return true if request will be handled, false otherwise
function middleware(req, res) {

    // without a hostname, we won't know who the request is for
    var hostname = req.headers.host;
    if (!hostname) {
        return false;
    }

    var match = hostname.match(/^([a-z]{4})[.].*/);

    // not for a specific client
    if (!match) {
        var match = req.url.match(/\/([a-z]{4})$/);

        var req_id;

        if (req.url === '/?new') {
            req_id = rand_id();
        }
        else if (match && match[1]) {
            req_id = match[1];
        }

        // will not handle
        if (!req_id) {
            return false;
        }

        new_client(req_id, {}, function(err, info) {
            if (err) {
                res.statusCode = 500;
                return res.end(err.message);
            }

            var url = 'http://' + req_id + '.' + req.headers.host;
            info.url = url;
            res.end(JSON.stringify(info));
        });

        return true;
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

    var rs = req.createRawStream();
    var ws = res.createRawStream();

    client.proxy_request(req, res, rs, ws);
    return true;
}

var handle_upgrade = function(req, socket, head) {
    var hostname = req.headers.host;
    if (!hostname) {
        return socket.end();
    }

    var match = hostname.match(/^([a-z]{4})[.].*/);

    // not handled by us
    if (!match) {
        return false;
    }

    var client_id = match[1];
    var client = clients[client_id];

    // no such subdomain
    if (!client) {
        return socket.end();
    }

    client.handle_upgrade(req, socket, head);
    return true;
};

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

    var server = createRawServer();

    var app = express();

    app.set('view engine', 'html');
    app.set('views', __dirname + '/views');
    app.engine('html', require('hbs').__express);

    app.use(function(req, res, next) {
        if (middleware(req, res)) {
            return;
        }

        next();
    });

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

    server.on('request', app);
    server.on('upgrade', handle_upgrade);

    server.on('upgrade', function(req, socket, head) {
        if (handle_upgrade(req, socket, head)) {
            return;
        }

        eio_server.handleUpgrade(req, socket, head);
    });

    return server;
};

