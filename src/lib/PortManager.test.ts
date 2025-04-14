import assert from 'assert';

import PortManager from './PortManager.js';

describe('PortManager', function() {
  it('should construct with no range', function() {
    const portManager = new PortManager({});
    assert.equal(portManager.getRange(), null);
    assert.equal(portManager.getFirst(), null);
    assert.equal(portManager.getLast(), null);
  });

  it('should construct with range', function() {
    const portManager = new PortManager({range: '10:20'});
    assert.equal(portManager.getRange(), '10:20');
    assert.equal(portManager.getFirst(), 10);
    assert.equal(portManager.getLast(), 20);
  });

  it('should not construct with bad range expression', function() {
    assert.throws(()=>{
      new PortManager({range: 'a1020'});
    }, /Bad range expression: a1020/)
  });

  it('should not construct with bad range max>min', function() {
    assert.throws(()=>{
      new PortManager({range: '20:10'});
    }, /Bad range expression min > max: 20:10/)
  });

  it('should work has expected', async function() {
    const portManager = new PortManager({range: '10:12'});
    assert.equal(10,portManager.getNextAvailable('a'));
    assert.equal(11,portManager.getNextAvailable('b'));
    assert.equal(12,portManager.getNextAvailable('c'));

    assert.throws(()=>{
      portManager.getNextAvailable('d');
    }, /No more ports available in range 10:12/)

    portManager.release(11);
    assert.equal(11,portManager.getNextAvailable('bb'));

    portManager.release(10);
    portManager.release(12);

    assert.equal(10,portManager.getNextAvailable('cc'));
    assert.equal(12,portManager.getNextAvailable('dd'));
  });
});