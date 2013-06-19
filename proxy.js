var http = require('http');
var net = require('net');
var EventEmitter = require('events').EventEmitter;

var log = require('bookrc');
var debug = require('debug')('localtunnel-server');

// here be dragons, understanding of node http internals will be required
var HTTPParser = process.binding('http_parser').HTTPParser;

// available parsers for requests
// this is borrowed from how node does things by preallocating parsers
var parsers = http.parsers;

var Proxy = function(opt, cb) {
    if (!(this instanceof Proxy)) {
        return new Proxy(opt, cb);
    }

    var self = this;

    self.sockets = [];
    self.waiting = [];

    var id = opt.id;

    // default max is 5
    var max_tcp_sockets = opt.max_tcp_sockets || 5;

    // new tcp server to service requests for this client
    var client_server = net.createServer();
    client_server.listen(function() {
        var port = client_server.address().port;
        debug('tcp server listening on port: %d', port);

        cb(null, {
            // port for lt client tcp connections
            port: port,
            // maximum number of tcp connections allowed by lt client
            max_conn_count: max_tcp_sockets
        });
    });

    // track initial user connection setup
    var conn_timeout;

    // user has 5 seconds to connect before their slot is given up
    function maybe_tcp_close() {
        clearTimeout(conn_timeout);
        conn_timeout = setTimeout(client_server.close.bind(client_server), 5000);
    }

    maybe_tcp_close();

    // no longer accepting connections for this id
    client_server.on('close', function() {
        debug('closed tcp socket for client(%s)', id);

        clearTimeout(conn_timeout);

        // clear waiting by ending responses, (requests?)
        self.waiting.forEach(function(waiting) {
            waiting[1].end();
            waiting[3].end(); // write stream
        });

        self.emit('end');
    });

    // new tcp connection from lt client
    client_server.on('connection', function(socket) {

        // no more socket connections allowed
        if (self.sockets.length >= max_tcp_sockets) {
            return socket.end();
        }

        debug('new connection on port: %s', id);

        // a single connection is enough to keep client id slot open
        clearTimeout(conn_timeout);

        // allocate a response parser for the socket
        // it only needs one since it will reuse it
        socket.parser = parsers.alloc();

        socket._orig_ondata = socket.ondata;
        socket.ondata = upstream_response;

        socket.once('close', function(had_error) {
            debug('client %s closed socket (error: %s)', id, had_error);

            // what if socket was servicing a request at this time?
            // then it will be put back in available after right?

            // remove this socket
            var idx = self.sockets.indexOf(socket);
            if (idx >= 0) {
                self.sockets.splice(idx, 1);
            }

            // need to track total sockets, not just active available

            debug('remaining client sockets: %s', self.sockets.length);

            // no more sockets for this ident
            if (self.sockets.length === 0) {
                debug('all client(%s) sockets disconnected', id);
                maybe_tcp_close();
            }
        });

        // close will be emitted after this
        socket.on('error', function(err) {
            log.error(err);
            socket.end();
        });

        self.sockets.push(socket);

        var next = self.waiting.shift();
        if (next) {
            debug('handling queued request');
            self.proxy_request(next[0], next[1], next[2], next[3]);
        }
    });

    client_server.on('error', function(err) {
        log.error(err);
    });
};

Proxy.prototype.__proto__ = EventEmitter.prototype;

Proxy.prototype.proxy_request = function(req, res, rs, ws) {
    var self = this;

    // socket is a tcp connection back to the user hosting the site
    var sock = self.sockets.shift();

    // queue request
    if (!sock) {
        debug('no more clients, queued: %s', req.url);
        rs.pause();
        self.waiting.push([req, res, rs, ws]);
        return;
    }

    debug('handle req: %s', req.url);

    // pipe incoming request into tcp socket
    // incoming request will close the socket when done
    // lt client should establish a new socket once request is finished
    // we do this instead of keeping socket open to make things easier
    rs.pipe(sock);

    sock.ws = ws;
    sock.req = req;

    // since tcp connection to upstream are kept open
    // invoke parsing so we know when the response is complete
    var parser = sock.parser;
    parser.reinitialize(HTTPParser.RESPONSE);
    parser.socket = sock;

    // we have completed a response
    // the tcp socket is free again
    parser.onIncoming = function (res) {
        parser.onMessageComplete = function() {
            debug('ended response: %s', req.url);

            // any request we had going on is now done
            ws.end();
            sock.end();

            // no more forwarding
            delete sock.ws;
            delete sock.req;
            delete parser.onIncoming;
        };
    };

    rs.resume();
};

Proxy.prototype.proxy_upgrade = function(req, socket, head) {

    var sock = self.sockets.shift();
    if (!sock) {
        // no available sockets to upgrade to
        // TODO queue?
        return socket.end();
    }

    var stream = req.createRawStream();

    sock.ws = ws;
    sock.upgraded = true;

    stream.once('end', function() {
        delete sock.ws;

        // when this ends, we just reset the socket to the lt client
        // this is easier than trying to figure anything else out
        sock.end();
    });

    stream.pipe(sock);
    sock.once('end', socket.end.bind(ws));
};

function upstream_response(d, start, end) {
    var socket = this;

    var ws = socket.ws;
    if (!ws) {
        return log.warn('no stream set for req:', socket.req.url);
    }

    ws.write(d.slice(start, end));

    if (socket.upgraded) {
        return;
    }

    var ret = socket.parser.execute(d, start, end - start);
    if (ret instanceof Error) {
        log.error(ret);
        parsers.free(parser);
        socket.destroy(ret);
    }
}

module.exports = Proxy;

