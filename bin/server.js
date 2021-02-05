import 'localenv';
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import log from 'book';
import Debug from 'debug';
import CreateServer from '../server';

const debug = Debug('localtunnel');

const DEFAULT_MIN_PORT = 8000;
const DEFAULT_MAX_PORT = 65535;

const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 <command> [option]')
  .option('secure', {
    alias: 's',
    type: 'boolean',
    default: false,
    description: 'Use this flag to indicate proxy over https'
  })
  .option('port', {
    alias: 'p',
    type: 'number',
    default: 80,
    description: 'Listen on this port for outside requests'
  })
  .option('address', {
    default: '0.0.0.0',
    description: 'IP address to bind to'
  })
  .option('domain', {
    type: 'string',
    description: 'Specify the base domain name. This is optional if hosting localtunnel from a regular example.com domain. This is required if hosting a localtunnel server from a subdomain (i.e. lt.example.dom where clients will be client-app.lt.example.come)',
  })
  .option('max-sockets', {
    default: 10,
    type: 'count',
    description: 'Maximum number of tcp sockets each client is allowed to establish at one time (the tunnels)'
  })
  .option('min-port', {
    default: DEFAULT_MIN_PORT,
    type: 'number',
    description: 'The minimum number of TCP ports to use for the localtunnel clients connecting to the server.'
  })
  .option('max-port', {
    default: DEFAULT_MAX_PORT,
    type: 'number',
    description: 'The maximum number of TCP ports to use for the localtunnel clients connecting to the server.'
  })
  .argv;

const minPort = argv['min-port'];
const maxPort = argv['max-port'];

const { address, port, secure, domain, maxSockets } = argv;

if (Number.isInteger(minPort) && minPort < DEFAULT_MIN_PORT) {
  console.error(`min-port must be a number greater than ${DEFAULT_MIN_PORT}`);
  process.exit();
} else if (Number.isInteger(maxPort) && maxPort > DEFAULT_MAX_PORT) {
  console.error(`max-port must be a number less than ${DEFAULT_MAX_PORT}`);
  process.exit();
} else if (minPort >= maxPort) {
  console.error(`min-port must be less than min-port`);
  process.exit();
}

const server = CreateServer({
  maxTcpSockets: maxSockets,
  secure,
  domain,
  minPort,
  maxPort,
});

server.listen(port, address, () => {
  debug('server listening on port: %d', server.address().port);
});

process.on('SIGINT', () => {
  process.exit();
});

process.on('SIGTERM', () => {
  process.exit();
});

process.on('uncaughtException', (err) => {
  log.error(err);
});

process.on('unhandledRejection', (reason) => {
  log.error(reason);
});
