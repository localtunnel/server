import Debug from 'debug';

class PortManager {
  constructor(opt) {
    this.debug = Debug('lt:PortManager');
    this.range = opt.range || null;
    this.first = null;
    this.last = null;
    this.pool = {};
    this.initializePool();
  }

  initializePool() {
    if (this.range === null) {
      return;
    }

    if (!/^[0-9]+:[0-9]+$/.test(this.range)) {
      throw new Error('Bad range expression: ' + this.range);
    }

    [this.first, this.last] = this.range.split(':').map((port) => parseInt(port));

    if (this.first > this.last) {
      throw new Error('Bad range expression min > max: ' + this.range);
    }

    for (let port = this.first; port <= this.last; port++) {
      this.pool['_' + port] = null;
    }
    this.debug = Debug('lt:PortManager');
    this.debug('Pool initialized ' + JSON.stringify(this.pool));
  }

  release(port) {
    if (this.range === null) {
      return;
    }
    this.debug('Release port ' + port);
    this.pool['_' + port] = null;
  }

  getNextAvailable(clientId) {
    if (this.range === null) {
      return null;
    }

    for (let port = this.first; port <= this.last; port++) {
      if (this.pool['_' + port] === null) {
        this.pool['_' + port] = clientId;
        this.debug('Port found ' + port);
        return port;
      }
    }
    this.debug('No more ports available ');
    throw new Error('No more ports available in range ' + this.range);
  }
}

export default PortManager;
