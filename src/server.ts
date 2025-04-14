import http from 'http';
import { hri } from 'human-readable-ids';
import Koa, { Request } from 'koa';
import jwt from 'koa-jwt';
import Router from 'koa-router';
import { Duplex } from 'stream';
import tldjs from 'tldjs';
import ClientManager from './lib/ClientManager.js';
import { newLogger } from './lib/logger.js';

const logger = newLogger('localtunnel');

type LocalTunnelOpts = {
  domain?: string
  landing?: string
  secure?: boolean
  max_tcp_sockets?: number
  secret?: string
}

export default function(opt?: LocalTunnelOpts) {
  opt = opt || {};

  const validHosts = (opt.domain) ? [opt.domain] : ['localhost'];
  const myTldjs = tldjs.fromUserSettings({ validHosts });
  const landingPage = opt.landing || 'https://localtunnel.github.io/www/';

  function GetClientIdFromHostname(hostname) {
    const pieces = hostname.split(':');
    return myTldjs.getSubdomain(pieces[0]);
  }

  const manager = new ClientManager(opt);

  const schema = opt.secure ? 'https' : 'http';

  const app = new Koa();
  const router = new Router();

  if (opt.secret) {
    app.use(jwt({
      secret: opt.secret
    }));
  }

  router.get('/api/status', async (ctx, next) => {
    const stats = manager.getStats();
    ctx.body = {
      tunnels: stats.tunnels,
      mem: process.memoryUsage(),
    };
  });

  router.post('/api/tunnels/:id/kill', async (ctx, next) => {
    const clientId = ctx.params.id;
    if (!opt.secret){
      logger.debug(`secret is missing`);
      ctx.throw(403, {
        success: false,
        message: 'secret is missing'
      });
      return;
    }

    if (!manager.hasClient(clientId)) {
      logger.debug(`client is not connected`);
      ctx.throw(404, {
        success: false,
        message: `client with id ${clientId} is not connected`
      });
    }

    const token = ctx.request.headers.authorization;
    if (!manager.getClient(clientId).isSecurityTokenEqual(token)) {
      logger.debug(`token is not equal`);
      ctx.throw(403, {
        success: false,
        message: `client with id ${clientId} has not the same securityToken than ${token}`
      });
    }

    logger.debug(`disconnecting client with id ${clientId}`);
    manager.removeClient(clientId);

    ctx.status = 200;
    ctx.body = {
      success: true,
      message: `client with id ${clientId} is disconected`
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
      const reqId = hri.random();
      logger.debug(`making new client with id ${reqId}`);
      const info = await manager.newClient(reqId, opt.secret ? ctx.request.headers.authorization : undefined);

      const url = schema + '://' + info.id + '.' + ctx.request.host;
      info.url = url;
      ctx.body = info;
      return;
    }

    // no new client request, send to landing page
    ctx.redirect(landingPage);
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

    const reqId = parts[1];

    // limit requested hostnames to 63 characters
    if (! /^(?:[a-z0-9][a-z0-9-]{4,63}[a-z0-9]|[a-z0-9]{4,63})$/.test(reqId)) {
      const msg = 'Invalid subdomain. Subdomains must be lowercase and between 4 and 63 alphanumeric characters.';
      ctx.status = 403;
      ctx.body = {
        message: msg,
      };
      return;
    }

    logger.debug(`making new client with id ${reqId}`);
    const info = await manager.newClient(reqId, opt.secret ? ctx.request.headers.authorization : undefined);

    const url = schema + '://' + info.id + '.' + ctx.request.host;
    info.url = url;
    ctx.body = info;
    return;
  });

  const server = http.createServer();

  const appCallback = app.callback();

  server.on('request', (req, res) => {
    // without a hostname, we won't know who the request is for
    const hostname = req.headers.host;
    if (!hostname) {
      res.statusCode = 400;
      res.end('Host header is required');
      return;
    }

    const clientId = GetClientIdFromHostname(hostname);
    if (!clientId) {
      appCallback(req, res);
      return;
    }

    const client = manager.getClient(clientId);
    if (!client) {
      res.statusCode = 404;
      res.end('404');
      return;
    }

    client.handleRequest(req, res);
  });

    
  server.on('upgrade', (req: Request, socket: Duplex, head: Buffer) => {
    const hostname = req.headers.host;
    if (!hostname) {
      socket.destroy();
      return;
    }

    const clientId = GetClientIdFromHostname(hostname);
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
