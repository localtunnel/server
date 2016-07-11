import net from 'net';
import EventEmitter from 'events';
import log from 'bookrc';
import Debug from 'debug';

const debug = Debug('localtunnel:server');

const Proxy = function(opt) {
    if (!(this instanceof Proxy)) {
        return new Proxy(opt);
    }

    const self = this;

    self.sockets = [];
    self.waiting = [];
    self.id = opt.id;

    // default max is 10
    self.max_tcp_sockets = opt.max_tcp_sockets || 10;

    // new tcp server to service requests for this client
    self.server = net.createServer();

    // track initial user connection setup
    self.conn_timeout = undefined;

    self.debug = Debug(`localtunnel:server:${self.id}`);
};

Proxy.prototype.__proto__ = EventEmitter.prototype;

Proxy.prototype.start = function(cb) {
    const self = this;
    const server = self.server;

    if (self.started) {
        cb(new Error('already started'));
        return;
    }
    self.started = true;

    server.on('close', self._cleanup.bind(self));
    server.on('connection', self._handle_socket.bind(self));

    server.on('error', function(err) {
        // where do these errors come from?
        // other side creates a connection and then is killed?
        if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') {
            return;
        }

        log.error(err);
    });

    server.listen(function() {
        const port = server.address().port;
        self.debug('tcp server listening on port: %d', port);

        cb(null, {
            // port for lt client tcp connections
            port: port,
            // maximum number of tcp connections allowed by lt client
            max_conn_count: self.max_tcp_sockets
        });
    });

    self._maybe_destroy();
};

Proxy.prototype._maybe_destroy = function() {
    const self = this;

    clearTimeout(self.conn_timeout);
    self.conn_timeout = setTimeout(function() {
        // sometimes the server is already closed but the event has not fired?
        try {
            clearTimeout(self.conn_timeout);
            self.server.close();
        }
        catch (err) {
            self._cleanup();
        }
    }, 5000);
}

// new socket connection from client for tunneling requests to client
Proxy.prototype._handle_socket = function(socket) {
    const self = this;

    // no more socket connections allowed
    if (self.sockets.length >= self.max_tcp_sockets) {
        return socket.end();
    }

    self.debug('new connection from: %s:%s', socket.address().address, socket.address().port);

    // a single connection is enough to keep client id slot open
    clearTimeout(self.conn_timeout);

    socket.once('close', function(had_error) {
        self.debug('closed socket (error: %s)', had_error);

        // what if socket was servicing a request at this time?
        // then it will be put back in available after right?
        // we need a list of sockets servicing requests?

        // remove this socket
        const idx = self.sockets.indexOf(socket);
        if (idx >= 0) {
            self.sockets.splice(idx, 1);
        }

        // need to track total sockets, not just active available
        self.debug('remaining client sockets: %s', self.sockets.length);

        // no more sockets for this ident
        if (self.sockets.length === 0) {
            self.debug('all sockets disconnected');
            self._maybe_destroy();
        }
    });

    // close will be emitted after this
    socket.on('error', function(err) {
        // we don't log here to avoid logging crap for misbehaving clients
        socket.destroy();
    });

    self.sockets.push(socket);
    self._process_waiting();
};

Proxy.prototype._process_waiting = function() {
    const self = this;
    const wait_cb = self.waiting.shift();
    if (wait_cb) {
        self.debug('handling queued request');
        self.next_socket(wait_cb);
    }
};

Proxy.prototype._cleanup = function() {
    const self = this;
    self.debug('closed tcp socket for client(%s)', self.id);

    clearTimeout(self.conn_timeout);

    // clear waiting by ending responses, (requests?)
    self.waiting.forEach(handler => handler(null));

    self.emit('end');
};

Proxy.prototype.next_socket = function(handler) {
    const self = this;

    // socket is a tcp connection back to the user hosting the site
    const sock = self.sockets.shift();

    if (!sock) {
        self.debug('no more client, queue callback');
        self.waiting.push(handler);
        return;
    }

    self.debug('processing request');
    handler(sock)
    .catch((err) => {
        log.error(err);
    })
    .finally(() => {
        if (!sock.destroyed) {
            self.debug('retuning socket');
            self.sockets.push(sock);
        }

        // no sockets left to process waiting requests
        if (self.sockets.length === 0) {
            return;
        }

        self._process_waiting();
    });
};

Proxy.prototype._done = function() {
    const self = this;
};

export default Proxy;
