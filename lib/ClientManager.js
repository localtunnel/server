import { hri } from 'human-readable-ids';
import Debug from 'debug';

import Client from './Client';
import TunnelAgent from './TunnelAgent';

// Manage sets of clients
//
// A client is a "user session" established to service a remote localtunnel client
class ClientManager {
    constructor(opt) {
        this.opt = opt || {};

        // id -> client instance
        this.clients = new Map();

        // statistics
        this.stats = {
            tunnels: 0
        };

        this.debug = Debug('lt:ClientManager');
    }

    // create a new tunnel with `id`
    // if the id is already used, a random id is assigned
    // if the tunnel could not be created, throws an error
    async newClient(id) {
        const clients = this.clients;
        const stats = this.stats;

        // can't ask for id already is use
        if (clients[id]) {
            id = hri.random();
        }

        const maxSockets = this.opt.max_tcp_sockets;
        const agent = new TunnelAgent({
            maxSockets: 10,
        });

        agent.on('online', () => {
            this.debug('client online %s', id);
        });

        agent.on('offline', () => {
            // TODO(roman): grace period for re-connecting
            // this period is short as the client is expected to maintain connections actively
            // if they client does not reconnect on a dropped connection they need to re-establish
            this.debug('client offline %s', id);
            this.removeClient(id);
        });

        // TODO(roman): an agent error removes the client, the user needs to re-connect?
        // how does a user realize they need to re-connect vs some random client being assigned same port?
        agent.once('error', (err) => {
            this.removeClient(id);
        });

        const client = new Client({ agent });

        // add to clients map immediately
        // avoiding races with other clients requesting same id
        clients[id] = client;

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

    removeClient(id) {
        const client = this.clients[id];
        if (!client) {
            return;
        }
        --this.stats.tunnels;
        delete this.clients[id];
        client.agent.destroy();
    }

    hasClient(id) {
        return this.clients[id];
    }

    getClient(id) {
        return this.clients[id];
    }
}

export default ClientManager;
