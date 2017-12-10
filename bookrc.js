/// bookrc logging setup
const log = require('book').default();

process.on('uncaughtException', (err) => {
    log.error(err);
    process.exit(1);
});

module.exports = log;

