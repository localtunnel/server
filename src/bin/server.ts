#!./node_modules/.bin/tsx

import 'dotenv/config';

import { InvalidArgumentError, program } from 'commander';
import { AddressInfo } from 'net';
import pkg from '../../package.json' with { type: "json" };
import createServer from '../server.js';
import { newLogger } from '../lib/logger.js';

const logger = newLogger('server')

type CliOpts = {
  secure: boolean
  port: number
  address: string,
  domain: string,
  landing: string,
  maxSockets: number,
  range: string,
  secret: string,
}

const runServer = (opts: CliOpts) => {

  const server = createServer({
    max_tcp_sockets: opts.maxSockets,
    secure: opts.secure,
    domain: opts.domain,
    landing: opts.landing,
    secret: opts.secret,
  });

  server.listen(opts.port, opts.address, () => {
    const addr = server.address() as AddressInfo
    logger.info(`server listening on port: ${addr.port}`);
  });

  process.on('SIGINT', () => {
    // for nodemon to reload https://github.com/remy/nodemon#gracefully-reloading-down-your-script
    process.kill(process.pid, "SIGTERM");
  });

  process.on('uncaughtException', (err) => {
    logger.error(`uncaughtException: ${err.message}`);
    logger.debug(err.stack);
    process.exit(1)
  });

  process.on('unhandledRejection', (reason: string, promise: Promise<unknown>) => {
    logger.error(`unhandledRejection: ${reason}`);
    process.exit(1)
  });

}

const main = async () => {

  const intParser = (value: string) => {
    const parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue)) {
      throw new InvalidArgumentError('Not a number.');
    }
    return parsedValue;
  }

  const rangeParser = (value: string) => {
    if (!value) return undefined
    const [rangeFrom, rangeTo] = value.split(':').map(r => parseInt(r, 10))
    if (isNaN(rangeFrom) || isNaN(rangeTo)) {
      throw new InvalidArgumentError('Range is not valid');
    }

    if (rangeFrom > rangeTo) {
      throw new Error('Bad range expression min > max: ' + value);
    }

    return value;
  }

  program
    .name('localtunnel-server')
    .description('localtunnel server')
    .version(pkg.version)
    .option('--secure', 'use this flag to indicate proxy over https', false)
    
    .option('--port, -p <number>', 'listen on this port for outside requests', intParser, 80)
    .option('--address, -a <string>', 'IP address to bind to', '0.0.0.0')
    
    .option('--domain, -d <string>', 'Specify the base domain name. This is optional if hosting localtunnel from a regular example.com domain. This is required if hosting a localtunnel server from a subdomain (i.e. lt.example.dom where clients will be client-app.lt.example.com)')
    .option('--landing, -l <string>', 'The landing page for redirect from root domain', 'https://localtunnel.github.io/www/')
    
    .option('--max-sockets', 'maximum number of tcp sockets each client is allowed to establish at one time (the tunnels)', intParser, 10)
    .option('--range, -r <string>', 'bind incoming connections on ports specified in range xxxx:xxxx', rangeParser, undefined)
    .option('--secret, -s <string>', 'JWT shared secret used to encode tokens')
    
    .action(runServer)

  program.parse();
}

main().catch(e => logger.error(e))
