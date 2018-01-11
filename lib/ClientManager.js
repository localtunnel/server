import Proxy from './Proxy';

// maybe remove?
import on_finished from 'on-finished';
import http from 'http';
import pump from 'pump';
import { hri } from "human-readable-ids";

import BindingAgent from './BindingAgent';

const NoOp = () => {};

// Manage sets of clients
//
// A client is a "user session" established to service a remote localtunnel client
class ClientManager {
    constructor(opt) {
        this.opt = opt;

        this.reqId = 0;

        // id -> client instance
        this.clients = Object.create(null);

        // statistics
        this.stats = {
            tunnels: 0
        };
    }

    // create a new tunnel with `id`
    // if the id is already used, a random id is assigned
    async newClient (id) {
        const clients = this.clients;
        const stats = this.stats;

        // can't ask for id already is use
        if (clients[id]) {
            id = hri.random();
        }

        const popt = {
            id: id,
            max_tcp_sockets: this.opt.max_tcp_sockets
        };

        const client = Proxy(popt);

        // add to clients map immediately
        // avoiding races with other clients requesting same id
        clients[id] = client;

        client.on('end', () => {
            --stats.tunnels;
            delete clients[id];
        });

        return new Promise((resolve, reject) => {
            // each local client has a tcp server to link with the remove localtunnel client
            // this starts the server and waits until it is listening
            client.start((err, info) => {
                if (err) {
                    // clear the reserved client id
                    delete clients[id];
                    reject(err);
                    return;
                }

                ++stats.tunnels;
                info.id = id;
                resolve(info);
            });
        });
    }

    hasClient(id) {
        return this.clients[id];
    }

    // handle http request
    handleRequest(clientId, req, res) {
        const client = this.clients[clientId];
        if (!client) {
            return;
        }

        const reqId = this.reqId;
        this.reqId = this.reqId + 1;

        let endRes = () => {
            endRes = NoOp;
            res.end();
        };

        on_finished(res, () => {
            endRes = NoOp;
        });

        client.nextSocket((clientSocket) => {
            // response ended before we even got a socket to respond on
            if (endRes === NoOp) {
                return;
            }

            // happens when client upstream is disconnected (or disconnects)
            // and the proxy iterates the waiting list and clears the callbacks
            // we gracefully inform the user and kill their conn
            // without this, the browser will leave some connections open
            // and try to use them again for new requests
            // TODO(roman) we could instead have a timeout above
            // if no socket becomes available within some time,
            // we just tell the user no resource available to service request
            if (!clientSocket) {
                endRes();
                return;
            }

            const agent = new BindingAgent({
                socket: clientSocket,
            });

            const opt = {
                path: req.url,
                agent: agent,
                method: req.method,
                headers: req.headers
            };

            return new Promise((resolve) => {
                // what if error making this request?
                const clientReq = http.request(opt, (clientRes) => {
                    // write response code and headers
                    res.writeHead(clientRes.statusCode, clientRes.headers);

                    // when this pump is done, we end our response
                    pump(clientRes, res, (err) => {
                        endRes();
                        resolve();
                    });
                });

                // we don't care about when this ends, only if there is error
                pump(req, clientReq, (err) => {
                    if (err) {
                        endRes();
                        resolve();
                    }
                });
            });
        });
    }

    // handle http upgrade
    handleUpgrade(clientId, req, sock) {
        const client = this.clients[clientId];
        if (!client) {
            return;
        }

        client.nextSocket(async (clientSocket) => {
            if (!sock.readable || !sock.writable) {
                sock.end();
                return;
            }

            // happens when client upstream is disconnected (or disconnects)
            // and the proxy iterates the waiting list and clears the callbacks
            // we gracefully inform the user and kill their conn
            // without this, the browser will leave some connections open
            // and try to use them again for new requests
            // TODO(roman) we could instead have a timeout above
            // if no socket becomes available within some time,
            // we just tell the user no resource available to service request
            if (!clientSocket) {
                sock.end();
                return;
            }

            // websocket requests are special in that we simply re-create the header info
            // then directly pipe the socket data
            // avoids having to rebuild the request and handle upgrades via the http client
            const arr = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
            for (let i=0 ; i < (req.rawHeaders.length-1) ; i+=2) {
                arr.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i+1]}`);
            }

            arr.push('');
            arr.push('');

            clientSocket.pipe(sock).pipe(clientSocket);
            clientSocket.write(arr.join('\r\n'));

            await new Promise((resolve) => {
                sock.once('end', resolve);
            });
        });
    }
}

export default ClientManager;
