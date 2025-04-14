import { hri } from 'human-readable-ids';

import Client from './Client.js';
import PortManager from "./PortManager.js";
import TunnelAgent from './TunnelAgent.js';
import { newLogger } from './logger.js';

type ClientManagerOptions = {
  max_tcp_sockets?: number
  range?: string
  secret?: string
}
type ClientManagerStats = {
  tunnels: number
}

// Manage sets of clients
//
// A client is a "user session" established to service a remote localtunnel client
export default class ClientManager {

  private readonly logger = newLogger(ClientManager.name)

  // id -> client instance
  private readonly clients = new Map()
  private readonly portManager: PortManager
  
  private readonly stats: ClientManagerStats

  constructor(private readonly opt: ClientManagerOptions = {}) {

    this.portManager = new PortManager({range: this.opt.range })

    // statistics
    this.stats = {
      tunnels: 0
    };

  }

  getStats() {
    return this.stats
  }

  // create a new tunnel with `id`
  // if the id is already used, a random id is assigned
  // if the tunnel could not be created, throws an error
  async newClient(id?: string, secret?: string) : Promise<{
    id: string,
    port: number,
    max_conn_count: number,
    url?: string
  }> {
    const clients = this.clients;
    const stats = this.stats;

    // can't ask for id already is use
    if (!id || clients[id]) {
      id = hri.random();
    }

    this.logger.debug(`Add client id=${id}`)

    const maxSockets = this.opt.max_tcp_sockets || 10;
    const agent = new TunnelAgent({
      portManager: this.portManager,
      clientId: id,
      maxSockets,
    });

    const client = new Client({
      id,
      agent,
      secret,
    });

    // add to clients map immediately
    // avoiding races with other clients requesting same id
    clients[id] = client;

    client.once('close', () => {
      this.removeClient(id);
    });

    // try/catch used here to remove client id
    try {
      const info = await agent.listen();
      ++stats.tunnels;
      return {
        id: id,
        port: info.port,
        max_conn_count: maxSockets,
      };
    }
    catch (err) {
      this.removeClient(id);
      // rethrow error for upstream to handle
      throw err;
    }
  }

  removeClient(id: string) {
    this.logger.debug(`removing client: ${id}`);
    const client = this.clients[id];
    if (!client) {
      return;
    }
    this.portManager.release(client.agent.port);
    --this.stats.tunnels;
    delete this.clients[id];
    client.close();
  }

  hasClient(id: string) {
    return !!this.clients[id];
  }

  getClient(id: string) {
    return this.clients[id];
  }
}
