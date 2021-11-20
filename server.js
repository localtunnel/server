const Koa = require('koa');
const Debug = require('debug');
const http = require('http');
const Router = require('koa-router');

const ClientManager = require('./lib/ClientManager');

const debug = Debug('localtunnel:server');
let counter = 0;
module.exports = function(opt) {
    opt = opt || {};

    const landingPage = opt.landing || 'https://localtunnel.github.io/www/';

    const manager = new ClientManager(opt);

    const schema = opt.secure ? 'https' : 'http';

    const app = new Koa();
    const router = new Router();

    router.get('/api/status', async (ctx, next) => {
        counter += 1;
        const stats = manager.stats;
        ctx.body = {
            tunnels: stats.tunnels,
            mem: process.memoryUsage(),
            counter,
        };
    });

    router.get('/api/tunnels/:id/status', async (ctx, next) => {
        const clientId = ctx.params.id;
        const client = manager.getClient(clientId);
        if (!client) {
            ctx.throw(404);
            return;
        }

        const stats = client.stats();
        ctx.body = {
            connected_sockets: stats.connectedSockets,
        };
    });

    app.use(router.routes());
    app.use(router.allowedMethods());

    app.use(async (ctx) => {
        const newReqId = ctx.query['new'];
        const parts = ctx.originalUrl.split('/')
        const reqId = parts[1]

        if(reqId && !newReqId) {
            ctx.status = 404;
            ctx.body = {
                message: `id: ${reqId}, not found`,
            };
            return;
        }
        if (!newReqId) {
            ctx.redirect(landingPage);
            return;
        }

        // limit requested hostnames to 63 characters
        if (! /^(?:[a-z0-9][a-z0-9\-]{4,63}[a-z0-9]|[a-z0-9]{4,63})$/.test(newReqId)) {
            const msg = 'Invalid subdomain. Subdomains must be lowercase and between 4 and 63 alphanumeric characters.';
            ctx.status = 403;
            ctx.body = {
                message: msg,
            };
            return;
        }

        debug('making new client with id %s', newReqId);
        const info = await manager.newClient(newReqId);
        if(!info) {
            ctx.status = 500;
            ctx.body = {
                message: 'no new client info',
            };
            return;
        }
        const url = `${schema}://${ctx.request.host}/${info.id}`;
        info.url = url;
        ctx.body = info;
        return;
    });

    const server = http.createServer();

    const appCallback = app.callback();

    server.on('request', (req, res) => {        
        const parts = req.url.split('/');
        if(parts[1].indexOf('?new=') === 0){
            appCallback(req, res);
            return;
        }
        const clientId = parts[1];

        if (!clientId) {
            appCallback(req, res);
            return;
        }

        const client = manager.getClient(clientId);
        if (!client) {
            appCallback(req, res);
            return;
        }

        client.handleRequest(req, res);
    });

    server.on('upgrade', (req, socket) => {
        const parts = req.url.split('/').filter((part=>part != ''));
        const clientId = parts[0];

        if (!clientId) {
            socket.destroy();
            return;
        }
        
        const client = manager.getClient(clientId);
        if (!client) {
            socket.destroy();
            return;
        }

        client.handleUpgrade(req, socket);
    });

    return server;
};
