import http from 'http';

import TunnelAgent from './TunnelAgent';

// A client encapsulates req/res handling using an agent
//
// If an agent is destroyed, the request handling will error
// The caller is responsible for handling a failed request
class Client {
    constructor(options) {
        this.agent = options.agent;
    }

    handleRequest(req, res) {
        const opt = {
            path: req.url,
            agent: this.agent,
            method: req.method,
            headers: req.headers
        };

        const clientReq = http.request(opt, (clientRes) => {
            // write response code and headers
            res.writeHead(clientRes.statusCode, clientRes.headers);
            clientRes.pipe(res);
        });

        // this can happen when underlying agent produces an error
        // in our case we 504 gateway error this?
        // if we have already sent headers?
        clientReq.once('error', (err) => {

        });

        req.pipe(clientReq);
    }

    handleUpgrade(req, socket) {
        this.agent.createConnection({}, (err, conn) => {
            // any errors getting a connection mean we cannot service this request
            if (err) {
                socket.end();
                return;
            }

            // socket met have disconnected while we waiting for a socket
            if (!socket.readable || !socket.writable) {
                socket.end();
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

            conn.pipe(socket).pipe(conn);
            conn.write(arr.join('\r\n'));
        });
    }
}

export default Client;