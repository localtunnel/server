import { newLogger } from './logger.js';

export default class PortManager {

  private logger = newLogger(PortManager.name)

  private range?: string
  
  private first?: number
  private last?: number

  private readonly pool: Record<string, string|null> = {}

  constructor(opt?: {range?: string}) {
    this.range = opt.range;
    this.initializePool();
  }

  getRange() {
    return this.range || null
  }

  getFirst() {
    return this.first || null
  }

  getLast() {
    return this.last || null
  }

  initializePool() {
    if (!this.range) {
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

    this.logger.debug(`Pool initialized with ${Object.keys(this.pool).length} ports`);
  }

  release(port: number) {
    if (!this.range) {
      return;
    }
    this.logger.debug(`Release port ${port}`);
    this.pool['_' + port] = null;
  }

  getNextAvailable(clientId: string) {
    if (!this.range) {
      return undefined
    }

    for (let port = this.first; port <= this.last; port++) {
      if (this.pool['_' + port] === null) {
        this.pool['_' + port] = clientId;
        this.logger.debug(`Port found ${port}`);
        return port;
      }
    }

    this.logger.debug('No more ports available ');
    throw new Error('No more ports available in range ' + this.range);
  }
}
