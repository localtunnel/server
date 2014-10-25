var net = require('net');
var EventEmitter = require('events').EventEmitter;

var log = require('bookrc');
var debug = require('debug')('localtunnel-server');

var Proxy = function(opt, cb) {
    if (!(this instanceof Proxy)) {
        return new Proxy(opt, cb);
    }

    var self = this;

    self.sockets = [];
    self.waiting = [];

    var id = opt.id;

    // default max is 10
    var max_tcp_sockets = opt.max_tcp_sockets || 10;

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
        conn_timeout = setTimeout(function() {

            // sometimes the server is already closed but the event has not fired?
            try {
                clearTimeout(conn_timeout);
                client_server.close();
            } catch (err) {
                cleanup();
            }
        }, 5000);
    }

    maybe_tcp_close();

    function cleanup() {
        debug('closed tcp socket for client(%s)', id);

        clearTimeout(conn_timeout);

        // clear waiting by ending responses, (requests?)
        self.waiting.forEach(function(waiting) {
            waiting(null);
        });

        self.emit('end');
    }

    // no longer accepting connections for this id
    client_server.on('close', cleanup);

    // new tcp connection from lt client
    client_server.on('connection', function(socket) {

        // no more socket connections allowed
        if (self.sockets.length >= max_tcp_sockets) {
            return socket.end();
        }

        debug('new connection on port: %s', id);

        // a single connection is enough to keep client id slot open
        clearTimeout(conn_timeout);

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
            // we don't log here to avoid logging crap for misbehaving clients
            socket.destroy();
        });

        self.sockets.push(socket);

        var wait_cb = self.waiting.shift();
        if (wait_cb) {
            debug('handling queued request');
            self.next_socket(wait_cb);
        }
    });

    client_server.on('error', function(err) {
        log.error(err);
    });
};

Proxy.prototype.__proto__ = EventEmitter.prototype;

Proxy.prototype.next_socket = function(cb) {
    var self = this;

    // socket is a tcp connection back to the user hosting the site
    var sock = self.sockets.shift();

    // TODO how to handle queue?
    // queue request
    if (!sock) {
        debug('no more client, queue callback');
        return self.waiting.push(cb);
    }

    var done_called = false;
    // put the socket back
    function done() {
        if (done_called) {
            throw new Error('done called multiple times');
        }

        done_called = true;
        if (!sock.destroyed) {
            debug('retuning socket');
            self.sockets.push(sock);
        }

        // no sockets left to process waiting requests
        if (self.sockets.length === 0) {
            return;
        }

        var wait = self.waiting.shift();
        debug('processing queued cb');
        if (wait) {
            return self.next_socket(cb);
        }
    };

    debug('processing request');
    cb(sock, done);
};

Proxy.prototype._done = function() {
    var self = this;
};

module.exports = Proxy;
