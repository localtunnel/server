import log from 'book';
import Koa from 'koa';
import tldjs from 'tldjs';
import on_finished from 'on-finished';
import Debug from 'debug';
import http from 'http';
import Promise from 'bluebird';

import Proxy from './lib/Proxy';
import rand_id from './lib/rand_id';
import BindingAgent from './lib/BindingAgent';

const debug = Debug('localtunnel:server');

const PRODUCTION = process.env.NODE_ENV === 'production';

// id -> client http server
const clients = Object.create(null);

// proxy statistics
const stats = {
    tunnels: 0
};

// handle proxying a request to a client
// will wait for a tunnel socket to become available
function DoBounce(req, res, sock) {
    req.on('error', (err) => {
        console.error('request', err);
    });

    if (res) {
        res.on('error', (err) => {
            console.error('response', err);
        });
    }

    if (sock) {
        sock.on('error', (err) => {
            console.error('response', err);
        });
    }

    // without a hostname, we won't know who the request is for
    const hostname = req.headers.host;
    if (!hostname) {
        return false;
    }

    const subdomain = tldjs.getSubdomain(hostname);
    if (!subdomain) {
        return false;
    }

    const client = clients[subdomain];

    // no such subdomain
    // we use 502 error to the client to signify we can't service the request
    if (!client) {
        if (res) {
            res.statusCode = 502;
            res.end(`no active client for '${subdomain}'`);
            req.connection.destroy();
        }
        else if (sock) {
            sock.destroy();
        }

        return true;
    }

    let finished = false;
    if (sock) {
        sock.once('end', function() {
            finished = true;
        });
    }
    else if (res) {
        // flag if we already finished before we get a socket
        // we can't respond to these requests
        on_finished(res, function(err) {
            finished = true;
            req.connection.destroy();
        });
    }
    // not something we are expecting, need a sock or a res
    else {
        req.connection.destroy();
        return true;
    }

    // TODO add a timeout, if we run out of sockets, then just 502

    // get client port
    client.next_socket(async (socket) => {
        // the request already finished or client disconnected
        if (finished) {
            return;
        }

        // happens when client upstream is disconnected (or disconnects)
        // and the proxy iterates the waiting list and clears the callbacks
        // we gracefully inform the user and kill their conn
        // without this, the browser will leave some connections open
        // and try to use them again for new requests
        // we cannot have this as we need bouncy to assign the requests again
        // TODO(roman) we could instead have a timeout above
        // if no socket becomes available within some time,
        // we just tell the user no resource available to service request
        else if (!socket) {
            if (res) {
                res.statusCode = 504;
                res.end();
            }

            if (sock) {
                sock.destroy();
            }

            req.connection.destroy();
            return;
        }

        // websocket requests are special in that we simply re-create the header info
        // and directly pipe the socket data
        // avoids having to rebuild the request and handle upgrades via the http client
        if (res === null) {
            const arr = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
            for (let i=0 ; i < (req.rawHeaders.length-1) ; i+=2) {
                arr.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i+1]}`);
            }

            arr.push('');
            arr.push('');

            socket.pipe(sock).pipe(socket);
            socket.write(arr.join('\r\n'));

            await new Promise((resolve) => {
                socket.once('end', resolve);
            });

            return;
        }

        // regular http request

        const agent = new BindingAgent({
            socket: socket
        });

        const opt = {
            path: req.url,
            agent: agent,
            method: req.method,
            headers: req.headers
        };

        await new Promise((resolve) => {
            // what if error making this request?
            const client_req = http.request(opt, function(client_res) {
                // write response code and headers
                res.writeHead(client_res.statusCode, client_res.headers);

                client_res.pipe(res);
                on_finished(client_res, function(err) {
                    resolve();
                });
            });

            // happens if the other end dies while we are making the request
            // so we just end the req and move on
            // we can't really do more with the response here because headers
            // may already be sent
            client_req.on('error', (err) => {
                req.connection.destroy();
            });

            req.pipe(client_req);
        });
    });

    return true;
}

// create a new tunnel with `id`
// if the id is already used, a random id is assigned
const NewClient = async (id, opt) => {
    // can't ask for id already is use
    if (clients[id]) {
        id = rand_id();
    }

    const popt = {
        id: id,
        max_tcp_sockets: opt.max_tcp_sockets
    };

    const client = Proxy(popt);

    // add to clients map immediately
    // avoiding races with other clients requesting same id
    clients[id] = client;

    client.on('end', function() {
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

module.exports = function(opt) {
    opt = opt || {};

    const schema = opt.secure ? 'https' : 'http';

    const app = new Koa();

    // api status endpoint
    app.use(async (ctx, next) => {
        const path = ctx.request.path;
        if (path !== '/api/status') {
            await next();
            return;
        }

        ctx.body = {
            tunnels: stats.tunnels,
            mem: process.memoryUsage(),
        };
    });

    // root endpoint
    app.use(async (ctx, next) => {
        const path = ctx.request.path;

        // skip anything not on the root path
        if (path !== '/') {
            await next();
            return;
        }

        const isNewClientRequest = ctx.query['new'] !== undefined;
        if (isNewClientRequest) {
            const req_id = rand_id();
            debug('making new client with id %s', req_id);
            const info = await NewClient(req_id, opt);

            const url = schema + '://' + info.id + '.' + ctx.request.host;
            info.url = url;
            ctx.body = info;
            return;
        }

        // no new client request, send to landing page
        ctx.redirect('https://localtunnel.github.io/www/');
    });

    // anything after the / path is a request for a specific client name
    // This is a backwards compat feature
    app.use(async (ctx, next) => {
        const parts = ctx.request.path.split('/');

        // any request with several layers of paths is not allowed
        // rejects /foo/bar
        // allow /foo
        if (parts.length !== 2) {
            await next();
            return;
        }

        const req_id = parts[1];

        // limit requested hostnames to 63 characters
        if (! /^[a-z0-9]{4,63}$/.test(req_id)) {
            const msg = 'Invalid subdomain. Subdomains must be lowercase and between 4 and 63 alphanumeric characters.';
            ctx.status = 403;
            ctx.body = {
                message: msg,
            };
            return;
        }

        debug('making new client with id %s', req_id);
        const info = await NewClient(req_id, opt);

        const url = schema + '://' + info.id + '.' + ctx.request.host;
        info.url = url;
        ctx.body = info;
        return;
    });

    const server = http.createServer();

    const appCallback = app.callback();
    server.on('request', (req, res) => {
        if (DoBounce(req, res, null)) {
            return;
        }

        appCallback(req, res);
    });

    server.on('upgrade', (req, socket, head) => {
        if (DoBounce(req, null, socket)) {
            return;
        };

        socket.destroy();
    });

    return server;
};
