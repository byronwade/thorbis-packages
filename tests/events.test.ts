import { describe, it, expect } from 'vitest';
import { EventEmitter } from '../src/events/index';

describe('EventEmitter', () => {
  it('should emit and receive events', () => {
    const emitter = new EventEmitter();
    let received = false;

    emitter.on('test', () => {
      received = true;
    });

    emitter.emit('test');
    expect(received).toBe(true);
  });

  it('should pass arguments to event handlers', () => {
    const emitter = new EventEmitter();
    let receivedArgs: unknown[] = [];

    emitter.on('test', (...args: unknown[]) => {
      receivedArgs = args;
    });

    emitter.emit('test', 1, 'two', { three: 3 });
    expect(receivedArgs).toEqual([1, 'two', { three: 3 }]);
  });
});
