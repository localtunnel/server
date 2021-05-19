import request from 'supertest';
import assert from 'assert';
import WebSocket, {Server as WebSocketServer} from 'ws';
import net from 'net';
import jwt from 'jsonwebtoken';


import createServer from './server';

describe('Server', () => {
    it('server starts and stops', async () => {
        const server = createServer();
        await new Promise(resolve => server.listen(resolve));
        await new Promise(resolve => server.close(resolve));
    });

    it('should redirect root requests to landing page', async () => {
        const server = createServer();
        const res = await request(server).get('/');
        assert.equal('https://localtunnel.github.io/www/', res.headers.location);
    });

    it('should support custom base domains', async () => {
        const server = createServer({
            domain: 'domain.example.com',
        });

        const res = await request(server).get('/');
        assert.equal('https://localtunnel.github.io/www/', res.headers.location);
    });

    it('reject long domain name requests', async () => {
        const server = createServer();
        const res = await request(server).get('/thisdomainisoutsidethesizeofwhatweallowwhichissixtythreecharacters');
        assert.equal(res.body.message, 'Invalid subdomain. Subdomains must be lowercase and between 4 and 63 alphanumeric characters.');
    });

    it('reject request without jwt if required', async () => {
        const server = createServer({jwt_shared_secret: 'thekey'});
        const res = await request(server).get('/subdomain');
        assert.equal(res.status, 401);
    });

    it('reject request with invalid jwt if required', async () => {
        const server = createServer({jwt_shared_secret: 'thekey'});
        const jwtoken = jwt.sign({
            foo: 'bar'
        }, 'thebadkey');
        const res = await request(server).get('/subdomain').set('Authorization', `Bearer ${jwtoken}`);
        assert.equal(res.status, 401);
    });

    it('accept request with valid jwt if required', async () => {
        const server = createServer({jwt_shared_secret: 'thekey'});
        const jwtoken = jwt.sign({
            foo: 'bar'
        }, 'thekey');
        const res = await request(server).get('/subdomain').set('Authorization', `Bearer ${jwtoken}`);
        assert.equal(res.status, 200);
    });

    it('should upgrade websocket requests', async () => {
        const hostname = 'websocket-test';
        const server = createServer({
            domain: 'example.com',
        });
        await new Promise(resolve => server.listen(resolve));

        const res = await request(server).get('/websocket-test');
        const localTunnelPort = res.body.port;

        const wss = await new Promise((resolve) => {
            const wsServer = new WebSocketServer({ port: 0 }, () => {
                resolve(wsServer);
            });
        });

        const websocketServerPort = wss.address().port;

        const ltSocket = net.createConnection({ port: localTunnelPort });
        const wsSocket = net.createConnection({ port: websocketServerPort });
        ltSocket.pipe(wsSocket).pipe(ltSocket);

        wss.once('connection', (ws) => {
            ws.once('message', (message) => {
                ws.send(message);
            });
        });

        const ws = new WebSocket('http://localhost:' + server.address().port, {
            headers: {
                host: hostname + '.example.com',
            }
        });

        ws.on('open', () => {
            ws.send('something');
        });

        await new Promise((resolve) => {
            ws.once('message', (msg) => {
                assert.equal(msg, 'something');
                resolve();
            });
        });

        wss.close();
        await new Promise(resolve => server.close(resolve));
    });

    it('should support the /api/tunnels/:id/status endpoint', async () => {
        const server = createServer();
        await new Promise(resolve => server.listen(resolve));

        // no such tunnel yet
        const res = await request(server).get('/api/tunnels/foobar-test/status');
        assert.equal(res.statusCode, 404);

        // request a new client called foobar-test
        {
            const res = await request(server).get('/foobar-test');
        }

        {
            const res = await request(server).get('/api/tunnels/foobar-test/status');
            assert.equal(res.statusCode, 200);
            assert.deepEqual(res.body, {
                connected_sockets: 0,
            });
        }

        await new Promise(resolve => server.close(resolve));
    });

    it('should not support the /api/tunnels/:id/kill endpoint if jwt authorization is not enable on server', async () => {
        const server = createServer();
        await new Promise(resolve => server.listen(resolve));

        const res = await request(server).get('/api/tunnels/foobar-test/kill');
        assert.equal(res.statusCode, 403);
        assert.equal(res.text, 'jwt_shared_secret is not used');

        await new Promise(resolve => server.close(resolve));
    });

    it('should throw error when calling /api/tunnels/:id/kill endpoint if id does not exists', async () => {
        const server = createServer({jwt_shared_secret: 'thekey'});
        await new Promise(resolve => server.listen(resolve));

        {
          const jwtoken = jwt.sign({
            name: 'bar'
          }, 'thekey');
          await request(server).get('/foobar-test').set('Authorization', `Bearer ${jwtoken}`);
          // no such tunnel yet
          const res = await request(server).get('/api/tunnels/foobar-test2/kill').set('Authorization', `Bearer ${jwtoken}`);
          assert.equal(res.statusCode, 404);
          assert.equal(res.text, 'client with id foobar-test2 is not connected');
        }

        await new Promise(resolve => server.close(resolve));
    });

    it('should disconnect client when calling /api/tunnels/:id/kill endpoint', async () => {
        const server = createServer({jwt_shared_secret: 'thekey'});
        await new Promise(resolve => server.listen(resolve));

        {
          const jwtoken = jwt.sign({
            name: 'bar'
          }, 'thekey');
          await request(server).get('/foobar-test').set('Authorization', `Bearer ${jwtoken}`);

          const res = await request(server).get('/api/tunnels/foobar-test/kill').set('Authorization', `Bearer ${jwtoken}`);
          assert.equal(res.statusCode, 200);
          assert.equal(res.text, '{"success":true,"message":"client with id foobar-test is disconected"}');
          const statusResult = await request(server).get('/api/tunnels/foobar-test/status').set('Authorization', `Bearer ${jwtoken}`);
          assert.equal(statusResult.text, 'Not Found');
        }

        await new Promise(resolve => server.close(resolve));
    });
});
