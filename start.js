import { debug } from 'book';
import CreateServer from './server.js';

const server = CreateServer({
    // max_tcp_sockets: argv['max-sockets'],
    // secure: argv.secure,
    // domain: argv.domain,
});

const PORT = process.env.PORT || 80;

server.listen(PORT, () => {
    debug('server listening on port: %d', server.address().port);
});
