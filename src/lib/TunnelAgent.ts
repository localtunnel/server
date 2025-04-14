import log from 'book';
import { Agent } from 'http';
import net, { Socket } from 'net';
import { newLogger } from './logger.js';
import PortManager from './PortManager.js';

const DEFAULT_MAX_SOCKETS = 10;

export type TunnelAgentOptions = {
  clientId?: string
  maxTcpSockets?: number
  maxSockets?: number
  portManager?: PortManager
}

type ServerError = Error & { code: string }

type TunnelConnectionCallback = (err?: Error, socket?: net.Socket) => void

// Implements an http.Agent interface to a pool of tunnel sockets
// A tunnel socket is a connection _from_ a client that will
// service http requests. This agent is usable wherever one can use an http.Agent
class TunnelAgent extends Agent {

  private readonly logger = newLogger(TunnelAgent.name)

  private started: boolean
  private closed: boolean

  private port?: number

  private maxTcpSockets: number
  private connectedSockets: number

  private server: net.Server    
  private readonly availableSockets: Socket[]
  private readonly waitingCreateConn: TunnelConnectionCallback[]
    
  constructor(private readonly options: TunnelAgentOptions = {}) {
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

    // track maximum allowed sockets
    this.connectedSockets = 0;
    this.maxTcpSockets = options.maxTcpSockets || DEFAULT_MAX_SOCKETS;

    // new tcp server to service requests for this client
    this.server = net.createServer();

    // flag to avoid double starts
    this.started = false;
    this.closed = false;
  }

  isStarted() {
    return this.started
  }

  isClosed() {
    return this.isClosed
  }

  stats() {
    return {
      connectedSockets: this.connectedSockets,
    };
  }

  listen() {
    const server = this.server;
    if (this.started) {
      throw new Error('already started');
    }
    this.started = true;

    server.on('close', this._onClose.bind(this));
    server.on('connection', this._onConnection.bind(this));
    server.on('error', (err: ServerError) => {
      // These errors happen from killed connections, we don't worry about them
      if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') {
        return;
      }
      log.error(err);
    });

    return new Promise<{port:number}>((resolve) => {
      const serverPort = this.options.portManager?.getNextAvailable(this.options.clientId)
      server.listen(serverPort, () => {
        const addr = server.address() as net.AddressInfo
        this.port = addr.port
        this.logger.debug(`tcp server listening on port: ${this.port}`);

        resolve({
          // port for lt client tcp connections
          port: this.port,
        });
      });
    });
  }

  _onClose() {
    this.closed = true;
    this.logger.debug('closed tcp socket');
    // flush any waiting connections
    for (const conn of this.waitingCreateConn) {
      conn(new Error('closed'), null);
    }
    this.waitingCreateConn.splice(0)
    this.emit('end');
  }

  // new socket connection from client for tunneling requests to client
  _onConnection(socket: net.Socket) {
    // no more socket connections allowed
    if (this.connectedSockets >= this.maxTcpSockets) {
      this.logger.debug('no more sockets allowed');
      socket.destroy();
      return
    }

    socket.once('close', (hadError) => {
      this.logger.debug(`closed socket (error: ${hadError})` );
      this.connectedSockets -= 1;
      // remove the socket from available list
      const idx = this.availableSockets.indexOf(socket);
      if (idx >= 0) {
        this.availableSockets.splice(idx, 1);
      }

      this.logger.debug(`connected sockets: ${this.connectedSockets}`);
      if (this.connectedSockets <= 0) {
        this.logger.debug('all sockets disconnected');
        this.emit('offline');
      }
    });

    // close will be emitted after this
    socket.once('error', (err: Error) => {
      // we do not log these errors, sessions can drop from clients for many reasons
      // these are not actionable errors for our server
      if(this.options.portManager && this.port) {
        this.options.portManager?.release(this.port);
      }
      socket.destroy();
    });

    if (this.connectedSockets === 0) {
      this.emit('online');
    }

    this.connectedSockets += 1;
    const addr = socket.address() as net.AddressInfo
    this.logger.debug(`new connection from: ${addr.address}:${addr.port}`);

    // if there are queued callbacks, give this socket now and don't queue into available
    const fn = this.waitingCreateConn.shift();
    if (fn) {
      this.logger.debug('giving socket to queued conn request');
      setTimeout(() => {
        fn(null, socket);
      }, 0);
      return
    }

    // make socket available for those waiting on sockets
    this.availableSockets.push(socket);
  }

  // fetch a socket from the available socket pool for the agent
  // if no socket is available, queue
  // cb(err, socket)
  createConnection(options, cb: TunnelConnectionCallback) {

    if (this.closed) {
      cb(new Error('closed'));
      return;
    }

    this.logger.debug('create connection');

    // socket is a tcp connection back to the user hosting the site
    const sock = this.availableSockets.shift();

    // no available sockets
    // wait until we have one
    if (!sock) {
      this.waitingCreateConn.push(cb);
      this.logger.debug(`waiting connected: ${this.connectedSockets}`);
      this.logger.debug(`waiting available: ${this.availableSockets.length}`);
      return;
    }

    this.logger.debug('socket given');
    cb(null, sock);
  }

  destroy() {
    this.server.close();
    super.destroy();
  }
}

export default TunnelAgent;
