import { Agent } from 'http';
import net from 'net';
import assert from 'assert';
import log from 'book';
import Debug from 'debug';

const DEFAULT_MAX_SOCKETS = 10;

// Implements an http.Agent interface to a pool of tunnel sockets
// A tunnel socket is a connection _from_ a client that will
// service http requests. This agent is usable wherever one can use an http.Agent
class TunnelAgent extends Agent {
    constructor(options = {}) {
        super({
            keepAlive: true,
            // only allow keepalive to hold on to one socket
            // this prevents it from holding on to all the sockets so they can be used for upgrades
            maxFreeSockets: 1,
        });

        // sockets we can hand out via createConnection
        this.availableSockets = [];

        // when a createConnection cannot return a socket, it goes into a queue
        // once a socket is available it is handed out to the next callback
        this.waitingCreateConn = [];

        this.debug = Debug('lt:TunnelAgent');

        // track maximum allowed sockets
        this.activeSockets = 0;
        this.maxTcpSockets = options.maxTcpSockets || DEFAULT_MAX_SOCKETS;

        // new tcp server to service requests for this client
        this.server = net.createServer();

        // flag to avoid double starts
        this.started = false;
    }

    listen() {
        const server = this.server;
        if (this.started) {
            throw new Error('already started');
        }
        this.started = true;

        server.on('close', this._onClose.bind(this));
        server.on('connection', this._onConnection.bind(this));
        server.on('error', (err) => {
            // where do these errors come from?
            // other side creates a connection and then is killed?
            if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') {
                return;
            }
            log.error(err);
        });

        return new Promise((resolve) => {
            server.listen(() => {
                const port = server.address().port;
                this.debug('tcp server listening on port: %d', port);

                resolve({
                    // port for lt client tcp connections
                    port: port,
                });
            });
        });
    }

    _onClose() {
        this.debug('closed tcp socket');
        clearTimeout(this.connTimeout);
        // we will not invoke these callbacks?
        // TODO(roman): we could invoke these with errors...?
        // this makes downstream have to handle this
        this.waitingCreateConn = [];
        this.emit('end');
    }

    // new socket connection from client for tunneling requests to client
    _onConnection(socket) {
        // no more socket connections allowed
        if (this.activeSockets >= this.maxTcpSockets) {
            this.debug('no more sockets allowed');
            socket.destroy();
            return false;
        }

        // a new socket becomes available
        if (this.activeSockets == 0) {
            this.emit('online');
        }
        
        this.activeSockets += 1;
        this.debug('new connection from: %s:%s', socket.address().address, socket.address().port);
        
        // a single connection is enough to keep client id slot open
        clearTimeout(this.connTimeout);

        socket.once('close', (had_error) => {
            this.debug('closed socket (error: %s)', had_error);
            this.debug('removing socket');
            this.activeSockets -= 1;
            // remove the socket from available list
            const idx = this.availableSockets.indexOf(socket);
            if (idx >= 0) {
                this.availableSockets.splice(idx, 1);
            }
            // need to track total sockets, not just active available
            this.debug('remaining client sockets: %s', this.availableSockets.length);
            // no more sockets for this session
            // the session will become inactive if client does not reconnect
            if (this.availableSockets.length <= 0) {
                this.debug('all sockets disconnected');
                this.emit('offline');
            }
        });

        // close will be emitted after this
        socket.once('error', (err) => {
            // we do not log these errors, sessions can drop from clients for many reasons
            // these are not actionable errors for our server
            socket.destroy();
        });

        // make socket available for those waiting on sockets
        this.availableSockets.push(socket);

        // flush anyone waiting on sockets
        this._callWaitingCreateConn();
    }

    // invoke when a new socket is available and there may be waiting createConnection calls
    _callWaitingCreateConn() {
        const fn = this.waitingCreateConn.shift();
        if (!fn) {
            return;
        }

        this.debug('handling queued request');
        this.createConnection({}, fn);
    }

    // fetch a socket from the available socket pool for the agent
    // if no socket is available, queue
    // cb(err, socket)
    createConnection(options, cb) {
        // socket is a tcp connection back to the user hosting the site
        const sock = this.availableSockets.shift();

        // no available sockets
        // wait until we have one
        if (!sock) {
            this.waitingCreateConn.push(cb);
            this.debug('waiting');
            return;
        }

        this.debug('socket given');
        cb(null, sock);
    }

    destroy() {
        this.server.close();
        super.destroy();
    }
}

export default TunnelAgent;
