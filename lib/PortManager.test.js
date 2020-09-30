import assert from 'assert';

import PortManager from './PortManager';

describe('PortManager', () => {
    it('should construct with no range', () => {
      const portManager = new PortManager({});
      assert.equal(portManager.range, null);
      assert.equal(portManager.first, null);
      assert.equal(portManager.last, null);
    });

    it('should construct with range', () => {
      const portManager = new PortManager({range: '10:20'});
      assert.equal(portManager.range, '10:20');
      assert.equal(portManager.first, 10);
      assert.equal(portManager.last, 20);
    });

    it('should not construct with bad range expression', () => {
      assert.throws(()=>{
        new PortManager({range: 'a1020'});
      }, /Bad range expression: a1020/)
    });

    it('should not construct with bad range max>min', () => {
      assert.throws(()=>{
        new PortManager({range: '20:10'});
      }, /Bad range expression min > max: 20:10/)
    });

    it('should work has expected', async () => {
      const portManager = new PortManager({range: '10:12'});
      assert.equal(10,portManager.getNextAvailable('a'));
      assert.equal(11,portManager.getNextAvailable('b'));
      assert.equal(12,portManager.getNextAvailable('c'));

      assert.throws(()=>{
        portManager.getNextAvailable();
      }, /No more ports available in range 10:12/)

      portManager.release(11);
      assert.equal(11,portManager.getNextAvailable('bb'));

      portManager.release(10);
      portManager.release(12);

      assert.equal(10,portManager.getNextAvailable('cc'));
      assert.equal(12,portManager.getNextAvailable('dd'));
    });
});
