/// bookrc logging setup
const log = require('book').default();

//log.use(require('book-git')(__dirname));
log.use(require('book-raven')(process.env.SENTRY_DSN));

process.on('uncaughtException', function(err) {
    log.error(err);
    console.error(err);
    process.exit(1);
});

module.exports = log;

