import { hri } from "human-readable-ids";
import Debug from "debug";
import Client from "./client";
import { TunnelAgent } from "./agent";
import { Options } from "../server";

// Manage sets of clients
// A client is a "user session" established to service a remote localtunnel client
export class ClientManager {
  public opt: Options;
  public clients: Map<string, Client>;
  public stats: { tunnels: number };
  public debug: any;

  constructor(opt: Options) {
    this.opt = opt || {};

    // id -> client instance
    this.clients = new Map();

    // statistics
    this.stats = {
      tunnels: 0,
    };

    this.debug = Debug("lt:ClientManager");
  }

  // create a new tunnel with `id`
  // if the id is already used, a random id is assigned
  // if the tunnel could not be created, throws an error
  async newClient(id: string) {
    const clients = this.clients;
    const stats = this.stats;

    // can't ask for id already is use
    if (clients.has(id)) {
      id = hri.random();
    }

    const maxSockets = this.opt.max_tcp_sockets;

    const agent = new TunnelAgent({
      clientId: id,
      maxSockets: 10,
    });

    const client = new Client({ id, agent });

    // add to clients map immediately to avoid races with other clients requesting same id
    clients.set(id, client);

    client.once("close", (e) => {
      console.log(`\n\n\n\x1b[33m==>Closing:  \x1b[0m\n`);
      console.log(e);
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
        url: "",
      };
    } catch (err) {
      this.removeClient(id);
      // rethrow error for upstream to handle
      throw err;
    }
  }

  getClient(id: string) {
    return this.clients.get(id);
  }

  hasClient(id: string) {
    return !!this.getClient(id);
  }

  removeClient(id: string) {
    this.debug("removing client: %s", id);

    const client = this.getClient(id);

    if (!client) {
      console.log(`\n\n\n\x1b[33m==>NO CLIENT \x1b[0m\n`);
      return;
    }

    --this.stats.tunnels;

    delete this.clients[id];

    client.close();
  }
}
