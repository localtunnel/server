/// bookrc logging setup
var log = require('book').default();
require('superstack');

log.use(require('book-git')(__dirname));
log.use(require('book-raven')(process.env.SENTRY_DSN));

process.on('uncaughtException', function(err) {
    log.panic(err);
    setTimeout(process.exit.bind(process, 1), 2000);
});

module.exports = log;

